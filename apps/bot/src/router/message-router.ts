import type { Message } from "discord.js";
import { PermissionFlagsBits } from "discord.js";

import { trackIngestedMessage } from "@hori/analytics";
import { asErrorMessage, type ReplyQueueTrace, type TriggerSource } from "@hori/shared";

import type { BotRuntime } from "../bootstrap";
import { enqueueBackgroundJobs } from "./background-jobs";
import { sendReply } from "../responders/message-responder";

async function detectTriggerSource(message: Message, botName: string, botId: string): Promise<TriggerSource | undefined> {
  const content = message.content.trim();

  if (message.mentions.has(botId)) {
    return "mention";
  }

  if (message.reference?.messageId) {
    try {
      const referenced = await message.fetchReference();

      if (referenced.author.id === botId) {
        return "reply";
      }
    } catch {
      return undefined;
    }
  }

  if (new RegExp(`^${botName}[,:!\\s-]*`, "i").test(content)) {
    return "name";
  }

  return undefined;
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
  const triggerSource = await detectTriggerSource(message, botName, runtime.client.user.id);
  const explicitInvocation = Boolean(triggerSource);
  const autoInterject =
    !explicitInvocation &&
    routingConfig.featureFlags.autoInterject &&
    routingConfig.channelPolicy.allowInterjections &&
    !routingConfig.channelPolicy.isMuted &&
    (!runtime.env.AUTOINTERJECT_CHANNEL_ALLOWLIST.length ||
      runtime.env.AUTOINTERJECT_CHANNEL_ALLOWLIST.includes(message.channelId)) &&
    (await shouldAutoInterject(runtime, message));
  const member = message.member ?? (await message.guild.members.fetch(message.author.id));
  const envelope = {
    messageId: message.id,
    guildId: message.guildId,
    channelId: message.channelId,
    userId: message.author.id,
    username: message.author.username,
    displayName: member.displayName,
    channelName: "name" in message.channel ? message.channel.name : null,
    content: message.content,
    createdAt: message.createdAt,
    replyToMessageId: message.reference?.messageId ?? null,
    mentionCount: message.mentions.users.size,
    mentionedBot: message.mentions.has(runtime.client.user.id),
    mentionsBotByName: new RegExp(`\\b${botName}\\b`, "i").test(message.content),
    mentionedUserIds: [...message.mentions.users.keys()],
    triggerSource: triggerSource ?? (autoInterject ? "auto_interject" : undefined),
    isModerator: member.permissions.has(PermissionFlagsBits.ManageGuild),
    explicitInvocation
  };

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

  let queueItemId: string | null = null;
  let queueTrace: ReplyQueueTrace = { enabled: false, action: "none" };
  if (routingConfig.featureFlags.replyQueueEnabled) {
    queueTrace = await runtime.replyQueue.claimOrQueue({
      guildId: envelope.guildId,
      channelId: envelope.channelId,
      sourceMsgId: envelope.messageId,
      targetUserId: envelope.userId,
      triggerSource: envelope.triggerSource,
      explicitInvocation
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
