import { describe, expect, it, vi } from "vitest";

import { MessageIngestService } from "@hori/analytics";

describe("MessageIngestService", () => {
  it("drops replyToMessageId when the parent message is missing from the analytics store", async () => {
    const messageUpsert = vi.fn().mockResolvedValue(undefined);
    const tx = {
      guild: { upsert: vi.fn().mockResolvedValue(undefined) },
      channelConfig: { upsert: vi.fn().mockResolvedValue(undefined) },
      user: { upsert: vi.fn().mockResolvedValue(undefined) },
      message: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: messageUpsert
      },
      userStats: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue(undefined)
      },
      channelStats: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue(undefined)
      },
      userDailyAggregate: { upsert: vi.fn().mockResolvedValue(undefined) },
      channelDailyAggregate: { upsert: vi.fn().mockResolvedValue(undefined) }
    };
    const prisma = {
      message: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null)
      },
      $transaction: vi.fn(async (callback: (value: typeof tx) => Promise<void>) => callback(tx))
    };
    const logger = {
      debug: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn()
    };

    const service = new MessageIngestService(prisma as never, logger as never);

    await service.ingestMessage({
      messageId: "msg-1",
      guildId: "guild-1",
      channelId: "channel-1",
      userId: "user-1",
      username: "HoriUser",
      displayName: "Hori User",
      content: "reply message",
      createdAt: new Date("2026-04-10T16:11:00.000Z"),
      replyToMessageId: "missing-parent",
      mentionCount: 0,
      mentionedBot: false,
      mentionsBotByName: false,
      mentionedUserIds: [],
      isModerator: false,
      explicitInvocation: false
    });

    expect(messageUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          replyToMessageId: undefined
        })
      })
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: "msg-1",
        replyToMessageId: "missing-parent"
      }),
      "reply target is missing in analytics store, saving message without relation"
    );
  });
});
