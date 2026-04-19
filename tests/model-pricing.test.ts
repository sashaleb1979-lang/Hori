import { describe, expect, it } from "vitest";

import { calculateCostUsd, getModelPricing, summarizeLlmCosts } from "@hori/llm";

describe("model-pricing", () => {
  it("returns known pricing for gpt-5-nano", () => {
    const pricing = getModelPricing("gpt-5-nano");
    expect(pricing.inputPerMillion).toBe(0.10);
    expect(pricing.outputPerMillion).toBe(0.40);
  });

  it("returns fallback pricing for unknown model", () => {
    const pricing = getModelPricing("some-future-model");
    expect(pricing.inputPerMillion).toBe(1.0);
    expect(pricing.outputPerMillion).toBe(2.0);
  });

  it("calculates cost for a single call", () => {
    // 1000 prompt tokens of gpt-5-nano: 1000 * 0.10 / 1_000_000 = 0.0001
    // 500 completion tokens: 500 * 0.40 / 1_000_000 = 0.0002
    const cost = calculateCostUsd("gpt-5-nano", 1000, 500);
    expect(cost).toBeCloseTo(0.0001 + 0.0002, 8);
  });

  it("summarizes costs across multiple calls", () => {
    const result = summarizeLlmCosts([
      { model: "gpt-5-nano", promptTokens: 1000, completionTokens: 500 },
      { model: "gpt-5.4-mini", promptTokens: 2000, completionTokens: 1000 },
    ]);

    expect(result.breakdown).toHaveLength(2);
    expect(result.totalCostUsd).toBeGreaterThan(0);
    expect(result.totalCostUsd).toBe(result.breakdown.reduce((s, b) => s + b.costUsd, 0));
  });

  it("handles zero tokens gracefully", () => {
    const cost = calculateCostUsd("gpt-5-nano", 0, 0);
    expect(cost).toBe(0);
  });
});
