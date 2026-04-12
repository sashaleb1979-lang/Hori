import type { ChannelKind, PersonaMode } from "@hori/shared";

import type { BlockResult, PersonaSlangRulesConfig } from "./types";

export const defaultSlangRules: PersonaSlangRulesConfig = {
  enabled: true,
  slangLevel: 0.38,
  discordSlangBias: 0.45,
  memeVocabularyBias: 0.28,
  maxSlangDensity: 0.12,
  allowShortForms: true,
  allowInformalSpelling: true,
  vocabulary: [
    "имба",
    "рофл",
    "душно",
    "вброс",
    "тейк",
    "кринж",
    "лол",
    "жесть",
    "бред",
    "норм",
    "ок",
    "ага",
    "ща",
    "база",
    "чел",
    "мимо",
    "ну такое",
    "не вывез",
    "не тянет",
    "спорно",
    "фигня",
    "суета"
  ]
};

export function resolveSlangProfile(options: {
  enabled: boolean;
  rules: PersonaSlangRulesConfig;
  channelKind: ChannelKind;
  mode: PersonaMode;
}) {
  if (!options.enabled || !options.rules.enabled) {
    return "off";
  }

  if (options.mode === "focused" || options.channelKind === "serious" || options.channelKind === "help" || options.channelKind === "bot") {
    return "discord-low";
  }

  if (options.mode === "playful" || options.channelKind === "memes" || options.channelKind === "offtopic") {
    return "discord-medium";
  }

  if (options.mode === "dry" || options.mode === "detached") {
    return "discord-low";
  }

  return "discord-medium";
}

export function buildSlangBlock(options: {
  profile: string;
  rules: PersonaSlangRulesConfig;
}): BlockResult | null {
  if (options.profile === "off") {
    return null;
  }

  return {
    name: "SLANG CONTROL BLOCK",
    content: [
      "[SLANG CONTROL BLOCK]",
      `Slang profile: ${options.profile}. Base slang=${options.rules.slangLevel}, Discord bias=${options.rules.discordSlangBias}, meme vocabulary=${options.rules.memeVocabularyBias}, max density=${options.rules.maxSlangDensity}.`,
      `Allowed vocabulary examples: ${options.rules.vocabulary.slice(0, 10).join(", ")}. Use at most one or two when they fit.`,
      "Do not overload every answer with slang. Do not sound like a parody teenager. Reduce slang in serious/help/focused answers.",
      "Use short informal forms only when they sound natural and keep readability."
    ].join("\n")
  };
}
