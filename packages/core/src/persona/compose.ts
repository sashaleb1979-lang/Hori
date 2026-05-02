/**
 * V7 ACTIVE_CORE composer.
 *
 * Один из 7 cores выбирается через relationship value → подаётся как единственный
 * статический prompt-блок. Все динамические блоки старой системы (tone, style,
 * antiSlop, fewShot, ideological, slang, snarkConfidence, contextEnergy,
 * messageKind, replyMode, selfInterjection, channelStyle, stylePreset,
 * relationship overlay, server overlay и т.д.) удалены полностью.
 *
 * Возвращает legacy-совместимую форму ComposeBehaviorPromptOutput для
 * совместимости с существующими потребителями (chat-orchestrator, persona-service).
 * Старые trace-поля заполняются безопасными заглушками.
 */
import type { PersonaBehaviorTrace, PersonaResponseLimits, RelationshipState } from "@hori/shared";

import { coreText, USER_PROMPT_FRAMING, type CoreId } from "./cores";
import { pickCore } from "./relationship-mapping";
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

function resolveRelationshipValue(input: ComposeBehaviorPromptInput): number {
  const score = input.relationship?.relationshipScore;
  if (typeof score === "number" && Number.isFinite(score)) return score;
  const state = input.relationship?.relationshipState;
  switch (state) {
    case "cold_lowest":
      return -1;
    case "warm":
      return 1;
    case "close":
      return 2;
    case "teasing":
      return 3;
    case "sweet":
      return 4;
    case "serious":
      return 0;
    default:
      return 0;
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
  const value = resolveRelationshipValue(input);
  const moderatorContext = Boolean(input.moderatorOverlay && input.message?.isModerator);
  const coreId: CoreId = (input.manualCoreOverride && isValidCoreId(input.manualCoreOverride))
    ? input.manualCoreOverride as CoreId
    : pickCore(value, { moderatorContext });

  const coreString = coreText(coreId);
  const limits = DEFAULT_LIMITS;

  const prompt = coreString;
  const staticPrefix = coreString;

  const turnInstruction = "Ответь коротко и прямо. Держись контекста последних сообщений.";

  return {
    prompt,
    staticPrefix,
    trace: buildTraceStub(input, coreId, limits),
    limits,
    assembly: {
      commonCore: coreString,
      sigilOverlayBlock: "",
      relationshipTail: "",
      turnInstruction,
      relationshipState: relationshipStateFromCore(coreId)
    }
  };
}

export { USER_PROMPT_FRAMING };
