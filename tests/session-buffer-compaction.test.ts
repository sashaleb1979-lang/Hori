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

  it("builds a compaction candidate only when raw unsummarized tail is long enough", async () => {
    const base = new Date("2026-05-03T00:00:00.000Z");
    const rows = Array.from({ length: 60 }, (_, index) => makeMessage(
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
      chunkMessages: 50,
      tailMessages: 8,
      maxMessages: 500
    });

    expect(candidate).toBeTruthy();
    expect(candidate?.messages).toHaveLength(50);
    expect(candidate?.messages[0]?.id).toBe("m1");
    expect(candidate?.rangeEndMessageId).toBe("m50");
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
      rangeEnd: rows[49]!.createdAt,
      rangeEndMessageId: "m50",
      summary: "summary-1",
      messageCount: 50
    });

    const rendered = await service.getCompactedSessionMessages("g", "u", "c");

    expect(rendered[0]?.id).toBe("session-summary:m50");
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
      const start = segmentIndex * 50;
      const end = start + 49;
      await service.storeCompactionSegment({
        guildId: "g",
        userId: "u",
        channelId: "c",
        sessionSince: rows[0]!.createdAt.toISOString(),
        rangeStart: rows[start]!.createdAt,
        rangeEnd: rows[end]!.createdAt,
        rangeEndMessageId: rows[end]!.id,
        summary: `summary-${segmentIndex + 1}`,
        messageCount: 50
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

    for (let segmentIndex = 0; segmentIndex < 10; segmentIndex += 1) {
      const start = segmentIndex * 50;
      const end = start + 49;
      await service.storeCompactionSegment({
        guildId: "g",
        userId: "u",
        channelId: "c",
        sessionSince: rows[0]!.createdAt.toISOString(),
        rangeStart: rows[start]!.createdAt,
        rangeEnd: rows[end]!.createdAt,
        rangeEndMessageId: rows[end]!.id,
        summary: `summary-${segmentIndex + 1}`,
        messageCount: 50
      });
    }

    const candidate = await service.getCompactionCandidate("g", "u", "c", {
      chunkMessages: 50,
      tailMessages: 8,
      maxMessages: 500
    });

    expect(candidate).toBeTruthy();
    expect(candidate?.messages[0]?.id).toBe("m501");
    expect(candidate?.rangeEndMessageId).toBe("m550");
  });
});