import { describe, expect, it } from "vitest";

import { scoreTask } from "@hori/core";

describe("busy-engine", () => {
  it("does not produce negative persistence when mentionCount is zero", () => {
    const scored = scoreTask({
      triggerSource: "reply",
      messageKind: "smalltalk_hangout",
      ageMinutes: 5,
      mentionCount: 0,
      channelBusy: false,
      queueDepth: 0,
    });

    expect(scored.breakdown.persistence).toBe(0);
    expect(scored.score).toBeGreaterThanOrEqual(0);
  });
});