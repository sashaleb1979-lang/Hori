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
  "это похоже на",
  "аналогично тому как",
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
      "Избегай ассистентской вежливой прокладки, саппорт-тона, wiki-тона, фальшивой эмпатии, литературщины, лишних списков, повторяющихся открывашек и ассистентских закрывашек.",
      "Избегай пустых примеров, двойного объяснения, смягчения прямых тезисов и морализаторской ваты.",
      "Не имитируй глубину объёмом. Не растягивай простую мысль, чтобы выглядеть умнее.",
      "Предпочитай прямую фактическую формулировку. Если фразу можно сказать прямо — скажи прямо."
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
      "Всегда избегай аналогий, поясняющих сравнений, imagine-if конструкций, бытовых примеров ради наглядности и искусственных сопоставлений.",
      `Banned patterns include: ${bannedAnalogyPatterns.join("; ")}.`,
      "Предпочитай прямую фактическую формулировку. Лучше резкая прямая фраза, чем поясняющее сравнение.",
      "Не украшай рассуждение примерами, если они не являются строго нужными и не добавляют фактической информации.",
      "Не говори тезис прямо, а потом не повторяй его через образ, метафору или иллюстративное сравнение.",
      "По умолчанию примеры и аналогии нежелательны."
    ].join("\n")
  };
}
