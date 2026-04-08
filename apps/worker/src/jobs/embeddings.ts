import type { Job } from "bullmq";

import { toVectorLiteral, type EmbeddingJobPayload } from "@hori/shared";

import type { WorkerRuntime } from "../index";

export function createEmbeddingJob(runtime: WorkerRuntime) {
  return async (job: Job<EmbeddingJobPayload>) => {
    if (job.data.entityType === "message") {
      const message = await runtime.prisma.message.findUnique({
        where: { id: job.data.entityId }
      });

      if (!message || message.content.length < runtime.env.MESSAGE_EMBED_MIN_CHARS) {
        return { skipped: true, reason: "message not eligible" };
      }

      const vector = await runtime.embeddingAdapter.embedOne(message.content);

      await runtime.prisma.messageEmbedding.upsert({
        where: { messageId: message.id },
        update: {
          guildId: message.guildId,
          channelId: message.channelId,
          dimensions: vector.length
        },
        create: {
          messageId: message.id,
          guildId: message.guildId,
          channelId: message.channelId,
          dimensions: vector.length
        }
      });

      await runtime.prisma.$executeRawUnsafe(
        `UPDATE "MessageEmbedding" SET embedding = $1::vector WHERE "messageId" = $2`,
        toVectorLiteral(vector),
        message.id
      );

      await runtime.prisma.message.update({
        where: { id: message.id },
        data: { vectorizedAt: new Date() }
      });

      return { skipped: false, entityType: "message" };
    }

    const source =
      job.data.entityType === "server_memory"
        ? await runtime.prisma.serverMemory.findUnique({ where: { id: job.data.entityId } })
        : await runtime.prisma.userMemoryNote.findUnique({ where: { id: job.data.entityId } });

    if (!source) {
      return { skipped: true, reason: "entity not found" };
    }

    const value = "value" in source ? source.value : "";
    const vector = await runtime.embeddingAdapter.embedOne(value);
    await runtime.retrievalService.setEmbedding(job.data.entityType, job.data.entityId, toVectorLiteral(vector));

    return { skipped: false, entityType: job.data.entityType };
  };
}

