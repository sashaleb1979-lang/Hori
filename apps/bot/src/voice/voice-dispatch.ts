import type { AppEnv } from "@hori/config";
import type { MessageIngestService } from "@hori/analytics";
import type { AppLogger, MessageEnvelope } from "@hori/shared";
import type { RuntimeConfigService } from "@hori/core";
import type { ChatOrchestrator } from "@hori/core";
import type { Client } from "discord.js";

import { trackIngestedMessage } from "@hori/analytics";

import { enqueueBackgroundJobs } from "../router/background-jobs";
import { sendReplyToChannel } from "../responders/message-responder";

interface QueueHandle {
  add(jobName: string, payload?: unknown, options?: unknown): Promise<unknown>;
}

interface VoiceDispatchQueues {
  summary: QueueHandle;
  profile: QueueHandle;
  embedding: QueueHandle;
  topic: QueueHandle;
}

export interface VoiceDispatchInput {
  guildId: string;
  guildName: string;
  textChannelId: string;
  textChannelName?: string | null;
  userId: string;
  username: string;
  displayName?: string | null;
  transcription: string;
  createdAt?: Date;
  isModerator: boolean;
}

export interface VoiceDispatchDeps {
  client: Client;
  env: AppEnv;
  logger: AppLogger;
  ingestService: MessageIngestService;
  runtimeConfig: RuntimeConfigService;
  orchestrator: ChatOrchestrator;
  queues: VoiceDispatchQueues;
}

export function buildVoiceEnvelope(input: VoiceDispatchInput): MessageEnvelope {
  const createdAt = input.createdAt ?? new Date();

  return {
    messageId: `voice:${input.guildId}:${input.userId}:${createdAt.getTime()}`,
    guildId: input.guildId,
    channelId: input.textChannelId,
    userId: input.userId,
    username: input.username,
    displayName: input.displayName ?? null,
    channelName: input.textChannelName ?? null,
    content: input.transcription.trim(),
    createdAt,
    replyToMessageId: null,
    mentionCount: 1,
    mentionedBot: true,
    mentionsBotByName: true,
    mentionedUserIds: [],
    triggerSource: "mention",
    isModerator: input.isModerator,
    explicitInvocation: true,
  };
}

export async function dispatchVoiceTranscription(
  deps: VoiceDispatchDeps,
  input: VoiceDispatchInput,
) {
  const channel = await deps.client.channels.fetch(input.textChannelId).catch(() => null);
  if (!channel || !channel.isTextBased() || !("send" in channel)) {
    deps.logger.warn({ channelId: input.textChannelId }, "voice transcription dropped: target text channel unavailable");
    return;
  }

  const envelope = buildVoiceEnvelope(input);

  await deps.ingestService.ingestMessage({
    ...envelope,
    guildName: input.guildName,
    channelName: input.textChannelName ?? undefined,
    isBotUser: false,
  });
  trackIngestedMessage();

  await enqueueBackgroundJobs(deps, {
    guildId: envelope.guildId,
    channelId: envelope.channelId,
    userId: envelope.userId,
    messageId: envelope.messageId,
    content: envelope.content,
  });

  const routingConfig = await deps.runtimeConfig.getRoutingConfig(input.guildId, input.textChannelId);
  if (routingConfig.channelPolicy.isMuted || !routingConfig.channelPolicy.allowBotReplies) {
    return;
  }

  const result = await deps.orchestrator.handleMessage(envelope, routingConfig);
  if (!result.reply) {
    return;
  }

  await sendReplyToChannel(channel, result.reply);
}