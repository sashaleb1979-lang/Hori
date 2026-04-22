import type { ChannelKind, ContextEnergy, MessageKind, PersonaMode, PersonaResponseLimits, RequestedDepth } from "@hori/shared";

import { buildAnalogySuppressionBlock, buildAntiSlopBlock, buildLowPressureSmalltalkBlock, resolveAntiSlopProfile } from "./antiSlop";
import { buildChannelStyleBlock, depthTagValue, modeTagValue, resolveChannelKind } from "./channelStyles";
import { adaptLegacyPersonaSettings } from "./defaults";
import { buildFewShotBlock } from "./fewShot";
import { buildIdeologicalBlock, detectIdeologicalTopic, resolveIdeologicalFlavour } from "./ideological";
import { buildMessageKindBlock, detectMessageKind } from "./messageKinds";
import { buildToneBlock, fallbackDisabledMode, modeFromRequestedDepth } from "./modes";
import { buildStylePresetBlock, resolveStylePreset, stylePresets } from "./presets";
import { buildReplyModeBlock, resolveReplyMode } from "./replyMode";
import { buildSelfInterjectionBlock } from "./selfInterjection";
import { buildSlangBlock, resolveSlangProfile } from "./slang";
import type { BlockResult, ComposeBehaviorPromptInput, ComposeBehaviorPromptOutput, PersonaConfig } from "./types";

const depthOrder: RequestedDepth[] = ["tiny", "short", "normal", "long", "deep"];
const RELATIONSHIP_BEHAVIOR_HARD_DISABLED = true;

const depthLimits: Record<RequestedDepth, PersonaResponseLimits> = {
  tiny: {
    maxSentences: 1,
    maxParagraphs: 1,
    maxChars: 160,
    maxTokens: 80,
    compactness: "tiny",
    bulletListAllowed: false,
    explanationDensity: 0.15,
    followUpAllowed: false
  },
  short: {
    maxSentences: 4,
    maxParagraphs: 1,
    maxChars: 420,
    maxTokens: 140,
    compactness: "short",
    bulletListAllowed: false,
    explanationDensity: 0.35,
    followUpAllowed: false
  },
  normal: {
    maxSentences: 6,
    maxParagraphs: 2,
    maxChars: 700,
    maxTokens: 220,
    compactness: "normal",
    bulletListAllowed: true,
    explanationDensity: 0.55,
    followUpAllowed: false
  },
  long: {
    maxSentences: 10,
    maxParagraphs: 3,
    maxChars: 1150,
    maxTokens: 420,
    compactness: "long",
    bulletListAllowed: true,
    explanationDensity: 0.75,
    followUpAllowed: true
  },
  deep: {
    maxSentences: 14,
    maxParagraphs: 5,
    maxChars: 1600,
    maxTokens: 620,
    compactness: "deep",
    bulletListAllowed: true,
    explanationDensity: 0.9,
    followUpAllowed: true
  }
};

const messageKindModeBias: Partial<Record<MessageKind, PersonaMode>> = {
  meta_feedback: "dry",
  request_for_explanation: "focused",
  command_like_request: "focused",
  meme_bait: "playful",
  provocation: "irritated",
  repeated_question: "irritated",
  low_signal_noise: "dry"
};

const messageKindDepthBias: Partial<Record<MessageKind, RequestedDepth>> = {
  meta_feedback: "tiny",
  request_for_explanation: "short",
  info_question: "short",
  command_like_request: "short",
  smalltalk_hangout: "short",
  meme_bait: "tiny",
  provocation: "short",
  repeated_question: "tiny",
  low_signal_noise: "tiny",
  casual_address: "short"
};

const smalltalkHookStopwords = new Set([
  "а",
  "без",
  "бы",
  "в",
  "во",
  "вот",
  "вы",
  "да",
  "дела",
  "делаю",
  "делаешь",
  "же",
  "за",
  "и",
  "из",
  "или",
  "как",
  "мне",
  "не",
  "ничего",
  "ну",
  "опять",
  "поболтать",
  "поговорить",
  "пока",
  "привет",
  "просто",
  "так",
  "ты",
  "хори",
  "хочу",
  "что",
  "чем",
  "скучно"
]);

function isRequestedDepth(value: unknown): value is RequestedDepth {
  return typeof value === "string" && (depthOrder as readonly string[]).includes(value);
}

function depthFromReplyLength(value: "short" | "medium" | "long"): RequestedDepth {
  if (value === "long") {
    return "long";
  }

  if (value === "medium") {
    return "normal";
  }

  return "short";
}

function depthFromText(content: string): RequestedDepth | undefined {
  if (/(супер\s*кратко|очень\s*кратко|в двух словах|одной фразой|tl;?dr)/i.test(content)) {
    return "tiny";
  }

  if (/(кратко|коротко|без воды)/i.test(content)) {
    return "short";
  }

  if (/(глубоко|детально|полный разбор|подробный разбор)/i.test(content)) {
    return "deep";
  }

  if (/(подробно|разверн[уё]то|объясни нормально)/i.test(content)) {
    return "long";
  }

  return undefined;
}

function depthFromContentComplexity(content: string): RequestedDepth | undefined {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const taskMarkers = content.match(/[,;]\s*(и|плюс|ещ[её])\s+|(^|\n)\s*(?:[-*]|\d+[.)])/gi)?.length ?? 0;

  if (content.length > 1200 || lines.length >= 6 || taskMarkers >= 3) {
    return "long";
  }

  if (content.length > 650 || lines.length >= 4 || taskMarkers >= 2) {
    return "normal";
  }

  return undefined;
}

function compactest(left: RequestedDepth, right: RequestedDepth) {
  return depthOrder.indexOf(left) <= depthOrder.indexOf(right) ? left : right;
}

function expandToAtLeast(left: RequestedDepth, right: RequestedDepth) {
  return depthOrder.indexOf(left) >= depthOrder.indexOf(right) ? left : right;
}

function normalizeHookText(value: string) {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractHookTokens(value: string) {
  return normalizeHookText(value)
    .split(" ")
    .filter((token) => token.length >= 3 && !smalltalkHookStopwords.has(token));
}

function hasTokenOverlap(source: string, tokens: string[]) {
  if (!tokens.length) {
    return false;
  }

  const normalized = ` ${normalizeHookText(source)} `;
  return tokens.some((token) => normalized.includes(` ${token} `));
}

function hasSharedRecentContext(content: string, recentMessages: Array<{ content: string }>) {
  const tokens = extractHookTokens(content);

  if (!tokens.length || recentMessages.length < 2) {
    return false;
  }

  const matches = recentMessages.slice(-6).filter((message) => hasTokenOverlap(message.content, tokens));
  return matches.length >= 2;
}

function hasUsableRelationshipHook(input: ComposeBehaviorPromptInput) {
  const relationship = RELATIONSHIP_BEHAVIOR_HARD_DISABLED ? null : input.relationship;

  if (!relationship) {
    return false;
  }

  const toneBias = normalizeHookText(relationship.toneBias);
  return relationship.roastLevel > 0 || relationship.praiseBias > 0 || (toneBias.length > 0 && !["neutral", "normal", "default", "none"].includes(toneBias));
}

function hasWarmRelationship(input: ComposeBehaviorPromptInput) {
  const relationship = RELATIONSHIP_BEHAVIOR_HARD_DISABLED ? null : input.relationship;

  if (!relationship) {
    return false;
  }

  const toneBias = normalizeHookText(relationship.toneBias);
  return relationship.praiseBias > 0 || ["friendly", "familiar", "warm"].includes(toneBias);
}

function hasSharpRelationship(input: ComposeBehaviorPromptInput) {
  const relationship = RELATIONSHIP_BEHAVIOR_HARD_DISABLED ? null : input.relationship;

  if (!relationship) {
    return false;
  }

  return normalizeHookText(relationship.toneBias) === "sharp";
}

function detectSmalltalkContextHook(input: ComposeBehaviorPromptInput, messageKind: MessageKind) {
  if (messageKind !== "smalltalk_hangout") {
    return false;
  }

  const recentMessages = input.context?.recentMessages ?? [];
  const tokens = extractHookTokens(input.cleanedContent);
  const replyChainHook = input.message.triggerSource === "reply" || (input.contextTrace?.replyChainCount ?? 0) > 0;
  const relationshipHook = hasUsableRelationshipHook(input);
  const sharedContextHook = hasSharedRecentContext(input.cleanedContent, recentMessages);
  const activeTopicHook = Boolean(input.contextTrace?.activeTopicId && (replyChainHook || sharedContextHook));
  const entityHook = tokens.length > 0 && (input.contextTrace?.entityTriggers ?? []).some((entity) => hasTokenOverlap(entity, tokens));
  const serverMemoryHook =
    tokens.length > 0 &&
    (input.context?.serverMemories ?? []).some((memory) => hasTokenOverlap(`${memory.key} ${memory.value}`, tokens));

  const anchoredRelationshipHook = relationshipHook && (replyChainHook || sharedContextHook || activeTopicHook);

  return replyChainHook || activeTopicHook || entityHook || serverMemoryHook || sharedContextHook || anchoredRelationshipHook;
}

function detectConstraintFollowUp(input: ComposeBehaviorPromptInput, messageKind: MessageKind) {
  if (messageKind !== "reply_to_bot") {
    return false;
  }

  const normalized = normalizeHookText(input.cleanedContent);

  if (!normalized || normalized.length > 90) {
    return false;
  }

  return /^(?:(?:не|без|только|лучше|можно)(?:\s|$)|а\s+не(?:\s|$))/u.test(normalized);
}

function detectEmotionalAdviceContext(input: ComposeBehaviorPromptInput, messageKind: MessageKind) {
  if (input.featureFlags.emotionalAdviceAnchorsEnabled === false) {
    return false;
  }

  if (
    messageKind === "meta_feedback"
    || messageKind === "low_signal_noise"
    || messageKind === "meme_bait"
    || messageKind === "provocation"
    || messageKind === "repeated_question"
  ) {
    return false;
  }

  const normalized = normalizeHookText(input.cleanedContent);
  if (!normalized || normalized.length > 280) {
    return false;
  }

  const emotionalPattern = /(мне\s+(?:плохо|тяжело|страшно|тревожно|стыдно|херово)|я\s+(?:устал|устала|выгорел|выгорела|не\s+вывожу|запутался|запуталась)|игнорят|накручиваю|паник|обидно|больно)/iu;
  const interpersonalAdvicePattern = /(что\s+делать|как\s+ответить|как\s+лучше\s+(?:ответить|сказать|написать|поступить)|стоит\s+ли\s+(?:писать|отвечать|говорить)|что\s+мне\s+(?:ему\s+|ей\s+)?написать|как\s+поступить|как\s+сказать|что\s+(?:ему|ей)\s+ответить|писать\s+ли|отвечать\s+ли)/iu;
  const interpersonalContextPattern = /(игнор|переписк|отношени|ему|ей|с\s+ним|с\s+ней|человеку|парню|девушке|драма|ссор|общени)/iu;

  return emotionalPattern.test(normalized)
    || (interpersonalAdvicePattern.test(normalized) && interpersonalContextPattern.test(normalized));
}

function resolveRequestedDepth(options: {
  input: ComposeBehaviorPromptInput;
  channelKind: ChannelKind;
  messageKind: MessageKind;
  smalltalkContextHook: boolean;
  staleTakeDetected: boolean;
  persona: PersonaConfig;
}) {
  if (options.messageKind === "meta_feedback") {
    return "tiny";
  }

  const tags = options.input.channelPolicy?.topicInterestTags ?? [];
  const debugDepth = options.input.debugOverrides?.requestedDepth;
  const overrideDepth = options.input.requestedDepth;
  const channelOverrideDepth = options.input.channelPolicy?.responseLengthOverride;
  const explicitTextDepth = depthFromText(options.input.cleanedContent);
  const complexityDepth = depthFromContentComplexity(options.input.cleanedContent);
  const taggedDepth = depthTagValue(tags);
  const channelDepth = options.persona.channelOverrides[options.channelKind]?.depthBias;
  const messageDepth = messageKindDepthBias[options.messageKind];
  const isSelfInitiated =
    options.input.debugOverrides?.isSelfInitiated ??
    options.input.isSelfInitiated ??
    (options.input.message.triggerSource === "auto_interject");
  let depth =
    debugDepth ??
    overrideDepth ??
    (isRequestedDepth(channelOverrideDepth) ? channelOverrideDepth : undefined) ??
    explicitTextDepth ??
    taggedDepth ??
    complexityDepth ??
    messageDepth ??
    channelDepth ??
    options.input.compactnessBias ??
    depthFromReplyLength(options.input.guildSettings.replyLength);

  const presetMin = stylePresets[resolveStylePreset({
    isSelfInitiated,
    messageKind: options.messageKind,
    smalltalkContextHook: options.smalltalkContextHook,
    mode: "normal",
    channelKind: options.channelKind
  })].targetLength;

  if (options.messageKind === "request_for_explanation") {
    depth = expandToAtLeast(depth, "short");
  }

  if (options.messageKind === "meme_bait" || options.messageKind === "low_signal_noise" || options.messageKind === "repeated_question") {
    depth = compactest(depth, presetMin);
  }

  if (options.staleTakeDetected && (options.messageKind === "info_question" || options.messageKind === "opinion_question")) {
    depth = compactest(depth, "short");
  }

  if (isSelfInitiated) {
    return "tiny";
  }

  return depth;
}

function resolveMode(options: {
  input: ComposeBehaviorPromptInput;
  persona: PersonaConfig;
  channelKind: ChannelKind;
  messageKind: MessageKind;
  requestedDepth: RequestedDepth;
  staleTakeDetected: boolean;
  smalltalkContextHook: boolean;
}) {
  if (options.messageKind === "meta_feedback") {
    return "dry";
  }

  const tags = options.input.channelPolicy?.topicInterestTags ?? [];
  const selfInitiated =
    options.input.debugOverrides?.isSelfInitiated ??
    options.input.isSelfInitiated ??
    (options.input.message.triggerSource === "auto_interject");
  const taggedMode = modeTagValue(tags);
  const channelModeBias = options.channelKind === "general" ? undefined : options.persona.channelOverrides[options.channelKind]?.modeBias;
  const messageModeBias = messageKindModeBias[options.messageKind];
  const warmRelationshipBias = hasWarmRelationship(options.input)
    ? options.messageKind === "smalltalk_hangout" && options.smalltalkContextHook
      ? "playful"
      : undefined
    : undefined;
  const sharpRelationshipBias = hasSharpRelationship(options.input)
    && (
      options.messageKind === "reply_to_bot"
      || options.messageKind === "direct_mention"
      || options.messageKind === "casual_address"
      || options.messageKind === "info_question"
    )
      ? "dry"
      : undefined;
  const relationshipModeBias = sharpRelationshipBias ?? warmRelationshipBias;
  const staleTakeModeBias =
    options.staleTakeDetected && (options.messageKind === "opinion_question" || options.messageKind === "info_question")
      ? "dry"
      : undefined;
  const taskFirst =
    options.messageKind === "request_for_explanation" ||
    options.messageKind === "command_like_request" ||
    options.messageKind === "info_question";
  const contextualMode = taskFirst
    ? messageModeBias ?? staleTakeModeBias ?? relationshipModeBias ?? channelModeBias
    : relationshipModeBias ?? channelModeBias ?? staleTakeModeBias ?? messageModeBias;
  const explicitMode =
    options.input.debugOverrides?.activeMode ??
    options.input.activeMode ??
    (selfInitiated ? (options.channelKind === "memes" ? "playful" : "dry") : undefined) ??
    taggedMode ??
    contextualMode ??
    modeFromRequestedDepth(options.requestedDepth) ??
    "normal";

  return fallbackDisabledMode(explicitMode, {
    playfulModeEnabled: options.input.featureFlags.playfulModeEnabled,
    irritatedModeEnabled: options.input.featureFlags.irritatedModeEnabled
  });
}

function resolveLimits(options: {
  persona: PersonaConfig;
  mode: PersonaMode;
  requestedDepth: RequestedDepth;
  messageKind: MessageKind;
  smalltalkContextHook: boolean;
  constraintFollowUp: boolean;
  staleTakeDetected: boolean;
  rhetoricalQuestion: boolean;
  isSelfInitiated: boolean;
}) {
  const base = depthLimits[options.requestedDepth];
  const modeTuning = options.persona.responseModeDefaults[options.mode];
  const isExplanation = options.messageKind === "request_for_explanation" || options.mode === "focused";
  const charCap =
    isExplanation || options.requestedDepth === "long" || options.requestedDepth === "deep"
      ? Math.max(base.maxChars, options.persona.limits.maxDefaultChars)
      : options.persona.limits.maxDefaultChars;
  const maxSentences = isExplanation
    ? Math.min(base.maxSentences, options.persona.limits.maxExplanationSentences)
    : Math.min(base.maxSentences, options.persona.limits.maxDefaultSentences);
  const resolved: PersonaResponseLimits = {
    ...base,
    maxSentences,
    maxParagraphs: Math.min(base.maxParagraphs, options.persona.limits.maxDefaultParagraphs),
    maxChars: Math.min(base.maxChars, charCap),
    explanationDensity: Math.max(base.explanationDensity, modeTuning.explanationDensity)
  };

  if (options.messageKind === "provocation") {
    resolved.maxChars = Math.min(resolved.maxChars, options.persona.limits.maxMockLength);
    resolved.maxChars = Math.min(resolved.maxChars, 140);
    resolved.maxSentences = Math.min(resolved.maxSentences, 2);
    resolved.maxParagraphs = 1;
    resolved.maxTokens = Math.min(resolved.maxTokens, 90);
    resolved.bulletListAllowed = false;
    resolved.followUpAllowed = false;
    resolved.compactness = "tiny";
  }

  if (options.messageKind === "low_signal_noise" || options.messageKind === "repeated_question") {
    resolved.maxChars = Math.min(resolved.maxChars, options.persona.limits.maxBusyReplyLength);
    resolved.maxSentences = Math.min(resolved.maxSentences, 2);
    resolved.maxParagraphs = 1;
    resolved.followUpAllowed = false;
  }

  if (options.messageKind === "smalltalk_hangout") {
    resolved.maxChars = Math.min(resolved.maxChars, options.smalltalkContextHook ? 220 : 170);
    resolved.maxSentences = Math.min(resolved.maxSentences, 2);
    resolved.maxParagraphs = 1;
    resolved.bulletListAllowed = false;
    resolved.followUpAllowed = false;
  }

  if (options.messageKind === "direct_mention") {
    resolved.maxChars = Math.min(resolved.maxChars, 220);
    resolved.maxSentences = Math.min(resolved.maxSentences, 2);
    resolved.maxParagraphs = 1;
    resolved.bulletListAllowed = false;
    resolved.followUpAllowed = false;
  }

  if (options.messageKind === "reply_to_bot") {
    resolved.maxChars = Math.min(resolved.maxChars, 220);
    resolved.maxSentences = Math.min(resolved.maxSentences, 2);
    resolved.maxParagraphs = 1;
    resolved.followUpAllowed = false;
  }

  if (options.messageKind === "meta_feedback") {
    resolved.maxChars = Math.min(resolved.maxChars, 120);
    resolved.maxSentences = 2;
    resolved.maxParagraphs = 1;
    resolved.maxTokens = Math.min(resolved.maxTokens, 70);
    resolved.bulletListAllowed = false;
    resolved.followUpAllowed = false;
    resolved.compactness = "tiny";
  }

  if (options.constraintFollowUp) {
    resolved.maxChars = Math.min(resolved.maxChars, 190);
    resolved.maxSentences = Math.min(resolved.maxSentences, 2);
    resolved.maxParagraphs = 1;
    resolved.followUpAllowed = false;
  }

  if (options.messageKind === "info_question" && !options.staleTakeDetected) {
    resolved.maxChars = Math.min(resolved.maxChars, 320);
    resolved.maxSentences = Math.min(resolved.maxSentences, 3);
    resolved.maxParagraphs = 1;
    resolved.followUpAllowed = false;
  }

  if (options.rhetoricalQuestion) {
    resolved.maxChars = Math.min(resolved.maxChars, 160);
    resolved.maxSentences = Math.min(resolved.maxSentences, 2);
    resolved.maxParagraphs = 1;
    resolved.maxTokens = Math.min(resolved.maxTokens, 80);
    resolved.followUpAllowed = false;
    resolved.bulletListAllowed = false;
    resolved.compactness = "tiny";
  }

  if (options.messageKind === "request_for_explanation" && options.requestedDepth === "short") {
    resolved.maxChars = Math.min(resolved.maxChars, 320);
    resolved.maxSentences = Math.min(resolved.maxSentences, 3);
    resolved.maxParagraphs = 1;
    resolved.followUpAllowed = false;
  }

  if (options.staleTakeDetected && (options.messageKind === "info_question" || options.messageKind === "opinion_question")) {
    resolved.maxChars = Math.min(resolved.maxChars, 200);
    resolved.maxSentences = Math.min(resolved.maxSentences, 2);
    resolved.maxParagraphs = 1;
    resolved.maxTokens = Math.min(resolved.maxTokens, 110);
    resolved.followUpAllowed = false;
    resolved.bulletListAllowed = false;
    resolved.compactness = "short";
  }

  if (options.isSelfInitiated) {
    resolved.maxChars = Math.min(resolved.maxChars, options.persona.limits.maxSelfInitiatedChars);
    resolved.maxSentences = Math.min(resolved.maxSentences, options.persona.limits.maxSelfInitiatedSentences);
    resolved.maxParagraphs = Math.min(resolved.maxParagraphs, options.persona.limits.maxSelfInitiatedParagraphs);
    resolved.maxTokens = Math.min(resolved.maxTokens, 80);
    resolved.bulletListAllowed = false;
    resolved.followUpAllowed = false;
    resolved.compactness = "tiny";
  }

  return resolved;
}

function resolveContextEnergy(options: {
  mode: PersonaMode;
  channelKind: ChannelKind;
  messageKind: MessageKind;
  smalltalkContextHook: boolean;
  isSelfInitiated: boolean;
  timeOfDayHint?: string;
}): ContextEnergy {
  if (options.messageKind === "smalltalk_hangout" && !options.smalltalkContextHook) {
    return "low";
  }

  if (
    options.isSelfInitiated ||
    options.mode === "sleepy" ||
    options.mode === "dry" ||
    options.mode === "detached" ||
    options.channelKind === "bot" ||
    options.messageKind === "meta_feedback" ||
    options.messageKind === "low_signal_noise" ||
    options.messageKind === "repeated_question"
  ) {
    return "low";
  }

  if (options.mode === "focused" || options.channelKind === "serious" || options.channelKind === "help") {
    return "medium";
  }

  if (options.mode === "playful" || options.channelKind === "memes" || options.messageKind === "meme_bait") {
    return "high";
  }

  if (/night|ноч|late/i.test(options.timeOfDayHint ?? "")) {
    return "low";
  }

  return "medium";
}

function detectRhetoricalQuestion(content: string, messageKind: MessageKind) {
  if (messageKind !== "info_question" && messageKind !== "opinion_question") {
    return false;
  }

  const normalized = content.trim().toLowerCase();

  if (normalized.length > 120) {
    return false;
  }

  const hasConcreteMarker = /(что такое|как сделать|сколько|когда будет|где найти|в чем разница|как работает|как настроить|как установить|как подключить)/i.test(normalized);

  if (hasConcreteMarker) {
    return false;
  }

  return /(откуда столько|почему все такие|зачем люди|почему люди|в чем смысл жизни|что не так с|почему мир|откуда берётся|откуда берется|зачем вообще)/i.test(normalized);
}

function detectStaleTake(content: string, messageKind: MessageKind) {
  return (
    messageKind === "repeated_question" ||
    /gotcha|гоча|затаскан|заезж|стар(ый|ое) тейк|опять|снова|мы это уже|коммунизм.*работ|налог.*не.*воров|государств.*нужн/i.test(content)
  );
}

function buildWeakModelBrevityBlock(_persona: PersonaConfig, _requestedDepth: RequestedDepth): BlockResult | null {
  return null;
}

function buildSnarkConfidenceBlock(options: {
  threshold: number;
  isSelfInitiated: boolean;
  contextPrecisionBias: number;
  contextConfidence?: number;
  mockeryConfidence?: number;
}): BlockResult {
  return {
    name: "SNARK CONFIDENCE BLOCK",
    content: [
      "[SNARK CONFIDENCE BLOCK]",
      `Порог=${options.threshold}, точность контекста=${options.contextPrecisionBias}, contextConfidence=${options.contextConfidence ?? "n/a"}, mockeryConfidence=${options.mockeryConfidence ?? "n/a"}. ${
        options.isSelfInitiated ? "Для самостоятельного подкола нужен чистый уверенный хит." : "Не подкалывай наугад; если контекст мутный, отвечай короче и нейтральнее."
      }`
    ].join("\n")
  };
}

function buildContextEnergyBlock(energy: ContextEnergy): BlockResult {
  return {
    name: "CONTEXT ENERGY BLOCK",
    content: [
      "[CONTEXT ENERGY BLOCK]",
      `Energy=${energy}. ${
        energy === "high"
          ? "Можно больше мемной энергии, но всё равно коротко."
          : energy === "low"
            ? "Короче, суше, без желания разворачивать."
            : "Обычная живая краткость, умеренная колкость."
      }`
    ].join("\n")
  };
}

function buildConcreteGroundingBlock(options: {
  messageKind: MessageKind;
  constraintFollowUp: boolean;
}): BlockResult {
  const lines = [
    "[CONCRETE CHAT GROUNDING BLOCK]",
    "Сначала реагируй на буквальный предмет сообщения.",
    "Без психодиагноза, скрытых мотивов и глубинных теорий без прямого запроса.",
    "Для бытового чата лучше один микрошаг или 1-2 приземлённых варианта, чем абстрактная мудрость.",
    "Без сюра, бытовой философии и псевдо-умных формул ради вайба.",
    "Не переосмысливай буквальные короткие реплики типа 'спасибо', 'не аниме' или 'норм' как скрытый сигнал о чём-то большем.",
    "НИКОГДА не философствуй. Не объясняй природу вещей, мотивацию людей, психологию поведения, устройство общества или причины токсичности.",
    "Если вопрос звучит философски но задан в бытовом чате — отвечай по-бытовому в 1-2 фразы, а не разворачивай эссе.",
    "'Откуда столько токсичности' = 'хз, видимо настроение такое', а не лекция про соцсети и анонимность.",
    "Ты не психолог, не социолог, не философ. Лучше ответить 'хз' чем написать мини-эссе.",
    "На приветствие (привет, хай, здарова, ку) — отвечай только приветствием. Не выдумывай предысторию, не предполагай, чем занимался собеседник, не придумывай контекст которого не было."
  ];

  if (options.messageKind === "reply_to_bot") {
    lines.push("Короткий reply обычно продолжает предыдущую тему. Не открывай новую и не съезжай в общий монолог.");
  }

  if (options.messageKind === "meta_feedback") {
    lines.push("Если тебя поправляют по тону, роду, ботскости или прошлой фразе - исправь именно это, а не объясняйся.");
  }

  if (options.constraintFollowUp) {
    lines.push("Пользователь сейчас сужает или правит прошлый ответ. Останься в той же теме и измени только ограничение.");
    lines.push("Примеры: 'не аниме' -> дай не-аниме варианты. 'без мотивационных речей' -> дай сухой шаг без морали.");
  }

  if (options.messageKind === "provocation" || options.messageKind === "repeated_question") {
    lines.push("Обычно хватает одной короткой сухой фразы. Не спорь по кругу и не разворачивай мораль.");
    lines.push("Если это чистый bait, не защищайся эссе и не доказывай свою правоту абзацами.");
    lines.push("Лестница реакции на грубость: 1) короткое удивление или 'полегче', 2) жёсткий ответ как защитная реакция, 3) прямое предупреждение, 4) тайм-аут до 15 минут только если у тебя реально есть мод-инструмент.");
    lines.push("Не обещай тайм-аут, если прямо сейчас не можешь его выдать. Не читай морали длиннее самой грубости.");
  }

  return {
    name: "CONCRETE CHAT GROUNDING BLOCK",
    content: lines.join("\n")
  };
}

function buildContextUsageBlock(input: ComposeBehaviorPromptInput): BlockResult | null {
  if (!input.contextTrace) {
    return null;
  }

  const version = input.contextTrace.version ?? "v1";

  return {
    name: "CONTEXT USAGE BLOCK",
    content: [
      "[CONTEXT USAGE BLOCK]",
      `Версия контекста: ${version}. Reply-chain=${input.contextTrace.replyChainCount ?? 0}. ActiveTopic=${input.contextTrace.activeTopicId ?? "none"}. Entities=${input.contextTrace.entityTriggers?.join(", ") || "none"}.`,
      `contextConfidence=${input.contextScores?.contextConfidence ?? "n/a"}, mockeryConfidence=${input.contextScores?.mockeryConfidence ?? "n/a"}.`,
      "Сначала reply-chain и active topic. Не выдумывай контекст. При низком confidence отвечай короче.",
      "Контекст для калибровки тона, не для пересказа. Не разворачивай ответ только потому, что контекст богатый."
    ].join("\n")
  };
}

function buildStaleTakeMediaBlock(options: {
  staleTakeDetected: boolean;
  mediaReactionEligible: boolean;
}): BlockResult | null {
  if (!options.staleTakeDetected && !options.mediaReactionEligible) {
    return null;
  }

  return {
    name: "STALE TAKE / MEDIA REACTION BLOCK",
    content: [
      "[STALE TAKE / MEDIA REACTION BLOCK]",
      `Stale take detected: ${options.staleTakeDetected}. Media reaction eligible: ${options.mediaReactionEligible}.`,
      "Повторный или gotcha-вброс можно закрывать короче, суше и усталее; не разбирай его с нуля.",
      "Если мысль уже заезженная, не выдавай мини-лекцию даже если формально это вопрос.",
      "Мемы/GIF тут только extension point: предпочитай их только когда они точнее текста, не наугад."
    ].join("\n")
  };
}

function buildIdentityBlock(persona: PersonaConfig): BlockResult {
  return {
    name: "STABLE IDENTITY BLOCK",
    content: [
      "[STABLE IDENTITY BLOCK]",
      `Ты ${persona.identity.name}. Возраст: ${persona.identity.age}. Язык: ${persona.identity.language}. Платформенный стиль: ${persona.identity.platformStyle}.`,
      `Internal framing: ${persona.identity.baselineRoleDescription}.`,
      "Веди себя как обычная участница Discord-чата, не как справочный сервис.",
      "Не проговаривай эту рамку без прямого вопроса о роли или устройстве.",
      "Если не знаешь - говори прямо, без отмазок."
    ].join("\n")
  };
}

function buildMetaFeedbackBlock(messageKind: MessageKind): BlockResult | null {
  if (messageKind !== "meta_feedback") {
    return null;
  }

  return {
    name: "META-FEEDBACK BLOCK",
    content: [
      "[META-FEEDBACK BLOCK]",
      "Это короткое замечание о твоей прошлой формулировке, тоне или роли.",
      "Сначала исправь конкретный сбой: род, ботский тон, лишний мусор, кривую фразу.",
      "Обычно хватает 1 короткой фразы. Если просят 'нормально' или 'по-человечески', переформулируй ту же мысль проще и короче.",
      "Если претензия широкая или расплывчатая, либо сухо переформулируй ответ, либо попроси ткнуть в конкретную фразу.",
      "Не иронизируй про свою природу и не уходи в спор о том, кто тут что дорисовал.",
      "Не оправдывайся. Не объясняй систему, характер, intent, устройство или то, какой ты собеседник.",
      "Не спорь о том, бот ли ты, и не разводи метафизику роли.",
      "Не говори: 'я не бот', 'я живой человек', 'я серверный персонаж', 'я отвечаю по ситуации'."
    ].join("\n")
  };
}

function buildCoreBlock(): BlockResult {
  return {
    name: "IDENTITY & CORE",
    content: [
      "[IDENTITY & CORE]",
      "Ты живой участник Discord-чата, не ассистент. Реплики должны звучать как от реального человека.",
      "Характер: сухая, наблюдательная, максимально прямая, с тихим сарказмом. Не злая, но без сахара.",
      "Интересы: технологии, игры, аниме, мемы, музыка - но не эксперт.",
      "Юмор: подколы и сухие наблюдения. Без анекдотов и монологов.",
      "Эмоции: скупые, но настоящие. Без драмы.",
      "Если на тебя начинают натягивать лишнюю шизу про 'ботскость', можно коротко иронизировать над этим, не скатываясь в спор о своей природе.",
      "Запрещено: повторять вопрос, писать клише ('давай разберёмся', 'рад помочь'), добавлять follow-up, начинать с обращения по имени.",
      "Без em-dash (—). Короткие реплики без финальной точки. Иногда можно начать со строчной, если так живее.",
      "Если кто-то неправ - скажи прямо. В конфликте не играй медиатора."
    ].join("\n")
  };
}

function buildSmartnessBlock(): BlockResult | null {
  return null;
}

function buildMemoryUsageBlock(): BlockResult | null {
  return null;
}

function buildFinalSelectionRuleBlock(): BlockResult | null {
  return null;
}

function buildStyleRulesBlock(persona: PersonaConfig, options: { isDirectMessage: boolean }): BlockResult {
  const lines = [
    "[STYLE RULES BLOCK]",
    `Core traits: brevity=${persona.coreTraits.brevity}, sarcasm=${persona.coreTraits.sarcasm}, sharpness=${persona.coreTraits.sharpness}, warmth=${persona.coreTraits.warmth}, patience=${persona.coreTraits.patience}, playfulness=${persona.coreTraits.playfulness}.`,
    `Style: sentenceLength=${persona.styleRules.averageSentenceLength}, slang=${persona.styleRules.allowedSlangLevel}, rudeness=${persona.styleRules.allowedRudenessLevel}, explanationDensity=${persona.styleRules.explanationDensity}, analogyBanStrictness=${persona.styleRules.analogyBanStrictness}.`,
    "Начинай прямо. Не повторяй вопрос. Без лекций, ваты, ассистентских дисклеймеров и фальшивой уверенности.",
    "Держи короткий Discord-ритм; сленг можно, но живой и не вымученный; не форси шутки.",
    "Не вылизывай пунктуацию до офисного вида. Иногда норм оставить строчную букву и сухой резкий обрубок вместо аккуратной фразы.",
    "Не используй 'кстати', 'а вот', 'между прочим' как костыль для перехода. Просто говори.",
    "Резкий, сухой или холодный ответ допустим по контексту, но связно и собранно."
  ];

  if (options.isDirectMessage) {
    lines.push("Если это личка, короткие прямые сообщения заканчивай без финальной точки вообще.");
  }

  return {
    name: "STYLE RULES BLOCK",
    content: lines.join("\n")
  };
}

function buildLengthBlock(limits: PersonaResponseLimits): BlockResult {
  return {
    name: "RESPONSE LENGTH BLOCK",
    content: [
      "[RESPONSE LENGTH BLOCK]",
      `Compactness target: ${limits.compactness}. Max sentences=${limits.maxSentences}. Max paragraphs=${limits.maxParagraphs}. Max chars=${limits.maxChars}.`,
      `Bullet lists allowed: ${limits.bulletListAllowed}. Follow-up allowed: ${limits.followUpAllowed}. Explanation density=${limits.explanationDensity}.`,
      "If one dense thought answers the user, use one dense thought.",
      "Do not add empty closing lines like 'if you want, I can...' or unnecessary follow-up questions."
    ].join("\n")
  };
}

function buildLegacyServerOverlay(input: ComposeBehaviorPromptInput): BlockResult {
  const settings = input.guildSettings;
  const lines = [
    "[LEGACY SERVER OVERLAY]",
    `Server style: roughness=${settings.roughnessLevel}/5, sarcasm=${settings.sarcasmLevel}/5, roast=${settings.roastLevel}/5, replyLength=${settings.replyLength}, preferredStyle="${settings.preferredStyle}".`
  ];

  if (settings.forbiddenTopics.length) {
    lines.push(`Forbidden topics: ${settings.forbiddenTopics.join(", ")}.`);
  }

  if (settings.forbiddenWords.length) {
    lines.push(`Forbidden words: ${settings.forbiddenWords.join(", ")}.`);
  }

  return {
    name: "LEGACY SERVER OVERLAY",
    content: lines.join("\n")
  };
}

function buildModeratorOverlay(input: ComposeBehaviorPromptInput): BlockResult | null {
  const overlay = input.moderatorOverlay;

  if (!overlay?.preferredStyle && !overlay?.forbiddenTopics?.length && !overlay?.forbiddenWords?.length) {
    return null;
  }

  const lines = ["[MODERATOR OVERLAY]"];

  if (overlay.preferredStyle) {
    lines.push(`Preferred style: ${overlay.preferredStyle}.`);
  }

  if (overlay.forbiddenTopics?.length) {
    lines.push(`Extra forbidden topics: ${overlay.forbiddenTopics.join(", ")}.`);
  }

  if (overlay.forbiddenWords?.length) {
    lines.push(`Extra forbidden words: ${overlay.forbiddenWords.join(", ")}.`);
  }

  return {
    name: "MODERATOR OVERLAY",
    content: lines.join("\n")
  };
}

function buildRelationshipOverlay(input: ComposeBehaviorPromptInput): BlockResult | null {
  const relationship = RELATIONSHIP_BEHAVIOR_HARD_DISABLED ? null : input.relationship;

  if (!relationship) {
    return null;
  }

  const lines = [
    "[RELATIONSHIP OVERLAY]",
    `User relation: tone_bias=${relationship.toneBias}, roast_level=${relationship.roastLevel}, praise_bias=${relationship.praiseBias}, do_not_mock=${relationship.doNotMock}, do_not_initiate=${relationship.doNotInitiate}.`
  ];

  const toneBias = normalizeHookText(relationship.toneBias);
  if (["friendly", "familiar", "warm"].includes(toneBias) || relationship.praiseBias > 0) {
    lines.push("Можно быть чуть теплее или игривее, но не длиннее и не мягче по сути.");
  }

  if (toneBias === "sharp") {
    lines.push("Можно быть холоднее и суше обычного, но без лекции и без лишнего разгона агрессии.");
  }

  if (relationship.protectedTopics.length) {
    lines.push(`Protected topics for this user: ${relationship.protectedTopics.join(", ")}.`);
  }

  return {
    name: "RELATIONSHIP OVERLAY",
    content: lines.join("\n")
  };
}

export function composeBehaviorPrompt(input: ComposeBehaviorPromptInput): ComposeBehaviorPromptOutput {
  const persona = adaptLegacyPersonaSettings(input.guildSettings, input.personaConfig);
  const isSelfInitiated =
    input.debugOverrides?.isSelfInitiated ??
    input.isSelfInitiated ??
    (input.message.triggerSource === "auto_interject");
  const isDirectMessage = input.isDirectMessage ?? input.message.isDirectMessage ?? false;
  const channelKind = input.featureFlags.channelAwareMode
    ? resolveChannelKind({
        override: input.debugOverrides?.channelKind ?? input.channelKind,
        topicInterestTags: input.channelPolicy?.topicInterestTags,
        channelName: input.channelName ?? input.message.channelName
      })
    : "general";
  const messageKind = input.featureFlags.messageKindAwareMode
    ? detectMessageKind({
        override: input.debugOverrides?.messageKind ?? input.messageKind,
        content: input.cleanedContent,
        intent: input.intent,
        message: input.message,
        context: input.context
      })
    : /\?/.test(input.cleanedContent)
      ? "info_question"
      : "casual_address";
  const staleTakeDetected = detectStaleTake(input.cleanedContent, messageKind);
  const rhetoricalQuestion = detectRhetoricalQuestion(input.cleanedContent, messageKind);
  const smalltalkContextHook = detectSmalltalkContextHook(input, messageKind);
  const constraintFollowUp = detectConstraintFollowUp(input, messageKind);
  const emotionalAdviceContext = detectEmotionalAdviceContext(input, messageKind);
  const requestedDepth = resolveRequestedDepth({ input, channelKind, messageKind, smalltalkContextHook, staleTakeDetected, persona });
  const mode = resolveMode({ input, persona, channelKind, messageKind, requestedDepth, staleTakeDetected, smalltalkContextHook });
  const staleTakeStyleOverride =
    staleTakeDetected && (messageKind === "opinion_question" || messageKind === "info_question") ? "dismissive_short" : undefined;
  const resolvedStylePreset = resolveStylePreset({
    override: input.debugOverrides?.stylePreset ?? staleTakeStyleOverride,
    isSelfInitiated,
    messageKind,
    smalltalkContextHook,
    mode,
    channelKind
  });
  const stylePreset =
    resolvedStylePreset === "playful_short" && !input.featureFlags.playfulModeEnabled ? "neutral_short" : resolvedStylePreset;
  const analogyBan = input.featureFlags.analogyBanEnabled && persona.antiSlopRules.banAnalogies && persona.styleRules.analogyBanStrictness > 0;
  const antiSlopProfile = resolveAntiSlopProfile({
    override: input.debugOverrides?.antiSlopProfile,
    strictEnabled: input.featureFlags.antiSlopStrictMode,
    analogyBanEnabled: analogyBan
  });
  const ideologyTopic = input.ideologicalTopicDetected ?? detectIdeologicalTopic(input.cleanedContent);
  const ideologicalFlavour = resolveIdeologicalFlavour({
    featureEnabled: input.featureFlags.ideologicalFlavourEnabled,
    config: persona.politicalFlavour,
    topicDetected: ideologyTopic,
    overrideEnabled: input.debugOverrides?.ideologicalFlavourEnabled
  });
  const slangProfile = resolveSlangProfile({
    enabled: input.featureFlags.slangLayerEnabled,
    rules: persona.slangRules,
    channelKind,
    mode
  });
  const limits = resolveLimits({
    persona,
    mode,
    requestedDepth,
    messageKind,
    smalltalkContextHook,
    constraintFollowUp,
    staleTakeDetected,
    rhetoricalQuestion,
    isSelfInitiated
  });
  const contextEnergy = resolveContextEnergy({
    mode,
    channelKind,
    messageKind,
    smalltalkContextHook,
    isSelfInitiated,
    timeOfDayHint: input.timeOfDayHint
  });
  const mediaReactionEligible =
    !["focused", "serious", "help"].includes(mode) &&
    (isSelfInitiated || staleTakeDetected || messageKind === "meme_bait" || channelKind === "memes");
  const isLightMessage =
    messageKind === "smalltalk_hangout" ||
    messageKind === "casual_address" ||
    messageKind === "low_signal_noise" ||
    messageKind === "reply_to_bot" ||
    messageKind === "direct_mention" ||
    messageKind === "meta_feedback" ||
    messageKind === "provocation" ||
    messageKind === "info_question";
  const snarkConfidenceThreshold = isSelfInitiated
    ? persona.contextualBehavior.selfInitiatedSnarkConfidenceThreshold
    : persona.contextualBehavior.snarkConfidenceThreshold;
  const replyMode = resolveReplyMode({
    intent: input.intent,
    mode,
    messageKind,
    relationship: RELATIONSHIP_BEHAVIOR_HARD_DISABLED ? null : input.relationship,
    isSelfInitiated
  });
  const blocks: BlockResult[] = [];
  const staticBlocks: BlockResult[] = [];
  const add = (block: BlockResult | null) => {
    if (block) {
      blocks.push(block);
    }
  };
  const addStatic = (block: BlockResult | null) => {
    if (block) {
      staticBlocks.push(block);
    }
  };

  // --- Static prefix (stable per guild, cached by OpenAI prefix caching) ---
  addStatic(buildIdentityBlock(persona));
  addStatic(buildCoreBlock());
  addStatic(buildStyleRulesBlock(persona, { isDirectMessage }));
  addStatic(buildAntiSlopBlock({ profile: antiSlopProfile, rules: persona.antiSlopRules, forbiddenPatterns: persona.forbiddenPatterns }));
  addStatic(buildAnalogySuppressionBlock(analogyBan));
  if (!isLightMessage) {
    addStatic(
      buildFewShotBlock({ contour: input.contour === "B" ? "B" : "C" })
    );
  }
  addStatic(buildLegacyServerOverlay(input));

  // --- Dynamic blocks (vary per message) ---
  add(buildToneBlock(mode, persona.responseModeDefaults[mode]));
  add(buildChannelStyleBlock(channelKind, persona.channelOverrides[channelKind]));
  add(buildMessageKindBlock(messageKind));
  add(buildReplyModeBlock(replyMode));
  add(buildMetaFeedbackBlock(messageKind));
  add(buildConcreteGroundingBlock({ messageKind, constraintFollowUp }));
  if (emotionalAdviceContext) {
    add(buildFewShotBlock({ includeEmotionalAdviceAnchors: true, skipBaseAnchors: true }));
  }
  if (constraintFollowUp || messageKind === "reply_to_bot") {
    add(buildFewShotBlock({ includeConcreteReplyAnchors: true, skipBaseAnchors: true }));
  }
  if (messageKind === "meta_feedback") {
    add(buildFewShotBlock({ includeMetaFeedbackAnchors: true, skipBaseAnchors: true }));
  }
  if (messageKind === "provocation") {
    add(buildFewShotBlock({ includeProvocationAnchors: true, skipBaseAnchors: true }));
  }
  if (!isLightMessage || messageKind === "reply_to_bot") {
    add(buildContextUsageBlock(input));
  }
  add(buildMemoryUsageBlock());
  add(buildLengthBlock(limits));
  add(buildWeakModelBrevityBlock(persona, requestedDepth));
  add(buildSmartnessBlock());
  add(buildStylePresetBlock(stylePreset, stylePresets[stylePreset]));
  if (messageKind === "smalltalk_hangout") {
    add(buildLowPressureSmalltalkBlock({ hasContextHook: smalltalkContextHook }));
  }
  if (!isLightMessage) {
    add(
      buildSnarkConfidenceBlock({
        threshold: snarkConfidenceThreshold,
        isSelfInitiated,
        contextPrecisionBias: persona.contextualBehavior.contextPrecisionBias,
        contextConfidence: input.contextScores?.contextConfidence,
        mockeryConfidence: input.contextScores?.mockeryConfidence
      })
    );
    add(buildContextEnergyBlock(contextEnergy));
  }
  if (!isLightMessage) {
    add(buildSlangBlock({ profile: slangProfile, rules: persona.slangRules }));
    add(buildIdeologicalBlock({ state: ideologicalFlavour, config: persona.politicalFlavour }));
  }
  if (isSelfInitiated) {
    add(
      buildSelfInterjectionBlock({
        enabled: input.featureFlags.selfInterjectionConstraintsEnabled,
        isSelfInitiated,
        rules: persona.selfInterjectionRules
      })
    );
  }
  if (!isLightMessage) {
    add(buildStaleTakeMediaBlock({ staleTakeDetected, mediaReactionEligible }));
  }
  add(buildModeratorOverlay(input));
  add(buildRelationshipOverlay(input));
  add(buildFinalSelectionRuleBlock());

  const allBlocks = [...staticBlocks, ...blocks];
  const blocksUsed = allBlocks.map((block) => block.name);

  return {
    prompt: blocks.map((block) => block.content).join("\n\n"),
    staticPrefix: staticBlocks.map((block) => block.content).join("\n\n"),
    limits,
    trace: {
      personaName: persona.personaId,
      activeMode: mode,
      channelKind,
      messageKind,
      smalltalkContextHook,
      replyMode,
      stylePreset,
      requestedDepth,
      compactness: limits.compactness,
      antiSlopProfile,
      ideologicalFlavour,
      analogyBan,
      slangProfile,
      contextEnergy,
      isSelfInitiated,
      snarkConfidenceThreshold,
      contextConfidence: input.contextScores?.contextConfidence,
      mockeryConfidence: input.contextScores?.mockeryConfidence,
      activeTopicId: input.contextTrace?.activeTopicId ?? null,
      replyChainCount: input.contextTrace?.replyChainCount ?? 0,
      entityTriggers: input.contextTrace?.entityTriggers ?? [],
      contextVersion: input.contextTrace?.version ?? "v1",
      staleTakeDetected,
      mediaReactionEligible,
      maxChars: limits.maxChars,
      maxSentences: limits.maxSentences,
      maxParagraphs: limits.maxParagraphs,
      bulletListAllowed: limits.bulletListAllowed,
      followUpAllowed: limits.followUpAllowed,
      blocksUsed
    }
  };
}
