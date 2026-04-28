import { describe, expect, it } from "vitest";

import { InMemoryAiRouterStateStore, AiRouterQuotaManager } from "@hori/llm";

describe("AiRouterQuotaManager", () => {
  it("resets Gemini daily counters on the next Pacific day", async () => {
    const store = new InMemoryAiRouterStateStore();
    const manager = new AiRouterQuotaManager(store, {
      geminiFlashModel: "gemini-2.5-flash",
      geminiProModel: "gemini-2.5-pro",
      deepseekCooldownMs: 300000,
      geminiFlashDailyLimit: 250,
      geminiProDailyLimit: 100,
      cloudflareCooldownMs: 900000,
      githubCooldownMs: 1800000,
      openaiCooldownMs: 300000
    });

    await manager.recordSuccess({
      provider: "gemini",
      model: "gemini-2.5-flash",
      requestId: "req-1",
      routedFrom: [],
      fallbackDepth: 0,
      now: new Date("2026-04-21T08:00:00.000Z")
    });

    const beforeReset = await manager.canUse("gemini", "gemini-2.5-flash", new Date("2026-04-21T12:00:00.000Z"));
    const afterReset = await manager.canUse("gemini", "gemini-2.5-flash", new Date("2026-04-22T08:00:01.000Z"));

    expect(beforeReset.requestsToday).toBe(1);
    expect(afterReset.requestsToday).toBe(0);
    expect(afterReset.allowed).toBe(true);
  });

  it("reserves capacity before the provider call to prevent quota overruns", async () => {
    const store = new InMemoryAiRouterStateStore();
    const manager = new AiRouterQuotaManager(store, {
      geminiFlashModel: "gemini-2.5-flash",
      geminiProModel: "gemini-2.5-pro",
      deepseekCooldownMs: 300000,
      geminiFlashDailyLimit: 1,
      geminiProDailyLimit: 100,
      cloudflareCooldownMs: 900000,
      githubCooldownMs: 1800000,
      openaiCooldownMs: 300000,
      reservationTtlMs: 5000
    });

    const first = await manager.reserve({
      provider: "gemini",
      model: "gemini-2.5-flash",
      requestId: "req-1",
      now: new Date("2026-04-21T08:00:00.000Z")
    });
    const second = await manager.reserve({
      provider: "gemini",
      model: "gemini-2.5-flash",
      requestId: "req-2",
      now: new Date("2026-04-21T08:00:00.000Z")
    });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(false);
    expect(second.reason).toBe("daily_limit_reached");

    await manager.recordFailure({
      provider: "gemini",
      model: "gemini-2.5-flash",
      classification: "provider_unavailable",
      requestId: "req-1",
      routedFrom: [],
      fallbackDepth: 0,
      now: new Date("2026-04-21T08:00:10.000Z")
    });

    const afterRelease = await manager.reserve({
      provider: "gemini",
      model: "gemini-2.5-flash",
      requestId: "req-2",
      now: new Date("2026-04-21T08:00:11.000Z")
    });

    expect(afterRelease.allowed).toBe(true);
  });

  it("drops stale reservations so crashed requests do not block capacity forever", async () => {
    const store = new InMemoryAiRouterStateStore();
    const manager = new AiRouterQuotaManager(store, {
      geminiFlashModel: "gemini-2.5-flash",
      geminiProModel: "gemini-2.5-pro",
      deepseekCooldownMs: 300000,
      geminiFlashDailyLimit: 1,
      geminiProDailyLimit: 100,
      cloudflareCooldownMs: 900000,
      githubCooldownMs: 1800000,
      openaiCooldownMs: 300000,
      reservationTtlMs: 1000
    });

    await manager.reserve({
      provider: "gemini",
      model: "gemini-2.5-flash",
      requestId: "req-stale",
      now: new Date("2026-04-21T08:00:00.000Z")
    });

    const recovered = await manager.reserve({
      provider: "gemini",
      model: "gemini-2.5-flash",
      requestId: "req-fresh",
      now: new Date("2026-04-21T08:00:02.000Z")
    });

    expect(recovered.allowed).toBe(true);
  });
});