import { describe, expect, it } from "vitest";

import { RetrievalService } from "@hori/memory";
import type { AppPrismaClient } from "@hori/shared";

describe("hybrid recall", () => {
  it("merges vector and lexical hits with RRF reasons", async () => {
    const createdAt = new Date("2026-04-12T12:00:00Z");
    const prisma = {
      $queryRawUnsafe: async (sql: string) => {
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
  });
});
