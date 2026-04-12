import { asErrorMessage } from "@hori/shared";

interface QueueHandle {
  add(jobName: string, payload?: unknown, options?: unknown): Promise<unknown>;
}

interface QueueRuntime {
  env: {
    MESSAGE_EMBED_MIN_CHARS: number;
  };
  queues: {
    summary: QueueHandle;
    profile: QueueHandle;
    embedding: QueueHandle;
    topic: QueueHandle;
  };
  logger: {
    warn(input: unknown, message?: string): void;
  };
}

export async function enqueueBackgroundJobs(runtime: QueueRuntime, envelope: {
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
    },
    {
      queue: "topic",
      task: runtime.queues.topic.add(
        "topic",
        { guildId: envelope.guildId, channelId: envelope.channelId, messageId: envelope.messageId },
        { jobId: `topic:${envelope.messageId}` }
      )
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