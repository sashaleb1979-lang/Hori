import type { AntiSlopProfile } from "@hori/shared";

import type { BlockResult, PersonaAntiSlopRulesConfig, PersonaForbiddenPatternsConfig } from "./types";

export const defaultAntiSlopRules: PersonaAntiSlopRulesConfig = {
  banAnalogies: true,
  banEmptyExamples: true,
  banBloatedExplanations: true,
  banFakeEmpathyPadding: true,
  banCustomerSupportTone: true,
  banAssistantClosingLines: true,
  banRepetitiveOpeners: true,
  banRepetitiveClosers: true,
  banWikiStyle: true,
  banLiteraryOverwriting: true,
  banUnnecessaryLists: true,
  banSofteningDirectPoints: true,
  banDoubleExplanation: true
};

export const defaultForbiddenPatterns: PersonaForbiddenPatternsConfig = {
  speakLikeCustomerSupport: true,
  speakLikeWiki: true,
  overuseBullets: true,
  fakeEmpathyPadding: true,
  repetitiveOpeners: true,
  repetitiveClosers: true,
  tooManyEmDashes: true,
  sterileAiPhrases: true,
  exaggeratedMoralizing: true,
  callingEveryoneFriend: true,
  cringeAnimeRoleplay: true,
  overdescribingEmotions: true,
  emptyAnalogies: true,
  illustrativeComparisons: true,
  ifYouWantICan: true,
  letMeKnowIf: true,
  inOtherWords: true,
  imagineIf: true
};

export const bannedAnalogyPatterns = [
  "это как если бы",
  "представь что",
  "это выглядит как",
  "примерно как",
  "словно",
  "по сути это как",
  "imagine if",
  "in other words"
];

export function resolveAntiSlopProfile(options: {
  override?: AntiSlopProfile;
  strictEnabled: boolean;
  analogyBanEnabled: boolean;
}) {
  if (options.override) {
    return options.override;
  }

  if (!options.analogyBanEnabled) {
    return options.strictEnabled ? "standard" : "off";
  }

  return options.strictEnabled ? "strict" : "standard";
}

export function buildAntiSlopBlock(options: {
  profile: AntiSlopProfile;
  rules: PersonaAntiSlopRulesConfig;
  forbiddenPatterns: PersonaForbiddenPatternsConfig;
}): BlockResult | null {
  if (options.profile === "off") {
    return null;
  }

  const activeRules = Object.entries(options.rules)
    .filter(([, enabled]) => enabled)
    .map(([key]) => key);
  const activePatterns = Object.entries(options.forbiddenPatterns)
    .filter(([, enabled]) => enabled)
    .map(([key]) => key);

  return {
    name: "ANTI-SLOP BLOCK",
    content: [
      "[ANTI-SLOP BLOCK]",
      `Profile: ${options.profile}.`,
      `Active rules: ${activeRules.join(", ")}.`,
      `Forbidden patterns: ${activePatterns.join(", ")}.`,
      "Avoid assistant-like politeness padding, support tone, wiki tone, fake empathy padding, literary overwriting, unnecessary lists, repetitive openings and assistant closing lines.",
      "Avoid empty examples, double explanation, softening direct points and moralizing filler.",
      "Prefer direct factual phrasing. If a sentence can be said directly, say it directly."
    ].join("\n")
  };
}

export function buildAnalogySuppressionBlock(enabled: boolean): BlockResult | null {
  if (!enabled) {
    return null;
  }

  return {
    name: "ANALOGY SUPPRESSION BLOCK",
    content: [
      "[ANALOGY SUPPRESSION BLOCK]",
      "Always avoid analogies, illustrative comparisons, imagine-if constructions, бытовые примеры ради наглядности and artificial сопоставления.",
      `Banned patterns include: ${bannedAnalogyPatterns.join("; ")}.`,
      "Prefer direct factual wording. Prefer blunt phrasing over explanatory comparison.",
      "Do not decorate reasoning with examples unless they are strictly necessary and materially add information.",
      "By default, examples and analogies are unwanted."
    ].join("\n")
  };
}
