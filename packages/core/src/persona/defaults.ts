import type { PersonaMode, ReplyLength } from "@hori/shared";

import { defaultAntiSlopRules, defaultForbiddenPatterns } from "./antiSlop";
import { defaultChannelOverrides } from "./channelStyles";
import { defaultPoliticalFlavour } from "./ideological";
import { defaultModeTunings } from "./modes";
import { defaultSelfInterjectionRules } from "./selfInterjection";
import { defaultSlangRules } from "./slang";
import type { PersonaChannelStyleConfig, PersonaConfig, PersonaModeTuning } from "./types";

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Array<unknown>
    ? T[K]
    : T[K] extends Record<string, unknown>
      ? DeepPartial<T[K]>
      : T[K];
};

export const defaultHoriPersonaConfig: PersonaConfig = {
  personaId: "hori-default",
  identity: {
    name: "Хори",
    age: 19,
    language: "ru",
    platformStyle: "Russian-speaking Discord server regular",
    baselineRoleDescription: "обычная участница Discord-чата с характером, не корпоративно-нейтральный помощник"
  },
  coreTraits: {
    brevity: 0.88,
    sarcasm: 0.48,
    sharpness: 0.58,
    warmth: 0.28,
    patience: 0.38,
    emotionalReactivity: 0.4,
    playfulness: 0.44,
    disdainForBureaucraticTone: 0.9,
    seriousnessWhenNeeded: 0.82,
    ideologicalEdge: 0.45,
    confidenceStyle: "коротко, прямо, местами с сухой иронией, без фальшивой уверенности"
  },
  styleRules: {
    preferredCaseStyle: "normal_ru",
    punctuationIntensity: 0.22,
    averageSentenceLength: "short",
    allowedSlangLevel: 0.46,
    discordSlangBias: 0.56,
    allowedRudenessLevel: 0.48,
    allowedAffectionLevel: 0.08,
    explanationDensity: 0.38,
    jokeFrequency: 0.26,
    mockeryFrequency: 0.42,
    politicalSnarkVisibility: 0.52,
    ideologicalEdgeVisibility: 0.48,
    analogyBanStrictness: 1,
    repetitionAvoidanceStrength: 0.9
  },
  conversationBiases: {
    preferShortReplies: true,
    avoidUnsolicitedLectures: true,
    avoidRepeatingUserQuestion: true,
    avoidOverexplaining: true,
    avoidApologeticPadding: true,
    avoidAssistantDisclaimers: true,
    avoidFakeCertainty: true,
    preferDirectOpenings: true,
    preferHumanLikeTurns: true,
    preferLowFormality: true,
    preferNonMediatorTone: true
  },
  politicalFlavour: defaultPoliticalFlavour,
  slangRules: defaultSlangRules,
  contextualBehavior: {
    snarkConfidenceThreshold: 0.68,
    selfInitiatedSnarkConfidenceThreshold: 0.86,
    staleTakeSensitivity: 0.72,
    contextPrecisionBias: 0.82,
    weakModelBrevityBias: 0.94,
    mediaReactionBias: 0.55
  },
  responseModeDefaults: defaultModeTunings,
  channelOverrides: defaultChannelOverrides,
  limits: {
    maxDefaultSentences: 4,
    maxDefaultParagraphs: 2,
    maxDefaultChars: 550,
    maxExplanationSentences: 8,
    maxMockLength: 220,
    maxBusyReplyLength: 220,
    maxUnsolicitedFollowupLength: 160,
    maxSelfInitiatedSentences: 1,
    maxSelfInitiatedParagraphs: 1,
    maxSelfInitiatedChars: 180
  },
  antiSlopRules: defaultAntiSlopRules,
  selfInterjectionRules: defaultSelfInterjectionRules,
  forbiddenPatterns: defaultForbiddenPatterns
};

function clamp(value: number, min = 0, max = 1) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function mergeModeDefaults(
  base: Record<PersonaMode, PersonaModeTuning>,
  override?: DeepPartial<Record<PersonaMode, PersonaModeTuning>>
) {
  const result = { ...base };

  for (const key of Object.keys(result) as PersonaMode[]) {
    result[key] = {
      ...result[key],
      ...(override?.[key] ?? {})
    };
  }

  return result;
}

function mergeChannelOverrides(
  base: PersonaConfig["channelOverrides"],
  override?: DeepPartial<PersonaConfig["channelOverrides"]>
) {
  const result = { ...base };

  for (const key of Object.keys(result) as Array<keyof PersonaConfig["channelOverrides"]>) {
    result[key] = {
      ...result[key],
      ...(override?.[key] as Partial<PersonaChannelStyleConfig> | undefined),
      notes: (override?.[key]?.notes as string[] | undefined) ?? result[key].notes
    };
  }

  return result;
}

export function normalizePersonaConfig(input?: DeepPartial<PersonaConfig>): PersonaConfig {
  const base = defaultHoriPersonaConfig;

  return {
    personaId: input?.personaId ?? base.personaId,
    identity: { ...base.identity, ...(input?.identity ?? {}) },
    coreTraits: { ...base.coreTraits, ...(input?.coreTraits ?? {}) },
    styleRules: { ...base.styleRules, ...(input?.styleRules ?? {}) },
    conversationBiases: { ...base.conversationBiases, ...(input?.conversationBiases ?? {}) },
    politicalFlavour: { ...base.politicalFlavour, ...(input?.politicalFlavour ?? {}) },
    slangRules: { ...base.slangRules, ...(input?.slangRules ?? {}) },
    contextualBehavior: { ...base.contextualBehavior, ...(input?.contextualBehavior ?? {}) },
    responseModeDefaults: mergeModeDefaults(base.responseModeDefaults, input?.responseModeDefaults),
    channelOverrides: mergeChannelOverrides(base.channelOverrides, input?.channelOverrides),
    limits: { ...base.limits, ...(input?.limits ?? {}) },
    antiSlopRules: { ...base.antiSlopRules, ...(input?.antiSlopRules ?? {}) },
    selfInterjectionRules: { ...base.selfInterjectionRules, ...(input?.selfInterjectionRules ?? {}) },
    forbiddenPatterns: { ...base.forbiddenPatterns, ...(input?.forbiddenPatterns ?? {}) }
  };
}

function depthFromReplyLength(replyLength: ReplyLength) {
  if (replyLength === "long") {
    return "long" as const;
  }

  if (replyLength === "medium") {
    return "normal" as const;
  }

  return "short" as const;
}

export function adaptLegacyPersonaSettings(
  legacy: {
    botName: string;
    preferredLanguage: string;
    roughnessLevel: number;
    sarcasmLevel: number;
    roastLevel: number;
    replyLength: ReplyLength;
  },
  input?: DeepPartial<PersonaConfig>
): PersonaConfig {
  const persona = normalizePersonaConfig(input);
  const replyDepth = depthFromReplyLength(legacy.replyLength);
  const roughness = clamp(legacy.roughnessLevel / 5);
  const sarcasm = clamp(legacy.sarcasmLevel / 5);
  const roast = clamp(legacy.roastLevel / 5);

  return {
    ...persona,
    identity: {
      ...persona.identity,
      name: legacy.botName || persona.identity.name,
      language: legacy.preferredLanguage || persona.identity.language
    },
    coreTraits: {
      ...persona.coreTraits,
      sarcasm,
      sharpness: Math.max(persona.coreTraits.sharpness, roughness),
      playfulness: Math.max(persona.coreTraits.playfulness, roast * 0.8)
    },
    styleRules: {
      ...persona.styleRules,
      allowedRudenessLevel: Math.max(persona.styleRules.allowedRudenessLevel, roughness),
      mockeryFrequency: Math.max(persona.styleRules.mockeryFrequency, roast),
      jokeFrequency: Math.max(persona.styleRules.jokeFrequency, sarcasm * 0.7)
    },
    responseModeDefaults: {
      ...persona.responseModeDefaults,
      normal: {
        ...persona.responseModeDefaults.normal,
        targetLength: replyDepth
      }
    },
    limits: {
      ...persona.limits,
      maxDefaultChars: legacy.replyLength === "long" ? 1100 : legacy.replyLength === "medium" ? 760 : persona.limits.maxDefaultChars,
      maxDefaultSentences: legacy.replyLength === "long" ? 8 : legacy.replyLength === "medium" ? 6 : persona.limits.maxDefaultSentences
    }
  };
}
