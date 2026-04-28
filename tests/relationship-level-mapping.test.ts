import { describe, expect, it } from "vitest";

import {
  RELATIONSHIP_LEVEL_DEFAULT,
  RELATIONSHIP_LEVEL_MAX,
  RELATIONSHIP_LEVEL_MIN,
  clampRelationshipLevel,
  corePromptKeyForLevel,
  levelForRelationshipState,
  relationshipStateForLevel
} from "../packages/core/src/persona/prompt-spec";

describe("V6 relationship level mapping", () => {
  it("default level is 0 (base)", () => {
    expect(RELATIONSHIP_LEVEL_DEFAULT).toBe(0);
    expect(relationshipStateForLevel(0)).toBe("base");
  });

  it("range is −1..4", () => {
    expect(RELATIONSHIP_LEVEL_MIN).toBe(-1);
    expect(RELATIONSHIP_LEVEL_MAX).toBe(4);
  });

  it.each([
    [-1, "cold_lowest"],
    [0, "base"],
    [1, "warm"],
    [2, "close"],
    [3, "teasing"],
    [4, "sweet"]
  ])("level %i maps to state %s", (level, state) => {
    expect(relationshipStateForLevel(level)).toBe(state);
    expect(levelForRelationshipState(state as never)).toBe(level);
  });

  it.each([
    [-1, "cold_tail"],
    [0, "relationship_base"],
    [1, "relationship_warm"],
    [2, "relationship_close"],
    [3, "relationship_teasing"],
    [4, "relationship_sweet"]
  ])("level %i maps to core prompt key %s", (level, key) => {
    expect(corePromptKeyForLevel(level)).toBe(key);
  });

  it("clamps out-of-range and rounds floor", () => {
    expect(clampRelationshipLevel(-5)).toBe(-1);
    expect(clampRelationshipLevel(10)).toBe(4);
    expect(clampRelationshipLevel(2.9)).toBe(2);
    // Below 0 rounds down (floor) — −0.1 → −1.
    expect(clampRelationshipLevel(-0.1)).toBe(-1);
    expect(clampRelationshipLevel(Number.NaN)).toBe(0);
  });

  it("`serious` state has no integer level (returns null)", () => {
    expect(levelForRelationshipState("serious")).toBeNull();
  });
});
