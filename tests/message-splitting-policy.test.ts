import { describe, expect, it } from "vitest";

import { planNaturalMessageSplit } from "../packages/core/src/policies/message-splitting-policy";

const baseInput = {
  text: "Да, это правда звучит странно. Но в контексте вашего спора это скорее обычная путаница, а не какой-то великий заговор.",
  enabled: true,
  intent: "chat" as const,
  explicitInvocation: true,
  triggerSource: "mention" as const,
  messageKind: "smalltalk_hangout" as const,
  nowMs: 100000,
  cooldownMs: 10_000,
  chance: 0.06,
  random: 0.01
};

describe("natural message splitting policy", () => {
  it("splits only when the rare gate passes", () => {
    const plan = planNaturalMessageSplit(baseInput);

    expect(plan?.chunks).toHaveLength(2);
  });

  it("stays quiet on cooldown or auto interjections", () => {
    expect(planNaturalMessageSplit({ ...baseInput, lastSplitAtMs: 95000 })).toBeNull();
    expect(planNaturalMessageSplit({ ...baseInput, triggerSource: "auto_interject" })).toBeNull();
  });

  it("does not fragment structured answers", () => {
    expect(planNaturalMessageSplit({ ...baseInput, text: "```ts\nconst x = 1;\n```" })).toBeNull();
  });
});
