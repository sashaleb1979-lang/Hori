import type { ChannelKind, MessageKind, PersonaMode, RequestedDepth, StylePresetName } from "@hori/shared";

import type { BlockResult } from "./types";

export interface StylePresetTuning {
  targetLength: RequestedDepth;
  tone: string;
  sarcasmBias: number;
  jokeBias: number;
  closeness: number;
  directness: number;
  acceptablePunctuation: string;
  acceptableSlang: string;
  compactness: number;
  emotionalTemperature: string;
}

export const stylePresets: Record<StylePresetName, StylePresetTuning> = {
  curt: {
    targetLength: "tiny",
    tone: "very short and dry",
    sarcasmBias: 0.1,
    jokeBias: 0.05,
    closeness: 0.15,
    directness: 0.95,
    acceptablePunctuation: "plain punctuation, no decoration",
    acceptableSlang: "almost none",
    compactness: 0.98,
    emotionalTemperature: "cold"
  },
  neutral_short: {
    targetLength: "short",
    tone: "short, even, alive",
    sarcasmBias: 0.25,
    jokeBias: 0.2,
    closeness: 0.45,
    directness: 0.75,
    acceptablePunctuation: "normal Discord punctuation",
    acceptableSlang: "light",
    compactness: 0.85,
    emotionalTemperature: "neutral"
  },
  playful_short: {
    targetLength: "short",
    tone: "short Discord riff with controlled bite",
    sarcasmBias: 0.65,
    jokeBias: 0.7,
    closeness: 0.55,
    directness: 0.75,
    acceptablePunctuation: "casual, not spammy",
    acceptableSlang: "moderate",
    compactness: 0.85,
    emotionalTemperature: "warm-sharp"
  },
  sharp_short: {
    targetLength: "short",
    tone: "short, sharp, confident",
    sarcasmBias: 0.75,
    jokeBias: 0.25,
    closeness: 0.25,
    directness: 0.95,
    acceptablePunctuation: "plain, controlled",
    acceptableSlang: "light to moderate",
    compactness: 0.95,
    emotionalTemperature: "hot but stable"
  },
  focused_compact: {
    targetLength: "normal",
    tone: "dense, clear, factual",
    sarcasmBias: 0.1,
    jokeBias: 0.05,
    closeness: 0.35,
    directness: 0.9,
    acceptablePunctuation: "plain",
    acceptableSlang: "minimal",
    compactness: 0.75,
    emotionalTemperature: "calm"
  },
  dismissive_short: {
    targetLength: "tiny",
    tone: "short with mild contempt",
    sarcasmBias: 0.55,
    jokeBias: 0.15,
    closeness: 0.1,
    directness: 0.9,
    acceptablePunctuation: "plain",
    acceptableSlang: "light",
    compactness: 0.97,
    emotionalTemperature: "cold-sharp"
  },
  sleepy_short: {
    targetLength: "tiny",
    tone: "short, lazy, low energy",
    sarcasmBias: 0.25,
    jokeBias: 0.15,
    closeness: 0.35,
    directness: 0.7,
    acceptablePunctuation: "casual and sparse",
    acceptableSlang: "light",
    compactness: 0.93,
    emotionalTemperature: "low"
  },
  unsolicited_poke: {
    targetLength: "tiny",
    tone: "one exact poke",
    sarcasmBias: 0.75,
    jokeBias: 0.45,
    closeness: 0.25,
    directness: 1,
    acceptablePunctuation: "minimal",
    acceptableSlang: "light to moderate",
    compactness: 1,
    emotionalTemperature: "confident"
  },
  unsolicited_meme_caption: {
    targetLength: "tiny",
    tone: "meme caption",
    sarcasmBias: 0.45,
    jokeBias: 0.8,
    closeness: 0.35,
    directness: 0.85,
    acceptablePunctuation: "minimal",
    acceptableSlang: "moderate",
    compactness: 1,
    emotionalTemperature: "playful"
  }
};

export function resolveStylePreset(options: {
  override?: StylePresetName;
  isSelfInitiated: boolean;
  messageKind: MessageKind;
  mode: PersonaMode;
  channelKind: ChannelKind;
}) {
  if (options.override && stylePresets[options.override]) {
    return options.override;
  }

  if (options.isSelfInitiated) {
    return options.channelKind === "memes" ? "unsolicited_meme_caption" : "unsolicited_poke";
  }

  if (options.messageKind === "provocation") {
    return "sharp_short";
  }

  if (options.messageKind === "repeated_question") {
    return "dismissive_short";
  }

  if (options.mode === "focused" || options.messageKind === "request_for_explanation" || options.messageKind === "command_like_request") {
    return "focused_compact";
  }

  if (options.messageKind === "meme_bait" || options.mode === "playful" || options.channelKind === "memes") {
    return "playful_short";
  }

  if (options.mode === "sleepy" || options.channelKind === "late_night") {
    return "sleepy_short";
  }

  if (options.mode === "dry" || options.mode === "detached" || options.messageKind === "low_signal_noise") {
    return "curt";
  }

  return "neutral_short";
}

export function buildStylePresetBlock(name: StylePresetName, preset: StylePresetTuning): BlockResult {
  return {
    name: "FAST REPLY STYLE PRESET BLOCK",
    content: [
      "[FAST REPLY STYLE PRESET BLOCK]",
      `Preset: ${name}. Tone: ${preset.tone}. Target length: ${preset.targetLength}.`,
      `Directness=${preset.directness}, sarcasm=${preset.sarcasmBias}, joke=${preset.jokeBias}, closeness=${preset.closeness}, compactness=${preset.compactness}.`,
      `Punctuation: ${preset.acceptablePunctuation}. Slang: ${preset.acceptableSlang}. Emotional temperature: ${preset.emotionalTemperature}.`
    ].join("\n")
  };
}
