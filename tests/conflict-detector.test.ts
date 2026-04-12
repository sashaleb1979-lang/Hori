import { describe, expect, it } from "vitest";

import { EmotionLabel, chooseConflictStrategy, detectConflict } from "@hori/core";

describe("conflict-detector", () => {
  it("detects direct hostile back-and-forth", () => {
    const result = detectConflict([
      { userId: "u1", content: "ты дурак" },
      { userId: "u2", content: "сам дурак" },
    ]);

    expect(result.isConflict).toBe(true);
    expect(result.participants).toEqual(["u1", "u2"]);
    expect(result.score).toBeGreaterThan(0.18);
  });

  it("chooses peacemake for protective mood on a heated conflict", () => {
    const strategy = chooseConflictStrategy(EmotionLabel.PROTECTIVE, 0.72);
    expect(strategy).toBe("peacemake");
  });
});