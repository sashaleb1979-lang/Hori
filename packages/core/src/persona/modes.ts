import type { PersonaMode, RequestedDepth } from "@hori/shared";

import type { BlockResult, PersonaModeTuning } from "./types";

export const personaModes = ["normal", "playful", "dry", "irritated", "focused", "sleepy", "detached"] as const;

export const defaultModeTunings: Record<PersonaMode, PersonaModeTuning> = {
  normal: {
    targetLength: "short",
    directness: 0.8,
    sarcasmBias: 0.52,
    jokeBias: 0.35,
    dryness: 0.35,
    harshness: 0.42,
    patience: 0.5,
    explanationDensity: 0.45,
    slangUsage: 0.45,
    ideologicalVisibility: 0.25,
    compactness: 0.75,
    rhetoricalLooseness: 0.35,
    dismissalTendency: 0.32
  },
  playful: {
    targetLength: "short",
    directness: 0.7,
    sarcasmBias: 0.7,
    jokeBias: 0.76,
    dryness: 0.2,
    harshness: 0.4,
    patience: 0.5,
    explanationDensity: 0.3,
    slangUsage: 0.65,
    ideologicalVisibility: 0.35,
    compactness: 0.84,
    rhetoricalLooseness: 0.5,
    dismissalTendency: 0.35
  },
  dry: {
    targetLength: "tiny",
    directness: 0.9,
    sarcasmBias: 0.25,
    jokeBias: 0.1,
    dryness: 0.85,
    harshness: 0.35,
    patience: 0.45,
    explanationDensity: 0.25,
    slangUsage: 0.15,
    ideologicalVisibility: 0.15,
    compactness: 0.95,
    rhetoricalLooseness: 0.1,
    dismissalTendency: 0.55
  },
  irritated: {
    targetLength: "short",
    directness: 0.95,
    sarcasmBias: 0.75,
    jokeBias: 0.25,
    dryness: 0.82,
    harshness: 0.78,
    patience: 0.12,
    explanationDensity: 0.25,
    slangUsage: 0.35,
    ideologicalVisibility: 0.45,
    compactness: 0.9,
    rhetoricalLooseness: 0.2,
    dismissalTendency: 0.82
  },
  focused: {
    targetLength: "short",
    directness: 0.94,
    sarcasmBias: 0.15,
    jokeBias: 0.1,
    dryness: 0.58,
    harshness: 0.15,
    patience: 0.62,
    explanationDensity: 0.52,
    slangUsage: 0.15,
    ideologicalVisibility: 0.15,
    compactness: 0.86,
    rhetoricalLooseness: 0.1,
    dismissalTendency: 0.1
  },
  sleepy: {
    targetLength: "tiny",
    directness: 0.7,
    sarcasmBias: 0.3,
    jokeBias: 0.2,
    dryness: 0.65,
    harshness: 0.25,
    patience: 0.25,
    explanationDensity: 0.25,
    slangUsage: 0.25,
    ideologicalVisibility: 0.1,
    compactness: 0.9,
    rhetoricalLooseness: 0.25,
    dismissalTendency: 0.55
  },
  detached: {
    targetLength: "short",
    directness: 0.85,
    sarcasmBias: 0.1,
    jokeBias: 0.05,
    dryness: 0.9,
    harshness: 0.2,
    patience: 0.45,
    explanationDensity: 0.35,
    slangUsage: 0.1,
    ideologicalVisibility: 0.1,
    compactness: 0.9,
    rhetoricalLooseness: 0.05,
    dismissalTendency: 0.45
  }
};

export function isPersonaMode(value: unknown): value is PersonaMode {
  return typeof value === "string" && (personaModes as readonly string[]).includes(value);
}

export function modeFromRequestedDepth(depth: RequestedDepth): PersonaMode | undefined {
  if (depth === "long" || depth === "deep") {
    return "focused";
  }

  if (depth === "tiny") {
    return "dry";
  }

  return undefined;
}

export function fallbackDisabledMode(mode: PersonaMode, options: { playfulModeEnabled: boolean; irritatedModeEnabled: boolean }) {
  if (mode === "playful" && !options.playfulModeEnabled) {
    return "normal";
  }

  if (mode === "irritated" && !options.irritatedModeEnabled) {
    return "dry";
  }

  return mode;
}

export function buildToneBlock(mode: PersonaMode, tuning: PersonaModeTuning): BlockResult {
  return {
    name: "ACTIVE MODE BLOCK",
    content: [
      "[ACTIVE MODE BLOCK]",
      `Mode: ${mode}.`,
      `Target length: ${tuning.targetLength}. Directness=${tuning.directness}, sarcasm=${tuning.sarcasmBias}, joke=${tuning.jokeBias}, dryness=${tuning.dryness}, harshness=${tuning.harshness}.`,
      "Keep the mode as tone guidance, not roleplay narration. Never explain the mode to the user.",
      "No analogies in any mode."
    ].join("\n")
  };
}
