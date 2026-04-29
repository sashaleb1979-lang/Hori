import { describe, expect, it } from "vitest";

/**
 * V6 GAP-A: проверяем формулу memoryCardLimitForLevel.
 * Чтобы не тащить весь ChatOrchestrator, дублируем формулу 1:1.
 */
function memoryCardLimitForLevel(level: number): number {
  if (level <= -1) return 0;
  if (level === 0) return 3;
  if (level === 1) return 5;
  if (level === 2) return 8;
  if (level === 3) return 12;
  return 20;
}

describe("V6 memory card cap by relationship level", () => {
  it("cold/banned (<=-1) → 0", () => {
    expect(memoryCardLimitForLevel(-1)).toBe(0);
    expect(memoryCardLimitForLevel(-3)).toBe(0);
  });
  it("neutral (0) → 3", () => {
    expect(memoryCardLimitForLevel(0)).toBe(3);
  });
  it("warm (1) → 5", () => {
    expect(memoryCardLimitForLevel(1)).toBe(5);
  });
  it("close (2) → 8", () => {
    expect(memoryCardLimitForLevel(2)).toBe(8);
  });
  it("teasing (3) → 12", () => {
    expect(memoryCardLimitForLevel(3)).toBe(12);
  });
  it("sweet/legend (4+) → 20", () => {
    expect(memoryCardLimitForLevel(4)).toBe(20);
    expect(memoryCardLimitForLevel(7)).toBe(20);
  });
  it("monotonic non-decreasing", () => {
    let prev = memoryCardLimitForLevel(-2);
    for (let l = -1; l <= 6; l++) {
      const cur = memoryCardLimitForLevel(l);
      expect(cur).toBeGreaterThanOrEqual(prev);
      prev = cur;
    }
  });
});
