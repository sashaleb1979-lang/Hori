/**
 * V7 core selector and legacy compatibility layer.
 *
 * Current production chat prompt assembly lives in ChatOrchestrator as a
 * message-array contract. This module no longer owns the full chat prompt; it
 * only selects the base core text plus legacy-compatible limits/trace fields
 * still consumed by PersonaService and adjacent callers.
 *
 * All dynamic blocks from the old persona system (tone, style, antiSlop,
 * fewShot, ideological, slang, messageKind overlays, self-interjection,
 * relationship/server overlays and similar layers) are not assembled here.
 */
import type { PersonaBehaviorTrace, PersonaResponseLimits, RelationshipState } from "@hori/shared";

import { coreText, USER_PROMPT_FRAMING, type CoreId } from "./cores";
import type { ComposeBehaviorPromptInput, ComposeBehaviorPromptOutput } from "./types";

const VALID_CORE_IDS: ReadonlyArray<string> = [
  "core_annoyed", "core_base", "core_warm", "core_close", "core_teasing", "core_sweet", "core_serious"
];

function isValidCoreId(v: string): boolean {
  return VALID_CORE_IDS.includes(v);
}

const DEFAULT_LIMITS: PersonaResponseLimits = {
  maxSentences: 6,
  maxParagraphs: 2,
  maxChars: 700,
  maxTokens: 220,
  compactness: "normal",
  bulletListAllowed: false,
  explanationDensity: 0.35,
  followUpAllowed: false
};

function relationshipStateFromCore(core: CoreId): RelationshipState {
  switch (core) {
    case "core_annoyed":
      return "cold_lowest";
    case "core_warm":
      return "warm";
    case "core_close":
      return "close";
    case "core_teasing":
      return "teasing";
    case "core_sweet":
      return "sweet";
    case "core_serious":
      return "serious";
    default:
      return "base";
  }
}

function buildTraceStub(
  input: ComposeBehaviorPromptInput,
  coreId: CoreId,
  limits: PersonaResponseLimits
): PersonaBehaviorTrace {
  return {
    personaName: input.guildSettings?.botName ?? "Хори",
    activeMode: "normal",
    channelKind: input.channelKind ?? "general",
    messageKind: input.messageKind ?? "casual_address",
    smalltalkContextHook: false,
    replyMode: "dry",
    stylePreset: "neutral_short",
    requestedDepth: input.requestedDepth ?? "short",
    compactness: input.requestedDepth ?? "short",
    antiSlopProfile: "standard",
    ideologicalFlavour: "disabled",
    analogyBan: false,
    slangProfile: "off",
    contextEnergy: "medium",
    isSelfInitiated: input.isSelfInitiated ?? false,
    snarkConfidenceThreshold: 0,
    contextConfidence: undefined,
    mockeryConfidence: undefined,
    activeTopicId: null,
    replyChainCount: 0,
    entityTriggers: [],
    contextVersion: "v2",
    staleTakeDetected: false,
    mediaReactionEligible: false,
    maxChars: limits.maxChars,
    maxSentences: limits.maxSentences,
    maxParagraphs: limits.maxParagraphs,
    bulletListAllowed: limits.bulletListAllowed,
    followUpAllowed: limits.followUpAllowed,
    blocksUsed: ["v7_active_core", `core:${coreId}`],
    promptShape: "v5_chat",
    relationshipState: relationshipStateFromCore(coreId)
  };
}

export function composeBehaviorPrompt(input: ComposeBehaviorPromptInput): ComposeBehaviorPromptOutput {
  const coreId: CoreId = (input.manualCoreOverride && isValidCoreId(input.manualCoreOverride))
    ? input.manualCoreOverride as CoreId
    : "core_base";

  const coreString = coreText(coreId);
  const limits = DEFAULT_LIMITS;

  const prompt = coreString;
  const staticPrefix = coreString;

  return {
    prompt,
    staticPrefix,
    trace: buildTraceStub(input, coreId, limits),
    limits,
    assembly: {
      commonCore: coreString,
      sigilOverlayBlock: "",
      relationshipState: relationshipStateFromCore(coreId)
    }
  };
}

export { USER_PROMPT_FRAMING };
