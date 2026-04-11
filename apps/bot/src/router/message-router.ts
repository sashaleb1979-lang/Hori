import type { Message } from "discord.js";
import { PermissionFlagsBits } from "discord.js";

import { trackIngestedMessage } from "@hori/analytics";
import { asErrorMessage, type TriggerSource } from "@hori/shared";

import type { BotRuntime } from "../bootstrap";
import { sendReply } from "../responders/message-responder";

async function enqueueBackgroundJobs(runtime: BotRuntime, envelope: {
  guildId: string;
  channelId: string;
  userId: string;
  messageId: string;
  content: string;
}) {
  const jobs = [
    {
      queue: "summary",
      task: runtime.queues.summary.add(
        "summary",
        { guildId: envelope.guildId, channelId: envelope.channelId },
        { jobId: `summary:${envelope.guildId}:${envelope.channelId}` }
      )
    },
    {
      queue: "profile",
      task: runtime.queues.profile.add(
        "profile",
        { guildId: envelope.guildId, userId: envelope.userId },
        { jobId: `profile:${envelope.guildId}:${envelope.userId}` }
      )
    },
    {
      queue: "embedding",
      task:
        envelope.content.length >= runtime.env.MESSAGE_EMBED_MIN_CHARS
          ? runtime.queues.embedding.add(
              "embedding",
              { entityType: "message", entityId: envelope.messageId },
              { jobId: `embedding:${envelope.messageId}` }
            )
          : Promise.resolve()
    }
  ];

  const results = await Promise.allSettled(jobs.map((job) => job.task));

  for (const [index, result] of results.entries()) {
    if (result.status === "rejected") {
      runtime.logger.warn(
        {
          queue: jobs[index]?.queue,
          messageId: envelope.messageId,
          error: asErrorMessage(result.reason)
        },
        "background queue enqueue failed"
      );
    }
  }
}

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

  const result = await runtime.orchestrator.handleMessage(envelope, routingConfig);

  if (!result.reply) {
    return;
  }

  await sendReply(message, result.reply);

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
