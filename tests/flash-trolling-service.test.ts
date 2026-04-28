import { describe, expect, it } from "vitest";
import { FlashTrollingService } from "@hori/core";

function rngSeq(values: number[]): () => number {
  let i = 0;
  return () => {
    const v = values[i % values.length];
    i += 1;
    return v;
  };
}

describe("FlashTrollingService", () => {
  it("uses default 40/20/40 weights and picks retort when roll falls in retort band", () => {
    const svc = new FlashTrollingService({ rng: rngSeq([0.0, 0.0]) });
    const action = svc.pickAction();
    expect(action.kind).toBe("retort");
    expect(typeof action.text).toBe("string");
    expect(action.text!.length).toBeGreaterThan(0);
  });

  it("picks question when roll lands in middle band", () => {
    // total=100; retort band [0..40), question [40..60), meme [60..100)
    // roll = 0.5 * 100 = 50 → question
    const svc = new FlashTrollingService({ rng: rngSeq([0.5, 0.0]) });
    expect(svc.pickAction().kind).toBe("question");
  });

  it("picks meme when roll lands in upper band", () => {
    const svc = new FlashTrollingService({ rng: rngSeq([0.9]) });
    expect(svc.pickAction().kind).toBe("meme");
  });

  it("respects custom weights (100% meme)", () => {
    const svc = new FlashTrollingService({
      config: { weights: { retort: 0, question: 0, meme: 1 } },
      rng: rngSeq([0.0, 0.5, 0.99])
    });
    for (let i = 0; i < 3; i += 1) {
      expect(svc.pickAction().kind).toBe("meme");
    }
  });

  it("falls back to retort when all weights are zero", () => {
    const svc = new FlashTrollingService({
      config: { weights: { retort: 0, question: 0, meme: 0 } },
      rng: rngSeq([0.5])
    });
    expect(svc.pickAction().kind).toBe("retort");
  });

  it("avoids repeating same phrase consecutively", () => {
    const svc = new FlashTrollingService({
      retorts: ["a", "b"],
      config: { weights: { retort: 1, question: 0, meme: 0 } },
      rng: rngSeq([0.0, 0.0, 0.0, 0.0])
    });
    const first = svc.pickAction().text;
    const second = svc.pickAction().text;
    expect(first).not.toBe(second);
  });

  it("isMessageEligible respects minMessageLength", () => {
    const svc = new FlashTrollingService({ config: { minMessageLength: 10 } });
    expect(svc.isMessageEligible("short")).toBe(false);
    expect(svc.isMessageEligible("this is long enough text")).toBe(true);
  });

  it("isChannelAllowed allows all when allowlist empty", () => {
    const svc = new FlashTrollingService();
    expect(svc.isChannelAllowed("any")).toBe(true);
  });

  it("isChannelAllowed enforces allowlist when provided", () => {
    const svc = new FlashTrollingService({ config: { channelAllowlist: ["c1", "c2"] } });
    expect(svc.isChannelAllowed("c1")).toBe(true);
    expect(svc.isChannelAllowed("c3")).toBe(false);
  });

  it("updateConfig merges weights without losing other fields", () => {
    const svc = new FlashTrollingService({ config: { intervalMinutes: 30 } });
    svc.updateConfig({ weights: { retort: 50, question: 10, meme: 40 } });
    const cfg = svc.getConfig();
    expect(cfg.intervalMinutes).toBe(30);
    expect(cfg.weights).toEqual({ retort: 50, question: 10, meme: 40 });
  });
});
