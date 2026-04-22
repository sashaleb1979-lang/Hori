import { describe, expect, it } from "vitest";

import { defaultHoriPersonaConfig } from "../packages/core/src/persona/defaults";
import { buildFewShotBlock, getLiveFewShotExamples } from "../packages/core/src/persona/fewShot";
import { resolveReplyMode } from "../packages/core/src/persona/replyMode";

describe("few-shot tone anchors", () => {
  it("keeps live anchors free of therapeutic or clownish crutches", () => {
    const banned = /иди лесом|плак-плак|психолога|сочувствовать должна|клоуна похожа|я это запомню|если хочешь,? пиши|это страх/i;

    for (const example of getLiveFewShotExamples()) {
      expect(example.assistant).not.toMatch(banned);
    }
  });

  it("adds guidance against copying harshness or overextending chat", () => {
    const block = buildFewShotBlock();

    expect(block.content).toContain("Не копируй их буквально");
    expect(block.content).toContain("Лучше недосказать");
  });

  it("includes concrete continuation anchors for narrowed follow-ups", () => {
    const block = buildFewShotBlock({ includeConcreteReplyAnchors: true });

    expect(block.content).toContain("user: не аниме");
    expect(block.content).toContain("assistant: Тогда ситком, ромком или туповатый детектив.");
    expect(block.content).toContain("assistant: Открой файл и поправь одну строчку. Пока хватит.");
  });

  it("includes short meta-feedback anchors without self-lore", () => {
    const block = buildFewShotBlock({ includeMetaFeedbackAnchors: true });

    expect(block.content).toContain("user: ты девушка вообще-то");
    expect(block.content).toContain("assistant: Да. И?");
    expect(block.content).toContain("assistant: Ладно, это было мимо.");
    expect(block.content).not.toContain("я не бот");
    expect(block.content).not.toContain("живой человек");
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

  it("keeps light live-chat turns out of mocking or sharp drift", () => {
    const observed = new Set<string>();

    for (let index = 0; index < 1000; index += 1) {
      observed.add(
        resolveReplyMode({
          intent: "chat",
          mode: "normal",
          messageKind: "info_question",
          relationship: null,
          isSelfInitiated: false
        })
      );
      observed.add(
        resolveReplyMode({
          intent: "chat",
          mode: "normal",
          messageKind: "direct_mention",
          relationship: null,
          isSelfInitiated: false
        })
      );
      observed.add(
        resolveReplyMode({
          intent: "chat",
          mode: "normal",
          messageKind: "reply_to_bot",
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

    expect(observed.has("mocking")).toBe(false);
    expect(observed.has("sharp")).toBe(false);
    expect(observed.has("weird_but_relevant")).toBe(false);
  });

  it("keeps affection and explanation density restrained by default", () => {
    expect(defaultHoriPersonaConfig.styleRules.allowedAffectionLevel).toBeLessThanOrEqual(0.1);
    expect(defaultHoriPersonaConfig.styleRules.explanationDensity).toBeLessThan(0.4);
    expect(defaultHoriPersonaConfig.contextualBehavior.weakModelBrevityBias).toBeGreaterThanOrEqual(0.94);
  });
});