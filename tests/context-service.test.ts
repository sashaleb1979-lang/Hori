import { describe, expect, it, vi } from "vitest";

import { ContextService } from "@hori/memory";

describe("ContextService", () => {
  it("uses compacted session messages for chat intent when session buffer is available", async () => {
    const getCompactedSessionMessages = vi.fn(async () => ([
      {
        id: "summary:1",
        author: "Сводка",
        userId: "session-summary",
        isBot: true,
        content: "[Сводка] важный старый контекст",
        createdAt: new Date("2026-05-03T00:00:00.000Z"),
        replyToMessageId: null
      }
    ]));

    const prisma = {
      message: {
        findMany: vi.fn()
      }
    } as never;

    const service = new ContextService(
      prisma,
      undefined,
      undefined,
      { getCompactedSessionMessages } as never
    );

    const bundle = await service.buildContext({
      guildId: "g",
      channelId: "c",
      userId: "u",
      limit: 12,
      intent: "chat",
      message: {
        messageId: "m1",
        guildId: "g",
        channelId: "c",
        userId: "u",
        username: "user",
        content: "привет",
        createdAt: new Date(),
        mentionCount: 1,
        mentionedBot: true,
        mentionsBotByName: true,
        mentionedUserIds: [],
        triggerSource: "mention",
        isModerator: false,
        explicitInvocation: true
      }
    });

    expect(getCompactedSessionMessages).toHaveBeenCalledWith("g", "u", "c");
    expect(prisma.message.findMany).not.toHaveBeenCalled();
    expect(bundle.recentMessages).toHaveLength(1);
    expect(bundle.recentMessages[0]?.content).toContain("важный старый контекст");
  });

  it("propagates target metadata from stored message flags in non-chat queries", async () => {
    const prisma = {
      message: {
        findMany: vi.fn(async () => ([
          {
            id: "m1",
            userId: "bot-user",
            content: "ответ",
            createdAt: new Date("2026-05-03T00:00:00.000Z"),
            replyToMessageId: "u1",
            flags: {
              targetUserId: "user-1",
              targetMessageId: "u1"
            },
            user: {
              isBot: true,
              username: "Hori",
              globalName: "Hori"
            }
          }
        ]))
      }
    } as never;

    const service = new ContextService(prisma);

    const bundle = await service.buildContext({
      guildId: "g",
      channelId: "c",
      userId: "u",
      limit: 12,
      intent: "summary"
    });

    expect(bundle.recentMessages[0]?.targetUserId).toBe("user-1");
    expect(bundle.recentMessages[0]?.targetMessageId).toBe("u1");
  });
});