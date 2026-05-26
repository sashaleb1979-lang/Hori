import { describe, expect, it, vi } from "vitest";

import { SessionBufferService } from "@hori/memory";

class MemoryRedis {
  private readonly store = new Map<string, string>();

  async get(key: string) {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string) {
    this.store.set(key, value);
    return "OK";
  }

  async expire(_key: string, _ttlSec: number) {
    return 1;
  }

  async del(...keys: string[]) {
    for (const key of keys) {
      this.store.delete(key);
    }
    return keys.length;
  }
}

function makeMessage(id: string, createdAt: Date, isBot: boolean, content: string) {
  return {
    id,
    userId: isBot ? "bot" : "user",
    content,
    createdAt,
    replyToMessageId: null,
    user: {
      isBot,
      username: isBot ? "Hori" : "User",
      globalName: isBot ? "Hori" : "User"
    }
  };
}

describe("SessionBufferService compaction", () => {
  it("renders immutable summary chunks before the remaining live tail", async () => {
    const base = new Date("2026-05-03T00:00:00.000Z");
    const rows = [
      makeMessage("m1", new Date(base.getTime() + 1_000), false, "первое"),
      makeMessage("m2", new Date(base.getTime() + 2_000), true, "второе"),
      makeMessage("m3", new Date(base.getTime() + 3_000), false, "третье"),
      makeMessage("m4", new Date(base.getTime() + 4_000), true, "четвёртое")
    ];

    const prisma = {
      message: {
        findMany: vi.fn(async (args?: { select?: { createdAt?: boolean }; orderBy?: { createdAt: "asc" | "desc" }; take?: number }) => {
          if (args?.select?.createdAt) {
            return [...rows].reverse().slice(0, args.take ?? rows.length).map((row) => ({ createdAt: row.createdAt }));
          }

          const ordered = args?.orderBy?.createdAt === "desc" ? [...rows].reverse() : rows;
          return ordered.slice(0, args?.take ?? ordered.length);
        })
      }
    } as never;

    const redis = new MemoryRedis() as never;
    const service = new SessionBufferService(prisma, redis);

    await service.storeCompactionSegment({
      guildId: "g",
      userId: "u",
      channelId: "c",
      sessionSince: rows[0]!.createdAt.toISOString(),
      rangeStart: rows[0]!.createdAt,
      rangeEnd: rows[1]!.createdAt,
      rangeEndMessageId: "m2",
      summary: "важное из первых двух сообщений",
      messageCount: 2
    });

    const rendered = await service.getCompactedSessionMessages("g", "u", "c");

    expect(rendered.map((message) => message.id)).toEqual([
      "session-summary:m2",
      "m3",
      "m4"
    ]);
    expect(rendered[0]?.content).toContain("важное из первых двух сообщений");
    expect(rendered[1]?.content).toBe("третье");
  });

  it("preserves bot target metadata from stored message flags", async () => {
    const base = new Date("2026-05-03T00:00:00.000Z");
    const rows = [
      {
        ...makeMessage("m1", new Date(base.getTime() + 1_000), false, "первое"),
        flags: null
      },
      {
        ...makeMessage("m2", new Date(base.getTime() + 2_000), true, "второе"),
        flags: {
          targetUserId: "user",
          targetMessageId: "m1"
        }
      }
    ];

    const prisma = {
      message: {
        findMany: vi.fn(async (args?: { select?: { createdAt?: boolean }; orderBy?: { createdAt: "asc" | "desc" }; take?: number }) => {
          if (args?.select?.createdAt) {
            return [...rows].reverse().slice(0, args.take ?? rows.length).map((row) => ({ createdAt: row.createdAt }));
          }

          const ordered = args?.orderBy?.createdAt === "desc" ? [...rows].reverse() : rows;
          return ordered.slice(0, args?.take ?? ordered.length);
        })
      }
    } as never;

    const service = new SessionBufferService(prisma, new MemoryRedis() as never);
    const messages = await service.getSessionMessages("g", "user", "c");

    expect(messages[1]?.targetUserId).toBe("user");
    expect(messages[1]?.targetMessageId).toBe("m1");
  });

  it("drops bot turns that explicitly target another user from the per-user session window", async () => {
    const base = new Date("2026-05-03T00:00:00.000Z");
    const rows = [
      {
        ...makeMessage("m1", new Date(base.getTime() + 1_000), false, "моё сообщение"),
        flags: null
      },
      {
        ...makeMessage("m2", new Date(base.getTime() + 2_000), true, "ответ не мне"),
        flags: {
          targetUserId: "other-user",
          targetMessageId: "m-other"
        }
      },
      {
        ...makeMessage("m3", new Date(base.getTime() + 3_000), true, "ответ мне"),
        flags: {
          targetUserId: "user",
          targetMessageId: "m1"
        }
      }
    ];

    const prisma = {
      message: {
        findMany: vi.fn(async (args?: { select?: { createdAt?: boolean }; orderBy?: { createdAt: "asc" | "desc" }; take?: number }) => {
          if (args?.select?.createdAt) {
            return [...rows].reverse().slice(0, args.take ?? rows.length).map((row) => ({ createdAt: row.createdAt }));
          }

          const ordered = args?.orderBy?.createdAt === "desc" ? [...rows].reverse() : rows;
          return ordered.slice(0, args?.take ?? ordered.length);
        })
      }
    } as never;

    const service = new SessionBufferService(prisma, new MemoryRedis() as never);
    const messages = await service.getSessionMessages("g", "user", "c");

    expect(messages.map((message) => message.id)).toEqual(["m1", "m3"]);
  });

  it("builds a compaction candidate only when raw unsummarized tail is long enough", async () => {
    const base = new Date("2026-05-03T00:00:00.000Z");
    const rows = Array.from({ length: 54 }, (_, index) => makeMessage(
      `m${index + 1}`,
      new Date(base.getTime() + (index + 1) * 1_000),
      index % 2 === 1,
      `msg-${index + 1}`
    ));

    const prisma = {
      message: {
        findMany: vi.fn(async (args?: { select?: { createdAt?: boolean } }) => {
          if (args?.select?.createdAt) {
            return [...rows].reverse().map((row) => ({ createdAt: row.createdAt }));
          }

          return rows;
        })
      }
    } as never;

    const service = new SessionBufferService(prisma, new MemoryRedis() as never);
    const candidate = await service.getCompactionCandidate("g", "u", "c", {
      chunkMessages: 46,
      tailMessages: 8,
      maxMessages: 500
    });

    expect(candidate).toBeTruthy();
    expect(candidate?.messages).toHaveLength(46);
    expect(candidate?.messages[0]?.id).toBe("m1");
    expect(candidate?.rangeEndMessageId).toBe("m46");
  });

  it("uses the most recent raw window for chat rendering instead of the oldest messages", async () => {
    const base = new Date("2026-05-03T00:00:00.000Z");
    const rows = Array.from({ length: 900 }, (_, index) => makeMessage(
      `m${index + 1}`,
      new Date(base.getTime() + (index + 1) * 1_000),
      index % 2 === 1,
      `msg-${index + 1}`
    ));

    const prisma = {
      message: {
        findMany: vi.fn(async (args?: { select?: { createdAt?: boolean }; orderBy?: { createdAt: "asc" | "desc" }; take?: number }) => {
          if (args?.select?.createdAt) {
            return [...rows].reverse().slice(0, args.take ?? rows.length).map((row) => ({ createdAt: row.createdAt }));
          }

          const ordered = args?.orderBy?.createdAt === "desc" ? [...rows].reverse() : rows;
          return ordered.slice(0, args?.take ?? ordered.length);
        })
      }
    } as never;

    const redis = new MemoryRedis() as never;
    const service = new SessionBufferService(prisma, redis);

    await service.storeCompactionSegment({
      guildId: "g",
      userId: "u",
      channelId: "c",
      sessionSince: rows[0]!.createdAt.toISOString(),
      rangeStart: rows[0]!.createdAt,
      rangeEnd: rows[45]!.createdAt,
      rangeEndMessageId: "m46",
      summary: "summary-1",
      messageCount: 46
    });

    const rendered = await service.getCompactedSessionMessages("g", "u", "c");

    expect(rendered[0]?.id).toBe("session-summary:m46");
    expect(rendered.some((message) => message.id === "m900")).toBe(true);
    expect(rendered.some((message) => message.id === "m1")).toBe(false);
  });

  it("survives multiple immutable summary segments across a long session", async () => {
    const base = new Date("2026-05-03T00:00:00.000Z");
    const rows = Array.from({ length: 520 }, (_, index) => makeMessage(
      `m${index + 1}`,
      new Date(base.getTime() + (index + 1) * 1_000),
      index % 2 === 1,
      `msg-${index + 1}`
    ));

    const prisma = {
      message: {
        findMany: vi.fn(async (args?: { select?: { createdAt?: boolean }; orderBy?: { createdAt: "asc" | "desc" }; take?: number }) => {
          if (args?.select?.createdAt) {
            return [...rows].reverse().slice(0, args.take ?? rows.length).map((row) => ({ createdAt: row.createdAt }));
          }

          const ordered = args?.orderBy?.createdAt === "desc" ? [...rows].reverse() : rows;
          return ordered.slice(0, args?.take ?? ordered.length);
        })
      }
    } as never;

    const redis = new MemoryRedis() as never;
    const service = new SessionBufferService(prisma, redis);

    for (let segmentIndex = 0; segmentIndex < 10; segmentIndex += 1) {
      const start = segmentIndex * 46;
      const end = start + 45;
      await service.storeCompactionSegment({
        guildId: "g",
        userId: "u",
        channelId: "c",
        sessionSince: rows[0]!.createdAt.toISOString(),
        rangeStart: rows[start]!.createdAt,
        rangeEnd: rows[end]!.createdAt,
        rangeEndMessageId: rows[end]!.id,
        summary: `summary-${segmentIndex + 1}`,
        messageCount: 46
      });
    }

    const rendered = await service.getCompactedSessionMessages("g", "u", "c");

    expect(rendered.filter((message) => message.id.startsWith("session-summary:"))).toHaveLength(10);
    expect(rendered[0]?.content).toContain("summary-1");
    expect(rendered[9]?.content).toContain("summary-10");
    expect(rendered[rendered.length - 1]?.id).toBe("m520");
  });

  it("continues compacting past the first 500 raw messages", async () => {
    const base = new Date("2026-05-03T00:00:00.000Z");
    const rows = Array.from({ length: 560 }, (_, index) => makeMessage(
      `m${index + 1}`,
      new Date(base.getTime() + (index + 1) * 1_000),
      index % 2 === 1,
      `msg-${index + 1}`
    ));

    const prisma = {
      message: {
        findMany: vi.fn(async (args?: { select?: { createdAt?: boolean }; orderBy?: { createdAt: "asc" | "desc" }; take?: number; where?: { createdAt?: { gte?: Date } } }) => {
          const filteredRows = rows.filter((row) => {
            const gte = args?.where?.createdAt?.gte;
            return !gte || row.createdAt >= gte;
          });

          if (args?.select?.createdAt) {
            return [...filteredRows].reverse().slice(0, args.take ?? filteredRows.length).map((row) => ({ createdAt: row.createdAt }));
          }

          const ordered = args?.orderBy?.createdAt === "desc" ? [...filteredRows].reverse() : filteredRows;
          return ordered.slice(0, args?.take ?? ordered.length);
        })
      }
    } as never;

    const redis = new MemoryRedis() as never;
    const service = new SessionBufferService(prisma, redis);

    for (let segmentIndex = 0; segmentIndex < 11; segmentIndex += 1) {
      const start = segmentIndex * 46;
      const end = start + 45;
      await service.storeCompactionSegment({
        guildId: "g",
        userId: "u",
        channelId: "c",
        sessionSince: rows[0]!.createdAt.toISOString(),
        rangeStart: rows[start]!.createdAt,
        rangeEnd: rows[end]!.createdAt,
        rangeEndMessageId: rows[end]!.id,
        summary: `summary-${segmentIndex + 1}`,
        messageCount: 46
      });
    }

    const candidate = await service.getCompactionCandidate("g", "u", "c", {
      chunkMessages: 46,
      tailMessages: 8,
      maxMessages: 500
    });

    expect(candidate).toBeTruthy();
    expect(candidate?.messages[0]?.id).toBe("m507");
    expect(candidate?.rangeEndMessageId).toBe("m552");
  });

  it("stores and clears guild sleep state", async () => {
    const prisma = {
      message: {
        findMany: vi.fn().mockResolvedValue([])
      }
    } as never;

    const service = new SessionBufferService(prisma, new MemoryRedis() as never);
    const sleepUntil = new Date(Date.now() + 60_000);

    await service.setGuildSleepUntil("guild-1", sleepUntil);

    expect(await service.isGuildSleeping("guild-1")).toBe(true);
    expect(await service.getGuildSleepUntil("guild-1")).toEqual(sleepUntil);

    await service.clearGuildSleep("guild-1");

    expect(await service.isGuildSleeping("guild-1")).toBe(false);
    expect(await service.getGuildSleepUntil("guild-1")).toBeNull();
  });

  it("tracks explicit channel session state across activity, compaction and reset", async () => {
    const prisma = {
      message: {
        findMany: vi.fn().mockResolvedValue([])
      }
    } as never;

    const service = new SessionBufferService(prisma, new MemoryRedis() as never);
    const start = new Date("2026-05-13T10:00:00.000Z");
    const secondUserAt = new Date("2026-05-13T10:01:00.000Z");
    const compactionAt = new Date("2026-05-13T10:02:00.000Z");
    const nextSessionAt = new Date("2026-05-13T10:13:00.000Z");

    await service.recordChannelActivity({
      guildId: "g",
      channelId: "c",
      userId: "u1",
      createdAt: start
    });
    await service.recordChannelActivity({
      guildId: "g",
      channelId: "c",
      userId: "u2",
      createdAt: secondUserAt
    });
    await service.storeCompactionSegment({
      guildId: "g",
      userId: "u1",
      channelId: "c",
      sessionSince: start.toISOString(),
      rangeStart: start,
      rangeEnd: compactionAt,
      rangeEndMessageId: "m46",
      summary: "summary",
      messageCount: 46
    });
    await service.setChannelSessionSleepUntil("g", "c", new Date("2026-05-13T10:20:00.000Z"));

    const current = await service.getChannelSessionState("g", "c");

    expect(current?.sessionSince).toEqual(start);
    expect(current?.lastActivityAt).toEqual(compactionAt);
    expect(current?.participants).toEqual(["u1", "u2"]);
    expect(current?.hasCompaction).toBe(true);
    expect(current?.compactionCount).toBe(1);
    expect(current?.sleepUntil).toEqual(new Date("2026-05-13T10:20:00.000Z"));

    await service.recordChannelActivity({
      guildId: "g",
      channelId: "c",
      userId: "u3",
      createdAt: nextSessionAt
    });

    const next = await service.getChannelSessionState("g", "c");

    expect(next?.sessionSince).toEqual(nextSessionAt);
    expect(next?.lastActivityAt).toEqual(nextSessionAt);
    expect(next?.participants).toEqual(["u3"]);
    expect(next?.hasCompaction).toBe(false);
    expect(next?.compactionCount).toBe(0);
    expect(next?.sleepUntil).toBeNull();
  });
});