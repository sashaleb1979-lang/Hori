import type { GuildMember, Message } from "discord.js";
import { PermissionFlagsBits } from "discord.js";

import { trackIngestedMessage } from "@hori/analytics";
import { DEFAULT_DEBOUNCE, IntentRouter, createChannelDebouncer, detectMessageKind, evaluateSelectiveEngagement, implicitMentionKindWhen, planNaturalMessageSplit, resolveActivation, shouldDebounce } from "@hori/core";
import { type BotReplyPayload, type MessageEnvelope, type ReplyQueueTrace, type TriggerSource } from "@hori/shared";

import type { BotRuntime } from "../bootstrap";
import { enqueueBackgroundJobs } from "./background-jobs";
import { getOwnerLockdownState, isBotOwner } from "./owner-lockdown";
import { sendReply } from "../responders/message-responder";

const intentRouter = new IntentRouter();
const inboundDebouncers = new Map<string, ReturnType<typeof createChannelDebouncer<PendingInvocation>>>();
const naturalSplitCooldownByChannel = new Map<string, number>();

/* Periodic cleanup of idle debouncers and stale cooldown entries to prevent memory leaks */
const DEBOUNCER_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const COOLDOWN_MAX_AGE_MS = 30 * 60 * 1000;

setInterval(() => {
  for (const [channelId, debouncer] of inboundDebouncers) {
    if (debouncer.pending === 0) {
      void debouncer.flushNow();
      inboundDebouncers.delete(channelId);
    }
  }

  const cutoff = Date.now() - COOLDOWN_MAX_AGE_MS;
  for (const [channelId, ts] of naturalSplitCooldownByChannel) {
    if (ts < cutoff) {
      naturalSplitCooldownByChannel.delete(channelId);
    }
  }
}, DEBOUNCER_CLEANUP_INTERVAL_MS).unref();
export const EMPTY_REPLY_FALLBACK = "Сек, у меня ответ развалился. Повтори ещё раз.";

interface PendingInvocation {
  runtime: BotRuntime;
  message: Message;
  routingConfig: Awaited<ReturnType<BotRuntime["runtimeConfig"]["getRoutingConfig"]>>;
  triggerSource?: TriggerSource;
}

function isBlankReplyText(value: string | null | undefined) {
  return !value || !value.trim();
}

export function prepareReplyForDelivery(reply: string | BotReplyPayload | null | undefined): string | BotReplyPayload {
  if (typeof reply === "string") {
    return isBlankReplyText(reply) ? EMPTY_REPLY_FALLBACK : reply;
  }

  if (!reply) {
    return EMPTY_REPLY_FALLBACK;
  }

  if (reply.media) {
    return reply;
  }

  return isBlankReplyText(reply.text)
    ? { ...reply, text: EMPTY_REPLY_FALLBACK }
    : reply;
}

function applyModerationReplacement(reply: string | BotReplyPayload | null | undefined, replacementText: string) {
  if (typeof reply === "string") {
    const base = reply.trim();
    return base ? `${base} ${replacementText}` : replacementText;
  }

  if (!reply) {
    return replacementText;
  }

  const base = reply.text.trim();
  return {
    ...reply,
    text: base ? `${base} ${replacementText}` : replacementText
  };
}

export async function resolveModerationReplyForDelivery(
  runtime: BotRuntime,
  message: Message,
  reply: string | BotReplyPayload | null | undefined,
  moderationAction?: { kind: "timeout"; durationMinutes: number; replacementText: string } | null
) {
  if (!moderationAction) {
    return reply;
  }

  if (moderationAction.kind !== "timeout") {
    return reply;
  }

  const timeoutApplied = await tryApplyModerationAction(runtime, message, moderationAction);
  return timeoutApplied ? applyModerationReplacement(reply, moderationAction.replacementText) : reply;
}

async function tryApplyModerationAction(
  runtime: BotRuntime,
  message: Message,
  action: { kind: "timeout"; durationMinutes: number }
) {
  if (!message.inGuild()) {
    return false;
  }

  if (action.kind !== "timeout") {
    return false;
  }

  try {
    const me = message.guild.members.me ?? (await message.guild.members.fetchMe());
    if (!me.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return false;
    }

    const targetMember = message.member ?? (await message.guild.members.fetch(message.author.id));
    if (!targetMember.moderatable) {
      return false;
    }

    await targetMember.timeout(Math.min(15, Math.max(1, action.durationMinutes)) * 60 * 1000, "Hori stage 4 aggression timeout");
    return true;
  } catch (error) {
    runtime.logger.warn(
      {
        error,
        guildId: message.guildId,
        channelId: message.channelId,
        userId: message.author.id,
        action: action.kind
      },
      "failed to apply moderation action"
    );
    return false;
  }
}

async function detectTriggerSource(message: Message, botName: string, botId: string): Promise<{ triggerSource?: TriggerSource; wasMentioned: boolean; implicitMentionKinds: Array<"reply_to_bot" | "name_in_text"> }> {
  const content = message.content.trim();

  if (message.mentions.has(botId)) {
    return { triggerSource: "mention", wasMentioned: true, implicitMentionKinds: [] };
  }

  if (message.reference?.messageId) {
    try {
      const referenced = await message.fetchReference();

      if (referenced.author.id === botId) {
        return { triggerSource: "reply", wasMentioned: false, implicitMentionKinds: ["reply_to_bot"] };
      }
    } catch {
      return { triggerSource: undefined, wasMentioned: false, implicitMentionKinds: [] };
    }
  }

  if (new RegExp(`^${escapeRegExp(botName)}[,:!\\s-]*`, "i").test(content)) {
    return { triggerSource: "name", wasMentioned: false, implicitMentionKinds: ["name_in_text"] };
  }

  return { triggerSource: undefined, wasMentioned: false, implicitMentionKinds: [] };
}

async function shouldAutoInterject(
  runtime: BotRuntime,
  message: Message,
  routingConfig: Awaited<ReturnType<BotRuntime["runtimeConfig"]["getRoutingConfig"]>>
) {
  if (!message.guildId) {
    return false;
  }

  const relationship = await runtime.prisma.relationshipProfile.findUnique({
    where: {
      guildId_userId: {
        guildId: message.guildId,
        userId: message.author.id
      }
    },
    select: {
      doNotInitiate: true,
      proactivityPreference: true,
      interruptPriority: true
    }
  });
  const decision = evaluateSelectiveEngagement({
    content: message.content,
    enabled: routingConfig.featureFlags.selectiveEngagementEnabled,
    autoInterjectEnabled: routingConfig.featureFlags.autoInterject,
    channelAllowsInterjections: routingConfig.channelPolicy.allowInterjections,
    channelMuted: routingConfig.channelPolicy.isMuted,
    hasAttachments: message.attachments.size > 0,
    interjectTendency: routingConfig.guildSettings.interjectTendency,
    relationshipDoNotInitiate: relationship?.doNotInitiate,
    relationshipProactivityPreference: relationship?.proactivityPreference,
    relationshipInterruptPriority: relationship?.interruptPriority,
    minScore: runtime.env.SELECTIVE_ENGAGEMENT_MIN_SCORE
  });

  if (!decision.shouldInterject) {
    return false;
  }

  const recentCount = await runtime.prisma.interjectionLog.count({
    where: {
      guildId: message.guildId,
      channelId: message.channelId,
      createdAt: {
        gte: new Date(Date.now() - 60 * 60 * 1000)
      }
    }
  });

  if (recentCount >= runtime.env.AUTOINTERJECT_MAX_PER_HOUR) {
    return false;
  }

  const recentInterjection = await runtime.prisma.interjectionLog.findFirst({
    where: {
      guildId: message.guildId,
      channelId: message.channelId
    },
    orderBy: { createdAt: "desc" }
  });

  if (
    recentInterjection &&
    Date.now() - recentInterjection.createdAt.getTime() < runtime.env.AUTOINTERJECT_COOLDOWN_SEC * 1000
  ) {
    return false;
  }

  return true;
}

export async function routeMessage(runtime: BotRuntime, message: Message) {
  if (!message.inGuild() || message.author.bot || !runtime.client.user) {
    return;
  }

  const ownerLockdownState = await getOwnerLockdownState(runtime);
  const ownerLockdownActive = ownerLockdownState.enabled && runtime.env.DISCORD_OWNER_IDS.length > 0;

  if (ownerLockdownActive && !isBotOwner(runtime, message.author.id)) {
    return;
  }

  const routingConfig = await runtime.runtimeConfig.getRoutingConfig(message.guildId, message.channelId);
  const botName = routingConfig.guildSettings.botName;
  const botId = runtime.client.user.id;
  const member = message.member ?? (await message.guild.members.fetch(message.author.id));
  const triggerContext = await detectTriggerSource(message, botName, botId);
  const activation = resolveActivation(
    {
      canDetectMention: true,
      wasMentioned: triggerContext.wasMentioned,
      hasAnyMention: message.mentions.users.size > 0,
      implicitMentionKinds: [
        ...implicitMentionKindWhen("reply_to_bot", triggerContext.implicitMentionKinds.includes("reply_to_bot")),
        ...implicitMentionKindWhen("name_in_text", triggerContext.implicitMentionKinds.includes("name_in_text")),
      ],
    },
    {
      isGroup: true,
      requireMention: true,
      allowedImplicitMentionKinds: ["reply_to_bot", "name_in_text"],
      allowTextCommands: true,
      hasControlCommand: /^(запомни|вспомни|забудь)\b/i.test(message.content.trim()),
      commandAuthorized: member.permissions.has(PermissionFlagsBits.ManageGuild),
    }
  );
  const triggerSource = triggerContext.triggerSource ?? (activation.shouldBypassMention ? "name" : undefined);
  const explicitInvocation = activation.effectiveWasMentioned;
  const autoInterject =
    !explicitInvocation &&
    !ownerLockdownActive &&
    routingConfig.featureFlags.autoInterject &&
    routingConfig.channelPolicy.allowInterjections &&
    !routingConfig.channelPolicy.isMuted &&
    (!runtime.env.AUTOINTERJECT_CHANNEL_ALLOWLIST.length ||
      runtime.env.AUTOINTERJECT_CHANNEL_ALLOWLIST.includes(message.channelId)) &&
    (await shouldAutoInterject(runtime, message, routingConfig));
  const envelope = buildEnvelope(message, member, botName, botId, triggerSource, explicitInvocation, autoInterject);

  await runtime.ingestService.ingestMessage({
    ...envelope,
    guildName: message.guild.name,
    channelName: envelope.channelName,
    isBotUser: false
  });
  trackIngestedMessage();

  void enqueueBackgroundJobs(runtime, envelope).catch((error) => {
    runtime.logger.warn({ messageId: envelope.messageId, error }, "background job scheduling crashed");
  });

  if (!explicitInvocation && !autoInterject) {
    return;
  }

  if (routingConfig.channelPolicy.isMuted || !routingConfig.channelPolicy.allowBotReplies) {
    await runtime.prisma.botEventLog.create({
      data: {
        guildId: envelope.guildId,
        channelId: envelope.channelId,
        messageId: envelope.messageId,
        userId: envelope.userId,
        eventType: "suppressed",
        intent: explicitInvocation ? "chat" : "ignore",
        routeReason: routingConfig.channelPolicy.isMuted ? "channel muted" : "channel replies disabled",
        usedSearch: false,
        relationshipApplied: false,
        debugTrace: {
          triggerSource: envelope.triggerSource,
          explicitInvocation,
          policy: routingConfig.channelPolicy
        } as never
      }
    });
    return;
  }

  const allowDebounce = explicitInvocation && (triggerSource === "reply" || triggerSource === "name");
  if (shouldDebounce({ text: message.content, hasMedia: message.attachments.size > 0, allowDebounce })) {
    const debouncer = getOrCreateInboundDebouncer(message.channelId);
    await debouncer.enqueue({ runtime, message, routingConfig, triggerSource });
    return;
  }

  await processInvocation(runtime, message, routingConfig, triggerSource, autoInterject);
}

function buildEnvelope(
  message: Message,
  member: GuildMember,
  botName: string,
  botId: string,
  triggerSource: TriggerSource | undefined,
  explicitInvocation: boolean,
  autoInterject: boolean,
  contentOverride?: string,
): MessageEnvelope {
  const guildId = message.guildId;
  if (!guildId) {
    throw new Error("Cannot build a guild message envelope without a guildId");
  }

  return {
    messageId: message.id,
    guildId,
    channelId: message.channelId,
    userId: message.author.id,
    username: message.author.username,
    displayName: member.displayName,
    channelName: "name" in message.channel ? message.channel.name : null,
    content: contentOverride ?? message.content,
    createdAt: message.createdAt,
    replyToMessageId: message.reference?.messageId ?? null,
    mentionCount: message.mentions.users.size,
    mentionedBot: message.mentions.has(botId),
    mentionsBotByName: new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escapeRegExp(botName)}(?=$|[^\\p{L}\\p{N}_])`, "iu").test(message.content),
    mentionedUserIds: [...message.mentions.users.keys()],
    triggerSource: triggerSource ?? (autoInterject ? "auto_interject" : undefined),
    isDirectMessage: false,
    isModerator: member.permissions.has(PermissionFlagsBits.ManageGuild),
    explicitInvocation
  };
}

async function processInvocation(
  runtime: BotRuntime,
  message: Message,
  routingConfig: Awaited<ReturnType<BotRuntime["runtimeConfig"]["getRoutingConfig"]>>,
  triggerSource: TriggerSource | undefined,
  autoInterject: boolean,
  contentOverride?: string,
) {
  if (!message.inGuild() || !runtime.client.user) {
    return;
  }

  const member = message.member ?? (await message.guild.members.fetch(message.author.id));
  const botName = routingConfig.guildSettings.botName;
  const botId = runtime.client.user.id;
  const explicitInvocation = Boolean(triggerSource) || /^(запомни|вспомни|забудь)\b/i.test((contentOverride ?? message.content).trim());
  const envelope = buildEnvelope(message, member, botName, botId, triggerSource, explicitInvocation, autoInterject, contentOverride);
  const preliminaryIntent = intentRouter.route(envelope, botName);
  const queueMessageKind = detectMessageKind({
    content: preliminaryIntent.cleanedContent,
    intent: preliminaryIntent.intent,
    message: envelope,
  });

  let queueItemId: string | null = null;
  let queueTrace: ReplyQueueTrace = { enabled: false, action: "none" };
  if (routingConfig.featureFlags.replyQueueEnabled) {
    queueTrace = await runtime.replyQueue.claimOrQueue({
      guildId: envelope.guildId,
      channelId: envelope.channelId,
      sourceMsgId: envelope.messageId,
      targetUserId: envelope.userId,
      messageKind: queueMessageKind,
      mentionCount: Math.max(1, envelope.mentionCount),
      createdAt: envelope.createdAt,
      triggerSource: envelope.triggerSource,
      explicitInvocation,
    });

    if (queueTrace.action === "dropped") {
      return;
    }

    if (queueTrace.action === "busy_ack") {
      await sendReply(message, "Ща, я ещё прошлое дожёвываю. Подожди чуть.");
      return;
    }

    queueItemId = queueTrace.itemId ?? null;
  }

  let replyDelivered = false;

  try {
    const result = await runtime.orchestrator.handleMessage(envelope, routingConfig, queueTrace);

    if (!result.trace.responded) {
      return;
    }

    const replyForDelivery = await resolveModerationReplyForDelivery(runtime, message, result.reply, result.moderationAction);

    const replyToSend = prepareReplyForDelivery(replyForDelivery);
    if (replyToSend !== result.reply) {
      runtime.logger.warn(
        {
          messageId: envelope.messageId,
          channelId: envelope.channelId,
          guildId: envelope.guildId,
          intent: result.trace.intent,
          hasOriginalReply: Boolean(result.reply),
          originalReplyType: typeof result.reply
        },
        "orchestrator returned empty reply, using fallback"
      );
    }

    const replyText = typeof replyToSend === "string" ? replyToSend : replyToSend.text;
    const hasMedia = typeof replyToSend !== "string" && Boolean(replyToSend.media);
    const microSplitChunks = result.trace.microReaction?.splitChunks;
    const splitPlan = hasMedia
      ? null
      : microSplitChunks?.length
        ? {
            chunks: microSplitChunks,
            delayMs: 650,
            reason: "micro_reaction"
          }
        : planNaturalMessageSplit({
          text: replyText,
          enabled: routingConfig.featureFlags.naturalMessageSplittingEnabled,
          intent: result.trace.intent,
          explicitInvocation: envelope.explicitInvocation,
          triggerSource: result.trace.triggerSource,
          messageKind: result.trace.behavior?.messageKind,
          nowMs: Date.now(),
          lastSplitAtMs: naturalSplitCooldownByChannel.get(message.channelId),
          cooldownMs: runtime.env.NATURAL_SPLIT_COOLDOWN_SEC * 1000,
          chance: runtime.env.NATURAL_SPLIT_CHANCE,
          random: Math.random()
        });

    if (splitPlan) {
      naturalSplitCooldownByChannel.set(message.channelId, Date.now());
    }

    await sendReply(message, replyToSend, {
      naturalChunks: splitPlan?.chunks,
      naturalDelayMs: splitPlan?.delayMs
    });
    replyDelivered = true;

    if (autoInterject) {
      await runtime.prisma.interjectionLog.create({
        data: {
          guildId: envelope.guildId,
          channelId: envelope.channelId,
          userId: envelope.userId,
          reason: "auto_interject",
          confidence: 0.8,
          outcome: "sent"
        }
      });
    }
  } catch (error) {
    runtime.logger.error(
      {
        error,
        messageId: envelope.messageId,
        channelId: envelope.channelId,
        guildId: envelope.guildId,
        queueAction: queueTrace.action,
        queueItemId,
        replyDelivered
      },
      "message invocation failed"
    );

    if (queueItemId) {
      try {
        if (replyDelivered) {
          await runtime.replyQueue.complete(queueItemId);
        } else {
          await runtime.replyQueue.abandon(queueItemId);
        }

        queueItemId = null;
        await drainReplyQueue(runtime, message);
      } catch (cleanupError) {
        runtime.logger.warn({ error: cleanupError, queueItemId }, "reply queue cleanup failed after invocation error");
      }
    }

    if (!replyDelivered) {
      try {
        await sendReply(message, EMPTY_REPLY_FALLBACK);
      } catch (replyError) {
        runtime.logger.warn(
          {
            error: replyError,
            messageId: envelope.messageId,
            channelId: envelope.channelId,
            guildId: envelope.guildId
          },
          "failed to deliver fallback reply after invocation error"
        );
      }
    }
  } finally {
    if (queueItemId) {
      try {
        await runtime.replyQueue.complete(queueItemId);
        await drainReplyQueue(runtime, message);
      } catch (error) {
        runtime.logger.warn({ error, queueItemId }, "reply queue cleanup failed");
      }
    }
  }
}

function getOrCreateInboundDebouncer(channelId: string) {
  const existing = inboundDebouncers.get(channelId);
  if (existing) {
    return existing;
  }

  const debouncer = createChannelDebouncer<PendingInvocation>(channelId, DEFAULT_DEBOUNCE, {
    buildKey: (item) => `${item.message.channelId}:${item.message.author.id}`,
    onFlush: async (items) => {
      const latest = items.at(-1);
      if (!latest) {
        return;
      }

      const combinedContent = items
        .map((item) => item.message.content.trim())
        .filter(Boolean)
        .join("\n");

      await processInvocation(latest.runtime, latest.message, latest.routingConfig, latest.triggerSource, false, combinedContent);
    }
  });

  inboundDebouncers.set(channelId, debouncer);
  return debouncer;
}

async function drainReplyQueue(runtime: BotRuntime, message: Message) {
  if (!message.guildId) {
    return;
  }

  const next = await runtime.replyQueue.nextQueued(message.guildId, message.channelId);
  if (!next) {
    return;
  }

  try {
    const queuedMessage = await message.channel.messages.fetch(next.sourceMsgId);
    await routeMessage(runtime, queuedMessage);
  } catch (error) {
    await runtime.replyQueue.complete(next.id);
    runtime.logger.warn({ error, sourceMsgId: next.sourceMsgId }, "queued reply source message could not be fetched");
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
