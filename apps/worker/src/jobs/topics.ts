import type { Job } from "bullmq";

import { asErrorMessage, type TopicJobPayload } from "@hori/shared";

import type { WorkerRuntime } from "../index";

export function createTopicJob(runtime: WorkerRuntime) {
  return async (job: Job<TopicJobPayload>) => {
    if (!runtime.env.FEATURE_TOPIC_ENGINE_ENABLED) {
      return { skipped: true, reason: "feature disabled" };
    }

    const message = await runtime.prisma.message.findUnique({
      where: { id: job.data.messageId }
    });

    if (!message) {
      return { skipped: true, reason: "message not found" };
    }

    let embedding: number[] | undefined;
    if (message.content.length >= runtime.env.MESSAGE_EMBED_MIN_CHARS) {
      try {
        embedding = await runtime.embeddingAdapter.embedOne(message.content);
      } catch (error) {
        runtime.logger.warn({ error: asErrorMessage(error), messageId: message.id, jobId: job.id }, "topic embedding unavailable");
      }
    }

    return runtime.topicService.updateFromMessage({
      guildId: message.guildId,
      channelId: message.channelId,
      messageId: message.id,
      content: message.content,
      createdAt: message.createdAt,
      replyToMessageId: message.replyToMessageId,
      embedding
    });
  };
}
