import { describe, expect, it } from "vitest";

import { ResponseGuard, normalizeOutput } from "../packages/core/src/safety/response-guard";

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

describe("normalizeOutput", () => {
  it("removes em-dashes", () => {
    expect(normalizeOutput("слово\u2014слово")).not.toContain("\u2014");
  });

  it("replaces en-dashes with hyphens", () => {
    expect(normalizeOutput("5\u20136")).toBe("5-6");
  });

  it("strips assistant clichés", () => {
    const result = normalizeOutput("Ответ. Если хочешь, могу рассказать больше.");
    expect(result).not.toContain("если хочешь");
    expect(result).toContain("Ответ");
  });

  it("strips reasoning lead-ins", () => {
    expect(normalizeOutput("На самом деле это просто база.")).toBe("это просто база.");
  });

  it("removes repeated sentences", () => {
    expect(normalizeOutput("Это база. Это база.")).toBe("Это база.");
  });

  it("collapses double spaces", () => {
    expect(normalizeOutput("слово  слово")).toBe("слово слово");
  });

  it("removes space before punctuation", () => {
    expect(normalizeOutput("слово .")).toBe("слово.");
  });

  it("collapses excessive newlines", () => {
    expect(normalizeOutput("а\n\n\n\nб")).toBe("а\n\nб");
  });
});

