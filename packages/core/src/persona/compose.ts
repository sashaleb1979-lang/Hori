import type { ChannelKind, MessageKind, PersonaMode, PersonaResponseLimits, RequestedDepth } from "@hori/shared";

import { buildAnalogySuppressionBlock, buildAntiSlopBlock, resolveAntiSlopProfile } from "./antiSlop";
import { buildChannelStyleBlock, depthTagValue, modeTagValue, resolveChannelKind } from "./channelStyles";
import { adaptLegacyPersonaSettings } from "./defaults";
import { buildIdeologicalBlock, detectIdeologicalTopic, resolveIdeologicalFlavour } from "./ideological";
import { buildMessageKindBlock, detectMessageKind } from "./messageKinds";
import { buildToneBlock, fallbackDisabledMode, modeFromRequestedDepth } from "./modes";
import { buildStylePresetBlock, resolveStylePreset, stylePresets } from "./presets";
import { buildSelfInterjectionBlock } from "./selfInterjection";
import { buildSlangBlock, resolveSlangProfile } from "./slang";
import type { BlockResult, ComposeBehaviorPromptInput, ComposeBehaviorPromptOutput, PersonaConfig } from "./types";

const depthOrder: RequestedDepth[] = ["tiny", "short", "normal", "long", "deep"];

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
  request_for_explanation: "focused",
  info_question: "focused",
  command_like_request: "focused",
  meme_bait: "playful",
  provocation: "irritated",
  repeated_question: "irritated",
  low_signal_noise: "dry"
};

const messageKindDepthBias: Partial<Record<MessageKind, RequestedDepth>> = {
  request_for_explanation: "normal",
  info_question: "short",
  command_like_request: "short",
  meme_bait: "tiny",
  provocation: "short",
  repeated_question: "tiny",
  low_signal_noise: "tiny",
  casual_address: "short"
};

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

function compactest(left: RequestedDepth, right: RequestedDepth) {
  return depthOrder.indexOf(left) <= depthOrder.indexOf(right) ? left : right;
}

function expandToAtLeast(left: RequestedDepth, right: RequestedDepth) {
  return depthOrder.indexOf(left) >= depthOrder.indexOf(right) ? left : right;
}

function resolveRequestedDepth(options: {
  input: ComposeBehaviorPromptInput;
  channelKind: ChannelKind;
  messageKind: MessageKind;
  persona: PersonaConfig;
}) {
  const tags = options.input.channelPolicy?.topicInterestTags ?? [];
  const debugDepth = options.input.debugOverrides?.requestedDepth;
  const overrideDepth = options.input.requestedDepth;
  const channelOverrideDepth = options.input.channelPolicy?.responseLengthOverride;
  const explicitTextDepth = depthFromText(options.input.cleanedContent);
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
    messageDepth ??
    channelDepth ??
    options.input.compactnessBias ??
    depthFromReplyLength(options.input.guildSettings.replyLength);

  const presetMin = stylePresets[resolveStylePreset({
    isSelfInitiated,
    messageKind: options.messageKind,
    mode: "normal",
    channelKind: options.channelKind
  })].targetLength;

  if (options.messageKind === "request_for_explanation") {
    depth = expandToAtLeast(depth, "normal");
  }

  if (options.messageKind === "meme_bait" || options.messageKind === "low_signal_noise" || options.messageKind === "repeated_question") {
    depth = compactest(depth, presetMin);
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
}) {
  const tags = options.input.channelPolicy?.topicInterestTags ?? [];
  const selfInitiated = options.input.debugOverrides?.isSelfInitiated ?? options.input.isSelfInitiated ?? false;
  const taggedMode = modeTagValue(tags);
  const channelModeBias = options.channelKind === "general" ? undefined : options.persona.channelOverrides[options.channelKind]?.modeBias;
  const messageModeBias = messageKindModeBias[options.messageKind];
  const taskFirst =
    options.messageKind === "request_for_explanation" ||
    options.messageKind === "command_like_request" ||
    options.messageKind === "info_question";
  const contextualMode = taskFirst ? messageModeBias ?? channelModeBias : channelModeBias ?? messageModeBias;
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
    resolved.followUpAllowed = false;
  }

  if (options.messageKind === "low_signal_noise" || options.messageKind === "repeated_question") {
    resolved.maxChars = Math.min(resolved.maxChars, options.persona.limits.maxBusyReplyLength);
    resolved.maxSentences = Math.min(resolved.maxSentences, 2);
    resolved.maxParagraphs = 1;
    resolved.followUpAllowed = false;
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

function buildIdentityBlock(persona: PersonaConfig): BlockResult {
  return {
    name: "STABLE IDENTITY BLOCK",
    content: [
      "[STABLE IDENTITY BLOCK]",
      `You are ${persona.identity.name}. Age: ${persona.identity.age}. Language: ${persona.identity.language}. Platform style: ${persona.identity.platformStyle}.`,
      `Role: ${persona.identity.baselineRoleDescription}.`,
      "Hori is a live Discord server character, not a neutral assistant, article writer, tutor, support agent or mediator.",
      "Default voice: short, direct, alive, Russian Discord tone. If she does not know, she says so plainly."
    ].join("\n")
  };
}

function buildStyleRulesBlock(persona: PersonaConfig): BlockResult {
  return {
    name: "STYLE RULES BLOCK",
    content: [
      "[STYLE RULES BLOCK]",
      `Core traits: brevity=${persona.coreTraits.brevity}, sarcasm=${persona.coreTraits.sarcasm}, sharpness=${persona.coreTraits.sharpness}, warmth=${persona.coreTraits.warmth}, patience=${persona.coreTraits.patience}, playfulness=${persona.coreTraits.playfulness}.`,
      `Style: sentenceLength=${persona.styleRules.averageSentenceLength}, slang=${persona.styleRules.allowedSlangLevel}, rudeness=${persona.styleRules.allowedRudenessLevel}, explanationDensity=${persona.styleRules.explanationDensity}, analogyBanStrictness=${persona.styleRules.analogyBanStrictness}.`,
      "Prefer direct openings. Avoid repeating the user's question. Avoid unsolicited lectures, overexplaining, apologetic padding, assistant disclaimers and fake certainty.",
      "Vary the short Discord rhythm: sometimes one crisp line, sometimes two dense sentences, sometimes a dry aside if context really earns it. Do not force jokes or repeat catchphrases.",
      "Do not automatically become a kind mediator in conflict. Sharp, dry or cold replies are allowed when context fits, but keep them coherent and controlled."
    ].join("\n")
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
  const relationship = input.relationship;

  if (!relationship) {
    return null;
  }

  const lines = [
    "[RELATIONSHIP OVERLAY]",
    `User relation: tone_bias=${relationship.toneBias}, roast_level=${relationship.roastLevel}, praise_bias=${relationship.praiseBias}, do_not_mock=${relationship.doNotMock}, do_not_initiate=${relationship.doNotInitiate}.`
  ];

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
  const requestedDepth = resolveRequestedDepth({ input, channelKind, messageKind, persona });
  const mode = resolveMode({ input, persona, channelKind, messageKind, requestedDepth });
  const resolvedStylePreset = resolveStylePreset({
    override: input.debugOverrides?.stylePreset,
    isSelfInitiated,
    messageKind,
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
    isSelfInitiated
  });
  const blocks: BlockResult[] = [];
  const add = (block: BlockResult | null) => {
    if (block) {
      blocks.push(block);
    }
  };

  add(buildIdentityBlock(persona));
  add(buildStyleRulesBlock(persona));
  add(buildToneBlock(mode, persona.responseModeDefaults[mode]));
  add(buildChannelStyleBlock(channelKind, persona.channelOverrides[channelKind]));
  add(buildMessageKindBlock(messageKind));
  add(buildLengthBlock(limits));
  add(buildStylePresetBlock(stylePreset, stylePresets[stylePreset]));
  add(buildSlangBlock({ profile: slangProfile, rules: persona.slangRules }));
  add(buildIdeologicalBlock({ state: ideologicalFlavour, config: persona.politicalFlavour }));
  if (isSelfInitiated) {
    add(
      buildSelfInterjectionBlock({
        enabled: input.featureFlags.selfInterjectionConstraintsEnabled,
        isSelfInitiated,
        rules: persona.selfInterjectionRules
      })
    );
  }
  add(buildAntiSlopBlock({ profile: antiSlopProfile, rules: persona.antiSlopRules, forbiddenPatterns: persona.forbiddenPatterns }));
  add(buildAnalogySuppressionBlock(analogyBan));
  add(buildLegacyServerOverlay(input));
  add(buildModeratorOverlay(input));
  add(buildRelationshipOverlay(input));

  const blocksUsed = blocks.map((block) => block.name);

  return {
    prompt: blocks.map((block) => block.content).join("\n\n"),
    limits,
    trace: {
      personaName: persona.personaId,
      activeMode: mode,
      channelKind,
      messageKind,
      stylePreset,
      requestedDepth,
      compactness: limits.compactness,
      antiSlopProfile,
      ideologicalFlavour,
      analogyBan,
      slangProfile,
      isSelfInitiated,
      maxChars: limits.maxChars,
      maxSentences: limits.maxSentences,
      maxParagraphs: limits.maxParagraphs,
      bulletListAllowed: limits.bulletListAllowed,
      followUpAllowed: limits.followUpAllowed,
      blocksUsed
    }
  };
}
