import { describe, expect, it } from "vitest";

import { MemoryFormationService } from "@hori/memory";
import type { AppEnv } from "@hori/config";
import type { AppPrismaClient } from "@hori/shared";

describe("memory-formation", () => {
  it("runs extract -> decide -> apply and writes a user memory note", async () => {
    const userMemories: Array<Record<string, unknown>> = [];

    const prisma = {
      serverMemory: {
        findMany: async () => [],
        deleteMany: async () => ({ count: 0 }),
        update: async () => {
          throw new Error("server update should not be used in this test");
        },
      },
      userMemoryNote: {
        findMany: async () => userMemories.filter((item) => item.active !== false),
        upsert: async (args: {
          where: { guildId_userId_key: { guildId: string; userId: string; key: string } };
          update: Record<string, unknown>;
          create: Record<string, unknown>;
        }) => {
          const key = `${args.where.guildId_userId_key.guildId}:${args.where.guildId_userId_key.userId}:${args.where.guildId_userId_key.key}`;
          const existing = userMemories.find((item) => item._key === key);
          const next = existing
            ? Object.assign(existing, args.update)
            : { id: `note-${userMemories.length + 1}`, _key: key, active: true, ...args.create };
          if (!existing) {
            userMemories.push(next);
          }
          return next;
        },
        update: async () => {
          throw new Error("user update should not be used in this test");
        },
        updateMany: async () => ({ count: 0 }),
      },
      channelMemoryNote: {
        findMany: async () => [],
      },
      eventMemory: {
        findMany: async () => [],
      },
    } as unknown as AppPrismaClient;

    const retrieval = {
      findRelevantServerMemory: async () => [],
      findRelevantUserMemory: async () => [],
      findRelevantChannelMemory: async () => [],
      findRelevantEventMemory: async () => [],
      rememberServerFact: async () => ({ id: "server-1" }),
      rememberChannelFact: async () => ({ id: "channel-1" }),
      rememberEventFact: async () => ({ id: "event-1" }),
      setEmbedding: async () => undefined,
    };

    let chatCall = 0;
    const llm = {
      chat: async () => {
        chatCall += 1;
        if (chatCall === 1) {
          return { message: { role: "assistant" as const, content: "Пользователь просит не спамить и не пинговать его без причины." } };
        }
        if (chatCall === 2) {
          return { message: { role: "assistant" as const, content: JSON.stringify({ facts: ["Пользователь не любит лишние пинги и спам."] }) } };
        }
        return {
          message: {
            role: "assistant" as const,
            content: JSON.stringify({
              actions: [
                {
                  event: "ADD",
                  scope: "user",
                  key: "no-spam-pings",
                  text: "Не пинговать пользователя без причины и не спамить ему.",
                },
              ],
            }),
          },
        };
      },
      embed: async () => [[0.1, 0.2, 0.3]],
    };

    const env = {
      OLLAMA_FAST_MODEL: "fast-model",
      OLLAMA_SMART_MODEL: "smart-model",
      OLLAMA_EMBED_MODEL: "embed-model",
    } as AppEnv;

    const service = new MemoryFormationService(prisma, retrieval, llm, env);
    const result = await service.runFormation({
      guildId: "guild-1",
      channelId: "channel-1",
      userId: "user-1",
      messages: [
        { role: "user", content: "не спамь мне и не пингуй без причины" },
      ],
    });

    expect(result.extractedFacts).toBe(1);
    expect(result.added).toBe(1);
    expect(userMemories).toHaveLength(1);
    expect(String(userMemories[0].value)).toContain("Не пинговать");
  });
});
