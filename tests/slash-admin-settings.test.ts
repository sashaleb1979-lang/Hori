import { defaultPersonaSettings } from "@hori/config";
import type { AppPrismaClient } from "@hori/shared";
import { describe, expect, it, vi } from "vitest";

import { SlashAdminService } from "../packages/core/src/services/slash-admin-service";

describe("SlashAdminService settings", () => {
  it("updates style with language and interject controls while clearing resettable fields", async () => {
    const guildUpsert = vi.fn().mockResolvedValue({
      botName: defaultPersonaSettings.botName,
      preferredLanguage: defaultPersonaSettings.preferredLanguage,
      roughnessLevel: 2,
      sarcasmLevel: 2,
      roastLevel: 2,
      interjectTendency: 4,
      replyLength: "short",
      preferredStyle: defaultPersonaSettings.preferredStyle,
      forbiddenWords: [],
      forbiddenTopics: []
    });
    const prisma = {
      guild: {
        upsert: guildUpsert
      }
    } as unknown as AppPrismaClient;
    const service = new SlashAdminService(prisma, {} as never, {} as never, {} as never, {} as never);

    const result = await service.updateStyle("guild-1", {
      preferredLanguage: null,
      interjectTendency: 4,
      preferredStyle: null,
      forbiddenWords: null,
      forbiddenTopics: null
    });

    expect(guildUpsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        preferredLanguage: defaultPersonaSettings.preferredLanguage,
        interjectTendency: 4,
        preferredStyle: defaultPersonaSettings.preferredStyle,
        forbiddenWords: [],
        forbiddenTopics: []
      })
    }));
    expect(result).toContain("lang=ru");
    expect(result).toContain("interject=4");
    expect(result).toContain("forbiddenWords=none");
  });

  it("stores response-length overrides for channel policy", async () => {
    const channelUpsert = vi.fn().mockResolvedValue({});
    const invalidate = vi.fn();
    const prisma = {
      channelConfig: {
        upsert: channelUpsert
      }
    } as unknown as AppPrismaClient;
    const service = new SlashAdminService(prisma, {} as never, {} as never, {} as never, {} as never, {
      invalidate
    } as never);

    const result = await service.channelConfig("guild-1", "channel-1", {
      responseLengthOverride: null
    });

    expect(channelUpsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        responseLengthOverride: null
      }),
      create: expect.objectContaining({
        responseLengthOverride: null
      })
    }));
    expect(invalidate).toHaveBeenCalledWith("guild-1", "channel-1");
    expect(result).toContain("responseLengthOverride=inherit");
  });

  it("builds an owner dossier from profile, memory, stats and album data", async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: "user-1", username: "sasha", globalName: "Sasha" })
      },
      userProfile: {
        findUnique: vi.fn().mockResolvedValue({
          summaryShort: "Говорит резко, но по делу.",
          styleTags: ["sharp", "dry"],
          topicTags: ["tech", "ops"],
          confidenceScore: 0.91,
          sourceWindowSize: 80,
          lastProfiledAt: new Date("2026-04-13T10:00:00Z")
        })
      },
      userMemoryNote: {
        findMany: vi.fn().mockResolvedValue([{ key: "timezone", value: "UTC+3" }])
      },
      userStats: {
        findUnique: vi.fn().mockResolvedValue({
          totalMessages: 420,
          totalReplies: 90,
          totalMentions: 17,
          avgMessageLength: 48.2,
          conversationStarterCount: 12,
          topChannelsSnapshot: [{ channelId: "general", count: 300 }],
          activeHoursHistogram: { 10: 5, 11: 8 }
        })
      }
    } as unknown as AppPrismaClient;
    const service = new SlashAdminService(
      prisma,
      {} as never,
      {
        getVector: vi.fn().mockResolvedValue({
          toneBias: "sharp",
          roastLevel: 2,
          praiseBias: 1,
          interruptPriority: 0,
          doNotMock: false,
          doNotInitiate: false,
          protectedTopics: ["family"],
          closeness: 0.62,
          trustLevel: 0.71,
          familiarity: 0.83,
          interactionCount: 99,
          proactivityPreference: 0.54
        })
      } as never,
      {} as never,
      {} as never,
      undefined,
      undefined,
      undefined,
      {
        listMoments: vi.fn().mockResolvedValue([
          { id: "m1", content: "Очень длинный сохранённый момент про договорённость и контекст", tags: ["deal"] }
        ])
      } as never
    );

    const result = await service.personDossier("guild-1", "user-1");

    expect(result).toContain("Owner dossier: Sasha");
    expect(result).toContain("Профиль");
    expect(result).toContain("timezone: UTC+3");
    expect(result).toContain("messages=420");
    expect(result).toContain("m1:");
  });
});