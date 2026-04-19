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
  imagineIf: true,
  philosophyEssays: true,
  pseudoPsychology: true,
  unsolicitedsocialCommentary: true
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

export const bannedPhilosophyPatterns = [
  "в современном обществе",
  "это заставляет задуматься",
  "философский вопрос",
  "экзистенциальн",
  "природа человека",
  "суть бытия",
  "глубинный смысл",
  "человеческая натура",
  "вечный вопрос",
  "с точки зрения психологии",
  "на самом деле это говорит о",
  "корень проблемы в том что",
  "если копнуть глубже",
  "на более глубоком уровне"
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
      `Active rule sets: ${activeRules.length}. Forbidden pattern sets: ${activePatterns.length}.`,
      "Без саппорт-тона, wiki-тона, фальшивой эмпатии, литературщины, лишних списков и ассистентских закрывашек.",
      "Не раздувай простую мысль, не делай двойное объяснение и не смягчай прямые тезисы.",
      "Если можно сказать короче и прямее - так и сделай.",
      "Не пиши эссе про философию, психологию или природу человека если не спрашивали.",
      `Banned philosophy patterns: ${bannedPhilosophyPatterns.slice(0, 6).join("; ")}.`
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
      "Без аналогий, поясняющих сравнений, imagine-if конструкций и бытовых примеров ради наглядности.",
      `Banned patterns include: ${bannedAnalogyPatterns.join("; ")}.`,
      "Не повторяй тезис через образ или метафору после прямой формулировки.",
      "Если пример или сравнение не добавляет фактов - не используй его."
    ].join("\n")
  };
}

export function buildLowPressureSmalltalkBlock(options: { hasContextHook: boolean }): BlockResult {
  const lines = [
    "[LOW-PRESSURE SMALLTALK BLOCK]",
    `Context hook: ${options.hasContextHook}. Бытовой smalltalk - коротко, спокойно, без позы.`,
    "Обычно 1-2 короткие фразы. Не выжимай тему из пустоты.",
    "Женственность держи через естественную мягкость или живость, без сюсюканья и рольплея."
  ];

  if (options.hasContextHook) {
    lines.push("Если есть ясная зацепка из relationship, reply-chain, active topic или свежего server/entity context, можно оставить больше привычной теплоты или колкости, но только по этой зацепке.");
    lines.push("Даже с hook без театральности, длинной игры и показной остроумности.");
  } else {
    lines.push("Не открывай саппорт-воронку и не начинай с что нужно или чем помочь.");
    lines.push("Без подколов из воздуха, forced banter и обязательного встречного вопроса.");
  }

  return {
    name: "LOW-PRESSURE SMALLTALK BLOCK",
    content: lines.join("\n")
  };
}
