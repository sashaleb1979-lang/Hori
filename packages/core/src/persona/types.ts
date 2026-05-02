import type {
  AntiSlopProfile,
  BotIntent,
  ChannelKind,
  ContextBundle,
  ContextScores,
  ContextTrace,
  FeatureFlags,
  IdeologicalFlavourState,
  MessageEnvelope,
  MessageKind,
  PersonaMode,
  PersonaResponseLimits,
  PersonaSettings,
  RelationshipState,
  RelationshipOverlay,
  RequestedDepth,
  StylePresetName
} from "@hori/shared";

export interface PersonaIdentityConfig {
  name: string;
  age: number;
  language: string;
  platformStyle: string;
  baselineRoleDescription: string;
}

export interface PersonaCoreTraitsConfig {
  brevity: number;
  sarcasm: number;
  sharpness: number;
  warmth: number;
  patience: number;
  emotionalReactivity: number;
  playfulness: number;
  disdainForBureaucraticTone: number;
  seriousnessWhenNeeded: number;
  ideologicalEdge: number;
  confidenceStyle: string;
}

export interface PersonaStyleRulesConfig {
  preferredCaseStyle: string;
  punctuationIntensity: number;
  averageSentenceLength: "very_short" | "short" | "medium";
  allowedSlangLevel: number;
  discordSlangBias: number;
  allowedRudenessLevel: number;
  allowedAffectionLevel: number;
  explanationDensity: number;
  jokeFrequency: number;
  mockeryFrequency: number;
  politicalSnarkVisibility: number;
  ideologicalEdgeVisibility: number;
  analogyBanStrictness: number;
  repetitionAvoidanceStrength: number;
}

export interface PersonaConversationBiasesConfig {
  preferShortReplies: boolean;
  avoidUnsolicitedLectures: boolean;
  avoidRepeatingUserQuestion: boolean;
  avoidOverexplaining: boolean;
  avoidApologeticPadding: boolean;
  avoidAssistantDisclaimers: boolean;
  avoidFakeCertainty: boolean;
  preferDirectOpenings: boolean;
  preferHumanLikeTurns: boolean;
  preferLowFormality: boolean;
  preferNonMediatorTone: boolean;
}

export interface PersonaPoliticalFlavourConfig {
  enabled: boolean;
  rightWingBias: number;
  proIsraelBias: number;
  antiCommunistSnark: number;
  anarchoCapitalistBias: number;
  antiStateSnark: number;
  antiStatistVibe: number;
  snarkTopics: string[];
  ideologicalReactionStrength: number;
  doNotForcePoliticsEverywhere: boolean;
  doNotMakeEveryAnswerPolitical: boolean;
}

export interface PersonaSlangRulesConfig {
  enabled: boolean;
  slangLevel: number;
  discordSlangBias: number;
  memeVocabularyBias: number;
  maxSlangDensity: number;
  allowShortForms: boolean;
  allowInformalSpelling: boolean;
  vocabulary: string[];
}

export interface PersonaContextualBehaviorConfig {
  snarkConfidenceThreshold: number;
  selfInitiatedSnarkConfidenceThreshold: number;
  staleTakeSensitivity: number;
  contextPrecisionBias: number;
  weakModelBrevityBias: number;
  mediaReactionBias: number;
}

export interface PersonaModeTuning {
  targetLength: RequestedDepth;
  directness: number;
  sarcasmBias: number;
  jokeBias: number;
  dryness: number;
  harshness: number;
  patience: number;
  explanationDensity: number;
  slangUsage: number;
  ideologicalVisibility: number;
  compactness: number;
  rhetoricalLooseness: number;
  dismissalTendency: number;
}

export interface PersonaChannelStyleConfig {
  modeBias?: PersonaMode;
  depthBias?: RequestedDepth;
  slangDelta: number;
  memeDelta: number;
  clarityDelta: number;
  sharpnessDelta: number;
  notes: string[];
}

export interface PersonaLimitConfig {
  maxDefaultSentences: number;
  maxDefaultParagraphs: number;
  maxDefaultChars: number;
  maxExplanationSentences: number;
  maxMockLength: number;
  maxBusyReplyLength: number;
  maxUnsolicitedFollowupLength: number;
  maxSelfInitiatedSentences: number;
  maxSelfInitiatedParagraphs: number;
  maxSelfInitiatedChars: number;
}

export interface PersonaAntiSlopRulesConfig {
  banAnalogies: boolean;
  banEmptyExamples: boolean;
  banBloatedExplanations: boolean;
  banFakeEmpathyPadding: boolean;
  banCustomerSupportTone: boolean;
  banAssistantClosingLines: boolean;
  banRepetitiveOpeners: boolean;
  banRepetitiveClosers: boolean;
  banWikiStyle: boolean;
  banLiteraryOverwriting: boolean;
  banUnnecessaryLists: boolean;
  banSofteningDirectPoints: boolean;
  banDoubleExplanation: boolean;
}

export interface PersonaSelfInterjectionRulesConfig {
  enabled: boolean;
  preferMemesOverTextWhenUnsolicited: boolean;
  preferShortPokesOverLongComments: boolean;
  requireContextConfidenceForMockery: boolean;
  suppressIfLowConfidence: boolean;
  suppressIfPointless: boolean;
  suppressIfContextWeak: boolean;
  neverStartUnsolicitedLongExplanation: boolean;
  neverUseAnalogyInUnsolicitedInterjection: boolean;
}

export interface PersonaForbiddenPatternsConfig {
  speakLikeCustomerSupport: boolean;
  speakLikeWiki: boolean;
  overuseBullets: boolean;
  fakeEmpathyPadding: boolean;
  repetitiveOpeners: boolean;
  repetitiveClosers: boolean;
  tooManyEmDashes: boolean;
  sterileAiPhrases: boolean;
  exaggeratedMoralizing: boolean;
  callingEveryoneFriend: boolean;
  cringeAnimeRoleplay: boolean;
  overdescribingEmotions: boolean;
  emptyAnalogies: boolean;
  illustrativeComparisons: boolean;
  ifYouWantICan: boolean;
  letMeKnowIf: boolean;
  inOtherWords: boolean;
  imagineIf: boolean;
  philosophyEssays: boolean;
  pseudoPsychology: boolean;
  unsolicitedsocialCommentary: boolean;
}

export interface PersonaConfig {
  personaId: string;
  identity: PersonaIdentityConfig;
  coreTraits: PersonaCoreTraitsConfig;
  styleRules: PersonaStyleRulesConfig;
  conversationBiases: PersonaConversationBiasesConfig;
  politicalFlavour: PersonaPoliticalFlavourConfig;
  slangRules: PersonaSlangRulesConfig;
  contextualBehavior: PersonaContextualBehaviorConfig;
  responseModeDefaults: Record<PersonaMode, PersonaModeTuning>;
  channelOverrides: Record<ChannelKind, PersonaChannelStyleConfig>;
  limits: PersonaLimitConfig;
  antiSlopRules: PersonaAntiSlopRulesConfig;
  selfInterjectionRules: PersonaSelfInterjectionRulesConfig;
  forbiddenPatterns: PersonaForbiddenPatternsConfig;
}

export interface PersonaDebugOverrides {
  activeMode?: PersonaMode;
  channelKind?: ChannelKind;
  messageKind?: MessageKind;
  requestedDepth?: RequestedDepth;
  stylePreset?: StylePresetName;
  ideologicalFlavourEnabled?: boolean;
  antiSlopProfile?: AntiSlopProfile;
  isSelfInitiated?: boolean;
}

export interface ComposeBehaviorPromptInput {
  personaConfig?: Partial<PersonaConfig>;
  guildSettings: PersonaSettings;
  featureFlags: FeatureFlags;
  message: MessageEnvelope;
  intent: BotIntent;
  cleanedContent: string;
  channelPolicy?: {
    topicInterestTags: string[];
    responseLengthOverride?: string | null;
  } | null;
  moderatorOverlay?: {
    preferredStyle?: string | null;
    forbiddenTopics?: string[];
    forbiddenWords?: string[];
  } | null;
  relationship?: RelationshipOverlay | null;
  context?: ContextBundle | null;
  /**
   * V5.1 Phase B: активный prompt-слот для канала (если есть).
   * Вставляется в system prompt сразу после core+micro-blocks.
   */
  activePromptSlot?: { title?: string | null; content: string } | null;
  /**
   * Sigil-символ (`?`/`!`/`*`), если сообщение начиналось с него.
   */
  sigil?: string | null;
  requestedDepth?: RequestedDepth;
  activeMode?: PersonaMode;
  channelKind?: ChannelKind;
  messageKind?: MessageKind;
  isMention?: boolean;
  isReplyToBot?: boolean;
  isSelfInitiated?: boolean;
  channelName?: string | null;
  /** V5.1 Phase J: описание сервера, добавляется в шапку system prompt. */
  guildDescription?: string | null;
  userLanguage?: string;
  timeOfDayHint?: string;
  compactnessBias?: RequestedDepth;
  ideologicalTopicDetected?: boolean;
  contextScores?: ContextScores;
  contextTrace?: ContextTrace;
  debugOverrides?: PersonaDebugOverrides;
  isDirectMessage?: boolean;
  contour?: "A" | "B" | "C";
  /** Volna 5: ручная подмена кора (mood override от модератора). CoreId из HoriCoreOverride. */
  manualCoreOverride?: string | null;
}

export interface ComposeBehaviorPromptOutput {
  prompt: string;
  staticPrefix: string;
  trace: import("@hori/shared").PersonaBehaviorTrace;
  limits: PersonaResponseLimits;
  assembly: {
    commonCore: string;
    /** V6 Item 12: sigil-overlay (?/!/*), вставляется между common core и relationship tail. */
    sigilOverlayBlock: string;
    relationshipTail: string;
    turnInstruction: string;
    relationshipState: RelationshipState;
  };
}

export interface BlockResult {
  name: string;
  content: string;
}

export interface ResolvedBehaviorContext {
  persona: PersonaConfig;
  mode: PersonaMode;
  channelKind: ChannelKind;
  messageKind: MessageKind;
  requestedDepth: RequestedDepth;
  stylePreset: StylePresetName;
  antiSlopProfile: AntiSlopProfile;
  ideologicalFlavour: IdeologicalFlavourState;
  ideologyTopic: boolean;
  analogyBan: boolean;
  isSelfInitiated: boolean;
  limits: PersonaResponseLimits;
  input: ComposeBehaviorPromptInput;
}
