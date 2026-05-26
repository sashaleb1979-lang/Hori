import type { GuildMember, Message } from "discord.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } from "discord.js";

import { trackIngestedMessage } from "@hori/analytics";
import { DEFAULT_DEBOUNCE, DEFAULT_MEDIA_REACTION_CONFIG, IntentRouter, createChannelDebouncer, detectMessageKind, evaluateSelectiveEngagement, implicitMentionKindWhen, planNaturalMessageSplit, resolveActivation, shouldDebounce } from "@hori/core";
import { type BotReplyPayload, type MessageEnvelope, type ReplyQueueTrace, type TriggerSource } from "@hori/shared";

import type { BotRuntime } from "../bootstrap";
import { enqueueBackgroundJobs } from "./background-jobs";
import { handleChatRecapCommand, isChatRecapCodeword } from "./chat-recap";
import { getOwnerLockdownState, isBotOwner } from "./owner-lockdown";
import { sendReply } from "../responders/message-responder";
import { loadMemeIndexer } from "../runtime/flash-trolling-scheduler";
import { syncGuildNickname } from "../runtime/session-sleep-sync";

const intentRouter = new IntentRouter();
const inboundDebouncers = new Map<string, ReturnType<typeof createChannelDebouncer<PendingInvocation>>>();
const naturalSplitCooldownByChannel = new Map<string, number>();
let lastMediaReactionAtMs = 0;

export function resetMediaReactionStateForTests() {
  lastMediaReactionAtMs = 0;
}

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

async function ingestDeliveredBotReplies(
  runtime: BotRuntime,
  deliveredMessages: Message[],
  targetContext: { targetUserId?: string | null; targetMessageId?: string | null } = {}
) {
  if (!runtime.client.user || !deliveredMessages.length) {
    return;
  }

  const firstDelivered = deliveredMessages.find((delivered) => delivered.inGuild()) ?? null;
  const channelSession = firstDelivered?.guildId
    ? await runtime.sessionBuffer.getChannelSessionState(firstDelivered.guildId, firstDelivered.channelId).catch(() => null)
    : null;
  const sessionId = firstDelivered?.guildId && channelSession
    ? `${firstDelivered.guildId}:${firstDelivered.channelId}:${channelSession.sessionSince.toISOString()}`
    : null;

  const results = await Promise.allSettled(
    deliveredMessages
      .filter((delivered) => delivered.inGuild())
      .map(async (delivered) => {
        await runtime.ingestService.ingestMessage({
          messageId: delivered.id,
          guildId: delivered.guildId!,
          channelId: delivered.channelId,
          userId: delivered.author.id,
          username: delivered.author.username,
          displayName: delivered.member?.displayName ?? delivered.author.globalName ?? delivered.author.username,
          content: delivered.content,
          createdAt: delivered.createdAt,
          replyToMessageId: delivered.reference?.messageId ?? null,
          mentionCount: delivered.mentions.users.size,
          mentionedBot: delivered.mentions.has(runtime.client.user!.id),
          mentionsBotByName: false,
          mentionedUserIds: [...delivered.mentions.users.keys()],
          triggerSource: undefined,
          isDirectMessage: false,
          isModerator: false,
          explicitInvocation: false,
          guildName: delivered.guild?.name,
          channelName: "name" in delivered.channel ? delivered.channel.name : null,
          isBotUser: true,
          sessionId,
          sendState: "sent",
          targetUserId: targetContext.targetUserId ?? null,
          targetMessageId: targetContext.targetMessageId ?? null
        });
        await runtime.sessionBuffer.recordChannelActivity({
          guildId: delivered.guildId!,
          channelId: delivered.channelId,
          userId: delivered.author.id,
          createdAt: delivered.createdAt,
          isBot: true,
          targetUserId: targetContext.targetUserId ?? null
        });
      })
  );

  for (const [index, result] of results.entries()) {
    if (result.status === "rejected") {
      const delivered = deliveredMessages[index];
      runtime.logger.warn(
        {
          error: result.reason,
          messageId: delivered?.id,
          channelId: delivered?.channelId,
          guildId: delivered?.guildId
        },
        "failed to ingest delivered bot reply"
      );
    }
  }
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

async function tryHandleKnowledgeQuery(
  runtime: BotRuntime,
  message: Message,
  envelope: MessageEnvelope
): Promise<boolean> {
  const trimmed = message.content.trimStart();
  if (!trimmed) return false;
  // Cheap pre-filter so we don't hit the DB on every message.
  const firstChar = Array.from(trimmed)[0];
  if (!firstChar || /[\p{L}\p{N}_\s]/u.test(firstChar)) return false;

  let match: Awaited<ReturnType<BotRuntime["knowledge"]["matchTrigger"]>> = null;
  try {
    match = await runtime.knowledge.matchTrigger(envelope.guildId, message.content);
  } catch (error) {
    runtime.logger.warn(
      { guildId: envelope.guildId, error: (error as Error).message },
      "knowledge trigger lookup failed"
    );
    return false;
  }
  if (!match) return false;
  if (!match.question) {
    await sendReply(message, `Спроси что-нибудь по «${match.cluster.title}» после «${match.cluster.trigger}».`);
    return true;
  }

  try {
    const result = await runtime.knowledge.answer(match.cluster, match.question);
    const replyText = result.answer.trim() || "нет такой инфы";
    const deliveredReplies = await sendReply(message, replyText);
    await ingestDeliveredBotReplies(runtime, deliveredReplies, {
      targetUserId: envelope.userId,
      targetMessageId: envelope.messageId
    });
    runtime.logger.info(
      {
        guildId: envelope.guildId,
        clusterCode: match.cluster.code,
        chunks: result.retrievedChunkCount,
        fallback: result.fallback,
        model: result.model
      },
      "knowledge query answered"
    );
  } catch (error) {
    runtime.logger.error(
      { guildId: envelope.guildId, code: match.cluster.code, error },
      "knowledge answer failed"
    );
    const deliveredReplies = await sendReply(message, "Сек, я споткнулась о вики. Повтори вопрос.");
    await ingestDeliveredBotReplies(runtime, deliveredReplies, {
      targetUserId: envelope.userId,
      targetMessageId: envelope.messageId
    });
  }
  return true;
}

/**
 * Проверяет, содержит ли сообщение кодовое слово одного из prompt-слотов пользователя.
 * Если да — активирует слот тихо (без ответа в чат).
 */
async function tryActivateSlotByKeyword(
  runtime: BotRuntime,
  guildId: string,
  channelId: string,
  userId: string,
  content: string
): Promise<void> {
  if (!content.trim()) return;
  const slot = await runtime.promptSlots.findByTriggerInMessage(guildId, userId, content);
  if (!slot) return;
  const level = await runtime.relationshipService.getLevel(guildId, userId).catch(() => 0);
  await runtime.promptSlots.activate(slot.id, { initiatorLevel: level });
  runtime.logger.info(
    { guildId, channelId, userId, slotId: slot.id, trigger: slot.trigger },
    "prompt slot auto-activated by keyword"
  );
}

/**
 * Обрабатывает "хори запомни" / "хори вспомни" / "хори забудь" через PromptSlotService.
 * Возвращает true если обработал.
 */
async function tryHandlePromptCardCommand(
  runtime: BotRuntime,
  message: Message
): Promise<boolean> {
  if (!message.inGuild()) return false;
  const text = message.content.trim();
  const match = /^(?:хори\s+)?(запомни|вспомни|забудь)(.*)/i.exec(text);
  if (!match) return false;

  const cmd = match[1].toLowerCase() as "запомни" | "вспомни" | "забудь";
  const rest = match[2].trim().toLowerCase();
  const guildId = message.guildId;
  const userId = message.author.id;
  const relLevel = await runtime.relationshipService.getLevel(guildId, userId).catch(() => 0);
  const mySlots = await runtime.promptSlots.listForOwner(guildId, userId);

  if (cmd === "запомни") {
    const limit = runtime.promptSlots.getLimit(relLevel);
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];

    if (mySlots.length > 0) {
      const lines = [`🎟️ **Твои слоты (${mySlots.length}/${limit}):**`];
      for (const s of mySlots.slice(0, 5)) {
        const now = new Date();
        const st = s.active
          ? "✅ активен"
          : s.cooldownUntil && s.cooldownUntil > now
          ? `⏳ до ${s.cooldownUntil.toISOString().slice(11, 16)} UTC`
          : "▾ простаивает";
        lines.push(`• **${s.title ?? "(без названия)"}** — ${st}`);
      }
      if (mySlots.length < limit) {
        rows.push(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`SLOT:create:${userId}`)
              .setLabel("➕ Создать новый слот")
              .setStyle(ButtonStyle.Primary)
          )
        );
      } else {
        lines.push(`\n⚠️ Лимит ${limit} слотов исчерпан. Удали слот через «хори забудь» чтобы освободить место.`);
      }
      await message.reply({ content: lines.join("\n"), components: rows });
    } else {
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`SLOT:create:${userId}`)
          .setLabel("➕ Создать слот")
          .setStyle(ButtonStyle.Primary)
      );
      await message.reply({
        content: `🎟️ У тебя нет слотов. Создай первый (лимит: ${limit}).`,
        components: [row]
      });
    }
    return true;
  }

  if (cmd === "вспомни") {
    if (!mySlots.length) {
      await message.reply({ content: "🎟️ У тебя нет слотов. Создай через «хори запомни»." });
      return true;
    }
    const now = new Date();
    const lines = ["🎟️ **Выбери слот для активации:**"];
    const buttons: ButtonBuilder[] = [];
    for (const s of mySlots.slice(0, 5)) {
      if (s.active) {
        lines.push(`✅ **${s.title ?? s.id.slice(0, 8)}** — уже активен`);
      } else if (s.cooldownUntil && s.cooldownUntil > now) {
        lines.push(`⏳ **${s.title ?? s.id.slice(0, 8)}** — кулдаун до ${s.cooldownUntil.toISOString().slice(11, 16)} UTC`);
      } else {
        buttons.push(
          new ButtonBuilder()
            .setCustomId(`SLOT:activate:${s.id}`)
            .setLabel(`▶️ ${(s.title ?? s.id.slice(0, 8)).slice(0, 25)}`)
            .setStyle(ButtonStyle.Success)
        );
      }
    }
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    if (buttons.length) {
      rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons.slice(0, 5)));
    }
    await message.reply({ content: lines.join("\n"), components: rows });
    return true;
  }

  if (cmd === "забудь") {
    if (rest === "всё" || rest === "все") {
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`SLOT:deleteAll:${userId}`)
          .setLabel("🗑️ Удалить все мои слоты")
          .setStyle(ButtonStyle.Danger)
      );
      await message.reply({
        content: "⚠️ Удалить **все** твои слоты? Это необратимо.",
        components: [row]
      });
      return true;
    }
    if (!mySlots.length) {
      await message.reply({ content: "🎟️ У тебя нет слотов для удаления." });
      return true;
    }
    const lines = ["🗑️ **Выбери слот для удаления:**"];
    const buttons: ButtonBuilder[] = [];
    for (const s of mySlots.slice(0, 5)) {
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`SLOT:delete:${s.id}`)
          .setLabel(`🗑️ ${(s.title ?? s.id.slice(0, 8)).slice(0, 25)}`)
          .setStyle(ButtonStyle.Danger)
      );
    }
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons.slice(0, 5));
    await message.reply({ content: lines.join("\n"), components: [row] });
    return true;
  }

  return false;
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

  // Off-gate: канал полностью выключен — ранний возврат без ingest/log.
  if (routingConfig.channelPolicy.accessMode === "off") {
    return;
  }

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
      hasControlCommand: /^(запомни|вспомни|забудь)\b/i.test(message.content.trim()) || isChatRecapCodeword(message.content),
      commandAuthorized: isChatRecapCodeword(message.content) || member.permissions.has(PermissionFlagsBits.ManageGuild),
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

  const sleepUntil = await runtime.sessionBuffer.getGuildSleepUntil(message.guildId);

  if (!sleepUntil) {
    await runtime.sessionBuffer.recordChannelActivity({
      guildId: envelope.guildId,
      channelId: envelope.channelId,
      userId: envelope.userId,
      createdAt: envelope.createdAt
    });
  }

  void enqueueBackgroundJobs(runtime, envelope, {
    suppressSessionLifecycle: Boolean(sleepUntil)
  }).catch((error) => {
    runtime.logger.warn({ messageId: envelope.messageId, error }, "background job scheduling crashed");
  });

  if (sleepUntil) {
    void syncGuildNickname(runtime, message.guild, "спит");

    if (explicitInvocation || autoInterject) {
      await runtime.prisma.botEventLog.create({
        data: {
          guildId: envelope.guildId,
          channelId: envelope.channelId,
          messageId: envelope.messageId,
          userId: envelope.userId,
          eventType: "suppressed",
          intent: explicitInvocation ? "chat" : "ignore",
          routeReason: "guild sleep",
          usedSearch: false,
          relationshipApplied: false,
          debugTrace: {
            triggerSource: envelope.triggerSource,
            explicitInvocation,
            sleepUntil: sleepUntil.toISOString()
          } as never
        }
      });
    }

    return;
  }

  void syncGuildNickname(runtime, message.guild, botName);

  // Авто-активация prompt-слота по кодовому слову в тексте сообщения.
  void tryActivateSlotByKeyword(runtime, message.guildId, message.channelId, message.author.id, message.content).catch(
    () => undefined
  );

  if (
    !routingConfig.channelPolicy.isMuted &&
    routingConfig.channelPolicy.allowBotReplies &&
    (await tryHandleKnowledgeQuery(runtime, message, envelope))
  ) {
    return;
  }

  if (!explicitInvocation && !autoInterject) {
    return;
  }

  if (explicitInvocation && await tryHandlePromptCardCommand(runtime, message)) {
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

  const recapCodeword = isChatRecapCodeword(message.content);
  const allowDebounce = explicitInvocation && !recapCodeword && (triggerSource === "reply" || triggerSource === "name");
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
  const explicitInvocation = Boolean(triggerSource)
    || /^(запомни|вспомни|забудь)\b/i.test((contentOverride ?? message.content).trim())
    || isChatRecapCodeword(contentOverride ?? message.content);
  const envelope = buildEnvelope(message, member, botName, botId, triggerSource, explicitInvocation, autoInterject, contentOverride);
  const preliminaryIntent = intentRouter.route(envelope, botName);
  const queueMessageKind = detectMessageKind({
    content: preliminaryIntent.cleanedContent,
    intent: preliminaryIntent.intent,
    message: envelope,
  });

  let queueItemId: string | null = null;
  let queueTrace: ReplyQueueTrace = { enabled: false, action: "none" };
  let firstDeliveredReplyId: string | null = null;
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
      // V5.1 Phase H: фраза выбирается из пула по уровню отношений и стадии (initial/followup).
      const relationship = await runtime.relationshipService
        .getRelationship(envelope.guildId, envelope.userId)
        .catch(() => null);
      const stage = queueTrace.reason === "already_queued" ? "followup" : "initial";
      const phrase = runtime.queuePhrasePool.pickPhrase({
        guildId: envelope.guildId,
        userId: envelope.userId,
        score: relationship?.relationshipScore ?? 0,
        stage
      });
      await sendReply(message, phrase);
      return;
    }

    queueItemId = queueTrace.itemId ?? null;
  }

  let replyDelivered = false;

  const sessionCompactionJobId = `session-compact-${envelope.guildId}-${envelope.userId}-${envelope.channelId}`.replace(/[:\s]+/g, "-");

  try {
    if (explicitInvocation && preliminaryIntent.intent === "chat" && !preliminaryIntent.cleanedContent.length) {
      const helpText = await runtime.slashAdmin.handleHelp();
      const deliveredReplies = await sendReply(message, helpText);
      firstDeliveredReplyId = deliveredReplies[0]?.id ?? null;
      await ingestDeliveredBotReplies(runtime, deliveredReplies, {
        targetUserId: envelope.userId,
        targetMessageId: envelope.messageId
      });
      replyDelivered = true;

      await runtime.prisma.botEventLog.create({
        data: {
          guildId: envelope.guildId,
          channelId: envelope.channelId,
          messageId: envelope.messageId,
          userId: envelope.userId,
          eventType: "reply",
          intent: "help",
          routeReason: "empty_invocation_help",
          usedSearch: false,
          relationshipApplied: false,
          debugTrace: {
            triggerSource: envelope.triggerSource,
            explicitInvocation,
            cleanedContent: preliminaryIntent.cleanedContent
          } as never
        }
      });

      return;
    }

    const recapResult = explicitInvocation && preliminaryIntent.intent === "chat"
      ? await handleChatRecapCommand(runtime, envelope, preliminaryIntent.cleanedContent)
      : null;
    if (recapResult) {
      const deliveredReplies = await sendReply(message, recapResult.reply);
      firstDeliveredReplyId = deliveredReplies[0]?.id ?? null;
      await ingestDeliveredBotReplies(runtime, deliveredReplies, {
        targetUserId: envelope.userId,
        targetMessageId: envelope.messageId
      });
      replyDelivered = true;

      if (recapResult.logEvent) {
        await runtime.prisma.botEventLog.create({
          data: {
            guildId: envelope.guildId,
            channelId: envelope.channelId,
            messageId: deliveredReplies[0]?.id ?? null,
            userId: envelope.userId,
            eventType: recapResult.logEvent.eventType,
            intent: "summary",
            routeReason: "chat_recap_codeword",
            modelUsed: recapResult.logEvent.modelUsed,
            usedSearch: false,
            promptTokens: recapResult.logEvent.promptTokens,
            completionTokens: recapResult.logEvent.completionTokens,
            totalTokens: recapResult.logEvent.totalTokens,
            relationshipApplied: false,
            debugTrace: recapResult.logEvent.debugTrace as never
          }
        });
      }

      return;
    }

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
    let hasMedia = typeof replyToSend !== "string" && Boolean(replyToSend.media);
    const mediaReactionConfig = await runtime.runtimeConfig.getMediaReactionConfig?.().catch(() => DEFAULT_MEDIA_REACTION_CONFIG)
      ?? DEFAULT_MEDIA_REACTION_CONFIG;
    const nowMs = Date.now();
    const mediaCooldownActive = mediaReactionConfig.cooldownSec > 0
      && nowMs - lastMediaReactionAtMs < mediaReactionConfig.cooldownSec * 1000;

    // Volna 7: media reactions — configurable meme attachment after a normal bot reply.
    let finalReply: string | BotReplyPayload = replyToSend;
    if (
      !hasMedia &&
      routingConfig.featureFlags.mediaReactionsEnabled &&
      !mediaCooldownActive &&
      Math.random() < mediaReactionConfig.chance
    ) {
      const relScore = await runtime.relationshipService
        .getRelationship(envelope.guildId, envelope.userId)
        .then((r) => r?.relationshipScore ?? 0)
        .catch(() => 0);
      if (relScore >= mediaReactionConfig.minRelationshipScore) {
        const indexer = await loadMemeIndexer().catch(() => null);
        const meme = indexer?.pickRandom?.() ?? null;
        if (meme) {
          finalReply = { text: replyText, media: { filePath: meme.filePath, mediaId: meme.mediaId, type: meme.type } };
          hasMedia = true;
          lastMediaReactionAtMs = nowMs;
        }
      }
    }

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

    const deliveredReplies = await sendReply(message, finalReply, {
      naturalChunks: splitPlan?.chunks,
      naturalDelayMs: splitPlan?.delayMs
    });
    firstDeliveredReplyId = deliveredReplies[0]?.id ?? null;
    await ingestDeliveredBotReplies(runtime, deliveredReplies, {
      targetUserId: envelope.userId,
      targetMessageId: envelope.messageId
    });
    replyDelivered = true;
    void runtime.queues.sessionCompaction.add(
      "session-compaction",
      { guildId: envelope.guildId, channelId: envelope.channelId, userId: envelope.userId },
      { jobId: sessionCompactionJobId, removeOnComplete: 20, removeOnFail: 50 }
    ).catch((error) => {
      runtime.logger.warn(
        { guildId: envelope.guildId, channelId: envelope.channelId, userId: envelope.userId, error },
        "session compaction enqueue failed"
      );
    });

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
          await runtime.replyQueue.complete(queueItemId, firstDeliveredReplyId);
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
        const deliveredReplies = await sendReply(message, EMPTY_REPLY_FALLBACK);
        firstDeliveredReplyId = deliveredReplies[0]?.id ?? null;
        await ingestDeliveredBotReplies(runtime, deliveredReplies, {
          targetUserId: envelope.userId,
          targetMessageId: envelope.messageId
        });
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
        await runtime.replyQueue.complete(queueItemId, firstDeliveredReplyId);
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
