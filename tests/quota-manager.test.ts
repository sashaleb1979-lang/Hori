import { describe, expect, it } from "vitest";

import { InMemoryAiRouterStateStore, AiRouterQuotaManager } from "@hori/llm";

describe("AiRouterQuotaManager", () => {
  it("resets Gemini daily counters on the next Pacific day", async () => {
    const store = new InMemoryAiRouterStateStore();
    const manager = new AiRouterQuotaManager(store, {
      geminiFlashModel: "gemini-2.5-flash",
      geminiProModel: "gemini-2.5-pro",
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
});