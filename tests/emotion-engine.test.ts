import { describe, expect, it } from "vitest";

import { createEngineState, generateEmotionalState } from "@hori/core";

describe("emotion-engine", () => {
  it("resets turnsSinceStateChange when the emotion label changes", () => {
    const engine = createEngineState();

    generateEmotionalState(
      {
        relevance: 0.6,
        goalImpact: "engaging_opportunity",
        copingCapability: "high_capability",
        socialAppropriateness: "warm_engagement",
      },
      { valence: 0.8, confidence: 0.9 },
      engine,
    );

    expect(engine.turnsSinceStateChange).toBe(1);

    const next = generateEmotionalState(
      {
        relevance: 0.9,
        goalImpact: "supportive_opportunity",
        copingCapability: "high_capability",
        socialAppropriateness: "crisis_protocol",
        crisisIndicators: true,
      },
      { valence: -0.8, confidence: 0.9 },
      engine,
    );

    expect(next.subjectiveFeeling).toBe("protective");
    expect(engine.turnsSinceStateChange).toBe(0);
  });
});