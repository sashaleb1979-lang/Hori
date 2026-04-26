import { describe, expect, it, vi } from "vitest";

import { enqueueBackgroundJobs } from "../apps/bot/src/router/background-jobs";

describe("enqueueBackgroundJobs", () => {
  it("sanitizes BullMQ job ids so they do not contain colons", async () => {
    const addCalls: Array<unknown> = [];
    const createQueue = () => ({
      add: vi.fn().mockImplementation((_jobName: string, _payload?: unknown, options?: unknown) => {
        addCalls.push(options);
        return Promise.resolve(null);
      })
    });

    const runtime = {
      env: {
        MESSAGE_EMBED_MIN_CHARS: 1
      },
      queues: {
        summary: createQueue(),
        profile: createQueue(),
        embedding: createQueue(),
        topic: createQueue(),
        session: createQueue()
      },
      logger: {
        warn: vi.fn()
      }
    };

    await enqueueBackgroundJobs(runtime, {
      guildId: "guild:1",
      channelId: "channel:2",
      userId: "user:3",
      messageId: "message:4",
      content: "hello"
    });

    const jobIds = addCalls
      .map((entry) => entry as { jobId?: string })
      .map((entry) => entry.jobId)
      .filter((value): value is string => Boolean(value));

    expect(jobIds).toHaveLength(5);
    expect(jobIds.every((value) => !value.includes(":"))).toBe(true);
  });
});
