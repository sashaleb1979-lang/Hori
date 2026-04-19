import { asErrorMessage } from "@hori/shared";

interface QueueHandle {
  add(jobName: string, payload?: unknown, options?: unknown): Promise<unknown>;
  getJob?(jobId: string): Promise<{ isDelayed(): Promise<boolean>; remove(): Promise<void> } | undefined>;
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
    conversationAnalysis: QueueHandle;
  };
  logger: {
    warn(input: unknown, message?: string): void;
  };
}

function buildJobId(...parts: string[]) {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join("-")
    .replace(/[:\s]+/g, "-");
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
        { jobId: buildJobId("summary", envelope.guildId, envelope.channelId) }
      )
    },
    {
      queue: "profile",
      task: runtime.queues.profile.add(
        "profile",
        { guildId: envelope.guildId, userId: envelope.userId },
        { jobId: buildJobId("profile", envelope.guildId, envelope.userId) }
      )
    },
    {
      queue: "embedding",
      task:
        envelope.content.length >= runtime.env.MESSAGE_EMBED_MIN_CHARS
          ? runtime.queues.embedding.add(
              "embedding",
              { entityType: "message", entityId: envelope.messageId },
              { jobId: buildJobId("embedding", envelope.messageId) }
            )
          : Promise.resolve()
    },
    {
      queue: "topic",
      task: runtime.queues.topic.add(
        "topic",
        { guildId: envelope.guildId, channelId: envelope.channelId, messageId: envelope.messageId },
        { jobId: buildJobId("topic", envelope.messageId) }
      )
    },
    {
      queue: "conversationAnalysis",
      task: (async () => {
        // Remove existing delayed job so delay resets from the latest message
        const jobId = buildJobId("conv-analysis", envelope.guildId, envelope.userId);
        try {
          const existing = await runtime.queues.conversationAnalysis.getJob?.(jobId);
          if (existing && (await existing.isDelayed())) await existing.remove();
        } catch { /* job doesn't exist or already processed */ }
        return runtime.queues.conversationAnalysis.add(
          "conversation-analysis",
          {
            guildId: envelope.guildId,
            userId: envelope.userId,
            channelId: envelope.channelId,
            lastMessageAt: new Date().toISOString()
          },
          {
            jobId,
            delay: 60 * 60 * 1000,
            removeOnComplete: 20,
            removeOnFail: 50
          }
        );
      })()
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