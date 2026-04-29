import { describe, it, expect } from "vitest";
import { DEFAULT_QUEUE_PHRASE_POOLS } from "@hori/core";

describe("V6 Item 16: queue phrase pool sizes", () => {
  it("initial.warm has at least 50 phrases", () => {
    expect(DEFAULT_QUEUE_PHRASE_POOLS.initial.warm.length).toBeGreaterThanOrEqual(50);
  });
  it("initial.neutral has at least 20 phrases", () => {
    expect(DEFAULT_QUEUE_PHRASE_POOLS.initial.neutral.length).toBeGreaterThanOrEqual(20);
  });
  it("initial.cold has at least 10 phrases", () => {
    expect(DEFAULT_QUEUE_PHRASE_POOLS.initial.cold.length).toBeGreaterThanOrEqual(10);
  });
  it("followup.warm has at least 30 phrases", () => {
    expect(DEFAULT_QUEUE_PHRASE_POOLS.followup.warm.length).toBeGreaterThanOrEqual(30);
  });
  it("followup.neutral has at least 15 phrases", () => {
    expect(DEFAULT_QUEUE_PHRASE_POOLS.followup.neutral.length).toBeGreaterThanOrEqual(15);
  });
  it("followup.cold has at least 8 phrases", () => {
    expect(DEFAULT_QUEUE_PHRASE_POOLS.followup.cold.length).toBeGreaterThanOrEqual(8);
  });
  it("no duplicate phrases inside any pool", () => {
    for (const tier of [DEFAULT_QUEUE_PHRASE_POOLS.initial, DEFAULT_QUEUE_PHRASE_POOLS.followup]) {
      for (const arr of [tier.warm, tier.neutral, tier.cold]) {
        expect(new Set(arr).size).toBe(arr.length);
      }
    }
  });
});
