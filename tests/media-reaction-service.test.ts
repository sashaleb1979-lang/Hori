import { describe, expect, it, vi } from "vitest";

import { MediaReactionService } from "@hori/core";
import type { AppPrismaClient } from "@hori/shared";

describe("media reaction service", () => {
  it("selects structured auto-media and records usage", async () => {
    const findFirst = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    const create = vi.fn().mockResolvedValue({ id: "usage-1" });
    const update = vi.fn().mockResolvedValue({ id: "media-1" });
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "media-row-1",
        mediaId: "2",
        type: "image",
        filePath: "assets/memes/2.jpg",
        toneTags: ["confusion"],
        triggerTags: ["confusion"],
        emotionTags: ["confusion"],
        messageKindTags: ["info_question"],
        allowedMoods: ["focused"],
        allowedChannels: ["general"],
        nsfw: false,
        enabled: true,
        autoUseEnabled: true,
        manualOnly: false,
        weight: 3,
        cooldownSec: 600,
        minConfidence: 0.82,
        minIntensity: 0.62,
        lastUsedAt: null
      }
    ]);

    const prisma = {
      mediaUsageLog: {
        findFirst,
        create
      },
      mediaMetadata: {
        findMany,
        update
      }
    } as unknown as AppPrismaClient;

    const service = new MediaReactionService(prisma);
    const result = await service.maybeAttachMedia({
      enabled: true,
      replyText: "Не поняла вопрос.",
      guildId: "guild-1",
      channelId: "channel-1",
      messageId: "message-1",
      channelKind: "general",
      mode: "focused",
      stylePreset: "focused_compact",
      triggerTags: ["confusion", "info_question"],
      emotionTags: ["confusion"],
      messageKind: "info_question",
      confidence: 0.9,
      intensity: 0.8,
      autoTriggered: true,
      reasonKey: "confusion",
      globalCooldownSec: 7200
    });

    expect(result.payload.media?.mediaId).toBe("2");
    expect(result.trace.selected).toBe(true);
    expect(create).toHaveBeenCalled();
    expect(update).toHaveBeenCalled();
  });

  it("blocks auto-media during global cooldown", async () => {
    const prisma = {
      mediaUsageLog: {
        findFirst: vi.fn().mockResolvedValue({ usedAt: new Date() })
      },
      mediaMetadata: {
        findMany: vi.fn()
      }
    } as unknown as AppPrismaClient;

    const service = new MediaReactionService(prisma);
    const result = await service.maybeAttachMedia({
      enabled: true,
      replyText: "Сейчас лучше без картинки.",
      guildId: "guild-1",
      channelId: "channel-1",
      triggerTags: ["confusion"],
      autoTriggered: true,
      globalCooldownSec: 7200
    });

    expect(result.trace.selected).toBe(false);
    expect(result.trace.reason).toBe("global_auto_cooldown");
  });
});