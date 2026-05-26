import { describe, expect, it, vi } from "vitest";

import { BotStateService } from "../apps/bot/src/services/bot-state-service";

describe("BotStateService channel tab", () => {
  it("includes current channel session and sleep state", async () => {
    const runtime = {
      runtimeConfig: {
        getChannelPolicy: vi.fn().mockResolvedValue({
          allowBotReplies: true,
          allowInterjections: false,
          isMuted: false,
          topicInterestTags: ["debate"]
        })
      },
      slashAdmin: {
        queueStatus: vi.fn().mockResolvedValue("Queue: queued=1, processing=0, dropped=0.")
      },
      prisma: {
        interjectionLog: {
          count: vi.fn().mockResolvedValue(3)
        }
      },
      sessionBuffer: {
        getGuildSleepUntil: vi.fn().mockResolvedValue(new Date("2026-05-14T12:30:00.000Z")),
        getChannelSessionState: vi.fn().mockResolvedValue({
          sessionSince: new Date("2026-05-14T12:00:00.000Z"),
          lastActivityAt: new Date("2026-05-14T12:10:00.000Z"),
          compactionCount: 1,
          hasCompaction: true,
          participants: ["u1", "u2"],
          sleepUntil: new Date("2026-05-14T12:30:00.000Z")
        })
      }
    } as never;

    const panel = await new BotStateService(runtime).build("channel", "guild-1", "channel-1");
    const sessionField = panel.fields.find((field) => field.name === "Session");

    expect(panel.title).toBe("Состояние: канал");
    expect(sessionField?.value).toContain("participants=2");
    expect(sessionField?.value).toContain("compactions=1");
    expect(sessionField?.value).toContain("guildSleepUntil=05-14T12:30Z");
  });
});