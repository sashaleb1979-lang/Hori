import { describe, expect, it, vi } from "vitest";

import { enqueueBackgroundJobs } from "../apps/bot/src/router/background-jobs";

describe("enqueueBackgroundJobs", () => {
  it("sanitizes BullMQ job ids so they do not contain colons", async () => {
    const addCalls: Array<unknown> = [];
    const createQueue = () => ({
      add: vi.fn().mockImplementation((_jobName: string, _payload?: unknown, options?: unknown) => {
        addCalls.push(options);
        return Promise.resolve(null);
      }),
      getJob: vi.fn().mockResolvedValue(undefined)
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
        conversationAnalysis: createQueue(),
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

    expect(jobIds).toHaveLength(6);
    expect(jobIds.every((value) => !value.includes(":"))).toBe(true);
  });

  it("resets the delayed session job from the latest channel message", async () => {
    const delayedJob = {
      isDelayed: vi.fn().mockResolvedValue(true),
      remove: vi.fn().mockResolvedValue(undefined)
    };
    const createQueue = () => ({
      add: vi.fn().mockResolvedValue(null),
      getJob: vi.fn().mockResolvedValue(undefined)
    });
    const sessionQueue = {
      add: vi.fn().mockResolvedValue(null),
      getJob: vi.fn().mockResolvedValue(delayedJob)
    };

    const runtime = {
      env: {
        MESSAGE_EMBED_MIN_CHARS: 1
      },
      queues: {
        summary: createQueue(),
        profile: createQueue(),
        embedding: createQueue(),
        topic: createQueue(),
        conversationAnalysis: createQueue(),
        session: sessionQueue
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

    expect(sessionQueue.getJob).toHaveBeenCalledWith("session-guild-1-channel-2");
    expect(delayedJob.remove).toHaveBeenCalled();
    expect(sessionQueue.add).toHaveBeenCalledWith(
      "session",
      { guildId: "guild:1", channelId: "channel:2", userId: "user:3" },
      expect.objectContaining({
        jobId: "session-guild-1-channel-2",
        delay: 10 * 60 * 1000,
        removeOnComplete: 20,
        removeOnFail: 50
      })
    );
  });

  it("skips session lifecycle queues when sleep suppresses new sessions", async () => {
    const createQueue = () => ({
      add: vi.fn().mockResolvedValue(null),
      getJob: vi.fn().mockResolvedValue(undefined)
    });

    const conversationAnalysis = createQueue();
    const session = createQueue();
    const runtime = {
      env: {
        MESSAGE_EMBED_MIN_CHARS: 1
      },
      queues: {
        summary: createQueue(),
        profile: createQueue(),
        embedding: createQueue(),
        topic: createQueue(),
        conversationAnalysis,
        session
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
    }, {
      suppressSessionLifecycle: true
    });

    expect(conversationAnalysis.add).not.toHaveBeenCalled();
    expect(session.add).not.toHaveBeenCalled();
  });
});
