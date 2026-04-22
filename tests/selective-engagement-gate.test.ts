import { describe, expect, it } from "vitest";

import { evaluateSelectiveEngagement } from "../packages/core/src/policies/selective-engagement-gate";

const baseInput = {
  content: "ну и что думаете, кто тут прав?",
  enabled: true,
  autoInterjectEnabled: true,
  channelAllowsInterjections: true,
  channelMuted: false,
  hasAttachments: false,
  interjectTendency: 1,
  relationshipDoNotInitiate: false,
  relationshipProactivityPreference: 0.5,
  relationshipInterruptPriority: 0,
  minScore: 0.68
};

describe("selective engagement gate", () => {
  it("allows high-salience group questions", () => {
    const decision = evaluateSelectiveEngagement(baseInput);

    expect(decision.shouldInterject).toBe(true);
    expect(decision.triggers).toContain("group_opinion");
  });

  it("keeps ambient group-opinion prompts below threshold without stronger anchors", () => {
    const decision = evaluateSelectiveEngagement({
      ...baseInput,
      content: "ну и что думаете?"
    });

    expect(decision.shouldInterject).toBe(false);
    expect(decision.reason).toBe("score_below_threshold");
    expect(decision.triggers).toContain("group_opinion");
  });

  it("still allows group-opinion prompts when Hori is explicitly nearby", () => {
    const decision = evaluateSelectiveEngagement({
      ...baseInput,
      content: "хори, что думаешь?"
    });

    expect(decision.shouldInterject).toBe(true);
    expect(decision.triggers).toContain("group_opinion");
    expect(decision.triggers).toContain("name_nearby");
  });

  it("denies low signal or do-not-initiate relationships", () => {
    expect(evaluateSelectiveEngagement({ ...baseInput, content: "лол" }).shouldInterject).toBe(false);
    expect(evaluateSelectiveEngagement({ ...baseInput, relationshipDoNotInitiate: true }).shouldInterject).toBe(false);
  });
});
