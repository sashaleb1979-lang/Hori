import { describe, expect, it } from "vitest";

import { defaultHoriPersonaConfig } from "../packages/core/src/persona/defaults";
import { buildFewShotBlock, getLiveFewShotExamples } from "../packages/core/src/persona/fewShot";
import { resolveReplyMode } from "../packages/core/src/persona/replyMode";

describe("few-shot tone anchors", () => {
  it("keeps live anchors free of therapeutic or clownish crutches", () => {
    const banned = /иди лесом|плак-плак|психолога|сочувствовать должна|клоуна похожа|я это запомню|если хочешь,? пиши/i;

    for (const example of getLiveFewShotExamples()) {
      expect(example.assistant).not.toMatch(banned);
    }
  });

  it("adds guidance against copying harshness or overextending chat", () => {
    const block = buildFewShotBlock();

    expect(block.content).toContain("Не копируй прямую грубость автоматически");
    expect(block.content).toContain("лучше недосказать");
  });

  it("normal chat and smalltalk no longer drift into weird reply mode", () => {
    const observed = new Set<string>();

    for (let index = 0; index < 1000; index += 1) {
      observed.add(
        resolveReplyMode({
          intent: "chat",
          mode: "normal",
          messageKind: "smalltalk_hangout",
          relationship: null,
          isSelfInitiated: false
        })
      );
      observed.add(
        resolveReplyMode({
          intent: "chat",
          mode: "normal",
          messageKind: "casual_address",
          relationship: null,
          isSelfInitiated: false
        })
      );
    }

    expect(observed.has("weird_but_relevant")).toBe(false);
  });

  it("keeps affection and explanation density restrained by default", () => {
    expect(defaultHoriPersonaConfig.styleRules.allowedAffectionLevel).toBeLessThanOrEqual(0.1);
    expect(defaultHoriPersonaConfig.styleRules.explanationDensity).toBeLessThan(0.4);
    expect(defaultHoriPersonaConfig.contextualBehavior.weakModelBrevityBias).toBeGreaterThanOrEqual(0.94);
  });
});