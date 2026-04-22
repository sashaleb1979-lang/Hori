import { describe, expect, it, vi } from "vitest";

import { AffinityService } from "../packages/core/src/services/affinity-service";

describe("AffinityService", () => {
  it("adds a positive signal for explicit bot-directed praise", async () => {
    const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => data);
    const service = new AffinityService({
      affinitySignal: { create }
    } as never);

    const result = await service.recordMessageSignal({
      guildId: "guild-1",
      userId: "user-1",
      messageId: "message-1",
      messageKind: "meta_feedback",
      content: "ты сегодня норм",
      targetedToBot: true
    });

    expect(result).toMatchObject({ value: 0.24, signalType: "meta_feedback" });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("adds a stronger negative signal for explicit bot-directed hostility", async () => {
    const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => data);
    const service = new AffinityService({
      affinitySignal: { create }
    } as never);

    const result = await service.recordMessageSignal({
      guildId: "guild-1",
      userId: "user-1",
      messageId: "message-1",
      messageKind: "meta_feedback",
      content: "ты меня бесишь",
      targetedToBot: true
    });

    expect(result).toMatchObject({ value: -0.3, signalType: "meta_feedback" });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("does not invent relationship signals from non-directed text alone", async () => {
    const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => data);
    const service = new AffinityService({
      affinitySignal: { create }
    } as never);

    const result = await service.recordMessageSignal({
      guildId: "guild-1",
      userId: "user-1",
      messageId: "message-1",
      messageKind: "meta_feedback",
      content: "ты сегодня норм",
      targetedToBot: false
    });

    expect(result).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it("sharpens the recent overlay after a short hostile streak", async () => {
    const service = new AffinityService({
      affinitySignal: {
        findMany: vi.fn(async () => [
          { value: -0.35 },
          { value: -0.3 },
          { value: -0.35 }
        ])
      }
    } as never);

    const overlay = await service.applyRecentOverlay("guild-1", "user-1", {
      toneBias: "neutral",
      roastLevel: 0,
      praiseBias: 0,
      interruptPriority: 0,
      doNotMock: false,
      doNotInitiate: false,
      protectedTopics: []
    });

    expect(overlay?.toneBias).toBe("neutral");
    expect(overlay?.roastLevel).toBe(1);
  });

  it("can lift recent positive streaks into a friendlier overlay", async () => {
    const service = new AffinityService({
      affinitySignal: {
        findMany: vi.fn(async () => [
          { value: 0.24 },
          { value: 0.24 },
          { value: 0.24 },
          { value: 0.24 },
          { value: 0.24 },
          { value: 0.24 }
        ])
      }
    } as never);

    const overlay = await service.applyRecentOverlay("guild-1", "user-1", {
      toneBias: "neutral",
      roastLevel: 0,
      praiseBias: 0,
      interruptPriority: 0,
      doNotMock: false,
      doNotInitiate: false,
      protectedTopics: []
    });

    expect(overlay?.toneBias).toBe("friendly");
    expect(overlay?.praiseBias).toBe(1);
  });
});