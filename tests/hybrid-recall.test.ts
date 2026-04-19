import { describe, expect, it, vi } from "vitest";

import { RetrievalService } from "@hori/memory";
import type { AppPrismaClient } from "@hori/shared";

describe("hybrid recall", () => {
  it("merges vector and lexical hits with RRF reasons", async () => {
    const createdAt = new Date("2026-04-12T12:00:00Z");
    const rawQueries: Array<{ sql: string; params: unknown[] }> = [];
    const prisma = {
      $queryRawUnsafe: async (sql: string, ...params: unknown[]) => {
        rawQueries.push({ sql, params });
        if (sql.includes('"ServerMemory"')) {
          return [
            {
              scope: "server",
              id: "server-1",
              key: "pizza-rule",
              value: "В канале часто обсуждают пиццу.",
              type: "fact",
              createdAt,
              userId: null
            }
          ];
        }

        if (sql.includes('"ChannelMemoryNote"')) {
          return [
            {
              scope: "channel",
              id: "channel-1",
              key: "local-joke",
              value: "Локальная шутка про сыр.",
              type: "channel_fact",
              createdAt,
              userId: null
            }
          ];
        }

        return [];
      },
      serverMemory: {
        findMany: async () => [
          {
            id: "server-1",
            key: "pizza-rule",
            value: "В канале часто обсуждают пиццу.",
            type: "fact",
            createdAt
          }
        ]
      },
      userMemoryNote: {
        findMany: async () => [
          {
            id: "user-1",
            key: "likes-pizza",
            value: "Пользователь любит пиццу.",
            createdAt,
            userId: "user-1"
          }
        ]
      },
      channelMemoryNote: {
        findMany: async () => []
      },
      eventMemory: {
        findMany: async () => []
      },
      message: {
        findMany: async () => []
      }
    } as unknown as AppPrismaClient;

    const retrieval = new RetrievalService(prisma);
    const result = await retrieval.hybridRecall({
      guildId: "guild-1",
      channelId: "channel-1",
      userId: "user-1",
      query: "пицца сыр",
      queryEmbedding: [0.1, 0.2, 0.3],
      limit: 3
    });

    expect(result[0].sourceId).toBe("server-1");
    expect(result[0].reason).toBe("vector+lexical");
    expect(result.map((entry) => entry.scope)).toContain("user");
    expect(result.map((entry) => entry.scope)).toContain("channel");
    expect(rawQueries.some((query) => query.sql.includes("vector_dims(embedding) = $3"))).toBe(true);
    expect(rawQueries.some((query) => query.sql.includes("e.dimensions = $4"))).toBe(true);
    expect(rawQueries.some((query) => query.params.includes(3))).toBe(true);
  });

  it("falls back to lexical recall when stored vector dimensions differ", async () => {
    const createdAt = new Date("2026-04-12T12:00:00Z");
    const logger = {
      warn: vi.fn()
    };
    const prisma = {
      $queryRawUnsafe: async () => {
        throw {
          code: "P2010",
          meta: {
            message: "ERROR: different vector dimensions 768 and 1536"
          }
        };
      },
      serverMemory: {
        findMany: async () => [
          {
            id: "server-1",
            key: "pizza-rule",
            value: "В канале часто обсуждают пиццу.",
            type: "fact",
            createdAt
          }
        ]
      },
      userMemoryNote: {
        findMany: async () => []
      },
      channelMemoryNote: {
        findMany: async () => []
      },
      eventMemory: {
        findMany: async () => []
      },
      message: {
        findMany: async () => []
      }
    } as unknown as AppPrismaClient;

    const retrieval = new RetrievalService(prisma, logger as never);
    const result = await retrieval.hybridRecall({
      guildId: "guild-1",
      channelId: "channel-1",
      userId: "user-1",
      query: "пицца сыр",
      queryEmbedding: [0.1, 0.2, 0.3],
      limit: 3
    });

    expect(result).toEqual([
      expect.objectContaining({
        scope: "server",
        sourceId: "server-1",
        reason: "lexical"
      })
    ]);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "hybrid_recall" }),
      "vector retrieval skipped because embedding dimensions differ"
    );
  });
});
