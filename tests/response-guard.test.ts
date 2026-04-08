import { describe, expect, it } from "vitest";

import { ResponseGuard } from "@hori/core";

describe("ResponseGuard", () => {
  it("redacts forbidden words", () => {
    const guard = new ResponseGuard();
    const result = guard.enforce("это плохое слово", {
      maxChars: 100,
      forbiddenWords: ["плохое"]
    });

    expect(result).toContain("[скрыто]");
  });

  it("trims too long messages", () => {
    const guard = new ResponseGuard();
    const result = guard.enforce("x".repeat(120), {
      maxChars: 50,
      forbiddenWords: []
    });

    expect(result.length).toBeLessThanOrEqual(50);
    expect(result.endsWith("...")).toBe(true);
  });
});

