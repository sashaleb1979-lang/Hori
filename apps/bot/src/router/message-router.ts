import type { GuildMember, Message } from "discord.js";
import { PermissionFlagsBits } from "discord.js";

import { trackIngestedMessage } from "@hori/analytics";
import { DEFAULT_DEBOUNCE, IntentRouter, createChannelDebouncer, detectMessageKind, implicitMentionKindWhen, resolveActivation, shouldDebounce } from "@hori/core";
import { type MessageEnvelope, type ReplyQueueTrace, type TriggerSource } from "@hori/shared";

import type { BotRuntime } from "../bootstrap";
import { enqueueBackgroundJobs } from "./background-jobs";
import { sendReply } from "../responders/message-responder";

const intentRouter = new IntentRouter();
const inboundDebouncers = new Map<string, ReturnType<typeof createChannelDebouncer<PendingInvocation>>>();

interface PendingInvocation {
  runtime: BotRuntime;
  message: Message;
  routingConfig: Awaited<ReturnType<BotRuntime["runtimeConfig"]["getRoutingConfig"]>>;
  triggerSource?: TriggerSource;
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

async function shouldAutoInterject(runtime: BotRuntime, message: Message) {
  if (!message.guildId) {
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

  return /что думаете|кто прав|мнение|как считаете/i.test(message.content);
}

export async function routeMessage(runtime: BotRuntime, message: Message) {
  if (!message.inGuild() || message.author.bot || !runtime.client.user) {
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
      hasControlCommand: /^(запомни|забудь)\b/i.test(message.content.trim()),
      commandAuthorized: member.permissions.has(PermissionFlagsBits.ManageGuild),
    }
  );
  const triggerSource = triggerContext.triggerSource ?? (activation.shouldBypassMention ? "name" : undefined);
  const explicitInvocation = activation.effectiveWasMentioned;
  const autoInterject =
    !explicitInvocation &&
    routingConfig.featureFlags.autoInterject &&
    routingConfig.channelPolicy.allowInterjections &&
    !routingConfig.channelPolicy.isMuted &&
    (!runtime.env.AUTOINTERJECT_CHANNEL_ALLOWLIST.length ||
      runtime.env.AUTOINTERJECT_CHANNEL_ALLOWLIST.includes(message.channelId)) &&
    (await shouldAutoInterject(runtime, message));
  const envelope = buildEnvelope(message, member, botName, botId, triggerSource, explicitInvocation, autoInterject);

  await runtime.ingestService.ingestMessage({
    ...envelope,
    guildName: message.guild.name,
    channelName: envelope.channelName,
    isBotUser: false
  });
  trackIngestedMessage();

  await enqueueBackgroundJobs(runtime, envelope);

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
  const explicitInvocation = Boolean(triggerSource) || /^(запомни|забудь)\b/i.test((contentOverride ?? message.content).trim());
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

  const result = await runtime.orchestrator.handleMessage(envelope, routingConfig, queueTrace);

  if (!result.reply) {
    if (queueItemId) {
      await runtime.replyQueue.complete(queueItemId);
      await drainReplyQueue(runtime, message);
    }
    return;
  }

  await sendReply(message, result.reply);

  if (queueItemId) {
    await runtime.replyQueue.complete(queueItemId);
    await drainReplyQueue(runtime, message);
  }

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
