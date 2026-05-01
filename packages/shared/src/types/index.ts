export type BotIntent =
  | "chat"
  | "help"
  | "summary"
  | "analytics"
  | "search"
  | "profile"
  | "memory_write"
  | "memory_recall"
  | "memory_forget"
  | "rewrite"
  | "moderation_style_request"
  | "ignore";

export type ModelKind = "fast" | "smart";

export type ReplyLength = "short" | "medium" | "long";

export type TriggerSource = "name" | "mention" | "reply" | "slash" | "context_action" | "auto_interject";

export type MemoryLayer =
  | "recent_messages"
  | "channel_summaries"
  | "server_memory"
  | "user_memory"
  | "channel_memory"
  | "event_memory"
  | "active_memory"
  | "similar_messages"
  | "user_profile"
  | "relationship"
  | "reply_chain"
  | "active_topic"
  | "topic_window"
  | "entity_memory"
  | "session_buffer";

export type PersonaMode = "normal" | "playful" | "dry" | "irritated" | "focused" | "sleepy" | "detached";

export type ChannelKind = "general" | "memes" | "serious" | "help" | "bot" | "offtopic" | "late_night";

export type MessageKind =
  | "direct_mention"
  | "reply_to_bot"
  | "meta_feedback"
  | "casual_address"
  | "smalltalk_hangout"
  | "info_question"
  | "opinion_question"
  | "request_for_explanation"
  | "meme_bait"
  | "provocation"
  | "repeated_question"
  | "low_signal_noise"
  | "command_like_request";

export type RequestedDepth = "tiny" | "short" | "normal" | "long" | "deep";

export type StylePresetName =
  | "curt"
  | "low_pressure_short"
  | "neutral_short"
  | "playful_short"
  | "sharp_short"
  | "focused_compact"
  | "dismissive_short"
  | "sleepy_short"
  | "unsolicited_poke"
  | "unsolicited_meme_caption";

export type AntiSlopProfile = "off" | "standard" | "strict";

export type IdeologicalFlavourState = "disabled" | "background" | "enabled";

export type ContextEnergy = "low" | "medium" | "high";

export type RelationshipState = "base" | "warm" | "close" | "teasing" | "sweet" | "cold_lowest" | "serious";

export type MemoryMode = "OFF" | "TRUSTED_ONLY" | "ACTIVE_OPT_IN" | "ADMIN_SELECTED";

export type RelationshipGrowthMode = "OFF" | "MANUAL_REVIEW" | "TRUSTED_AUTO" | "FULL_AUTO";

export type StylePresetMode = "manual_only";

export type ReplyMode =
  | "dry"
  | "mocking"
  | "lazy"
  | "sharp"
  | "semi_meme"
  | "weird_but_relevant"
  | "surprisingly_helpful"
  | "brief_warm";

export interface PersonaResponseLimits {
  maxSentences: number;
  maxParagraphs: number;
  maxChars: number;
  maxTokens: number;
  compactness: RequestedDepth;
  bulletListAllowed: boolean;
  explanationDensity: number;
  followUpAllowed: boolean;
}

export interface PersonaBehaviorTrace {
  personaName: string;
  activeMode: PersonaMode;
  channelKind: ChannelKind;
  messageKind: MessageKind;
  smalltalkContextHook?: boolean;
  replyMode: ReplyMode;
  stylePreset: StylePresetName;
  requestedDepth: RequestedDepth;
  compactness: RequestedDepth;
  antiSlopProfile: AntiSlopProfile;
  ideologicalFlavour: IdeologicalFlavourState;
  analogyBan: boolean;
  slangProfile: string;
  contextEnergy: ContextEnergy;
  isSelfInitiated: boolean;
  snarkConfidenceThreshold: number;
  contextConfidence?: number;
  mockeryConfidence?: number;
  activeTopicId?: string | null;
  replyChainCount?: number;
  entityTriggers?: string[];
  contextVersion?: "v1" | "v2";
  staleTakeDetected: boolean;
  mediaReactionEligible: boolean;
  maxChars: number;
  maxSentences: number;
  maxParagraphs: number;
  bulletListAllowed: boolean;
  followUpAllowed: boolean;
  blocksUsed: string[];
  promptShape?: "legacy" | "v5_chat";
  relationshipState?: RelationshipState;
}

export interface FeatureFlags {
  webSearch: boolean;
  autoInterject: boolean;
  contextActions: boolean;
  roast: boolean;
  replyQueueEnabled: boolean;
  runtimeConfigCacheEnabled: boolean;
  embeddingCacheEnabled: boolean;
  messageKindAwareMode: boolean;
  memoryAlbumEnabled: boolean;
  interactionRequestsEnabled: boolean;
  linkUnderstandingEnabled: boolean;
  naturalMessageSplittingEnabled: boolean;
  selectiveEngagementEnabled: boolean;
  selfReflectionLessonsEnabled: boolean;
}

export interface PersonaSettings {
  botName: string;
  preferredLanguage: string;
  roughnessLevel: number;
  sarcasmLevel: number;
  roastLevel: number;
  interjectTendency: number;
  replyLength: ReplyLength;
  preferredStyle: string;
  forbiddenWords: string[];
  forbiddenTopics: string[];
  /** V5.1 Phase J: описание сервера для системного промпта. */
  guildDescription?: string | null;
}

export interface RelationshipOverlay {
  toneBias: string;
  roastLevel: number;
  praiseBias: number;
  interruptPriority: number;
  doNotMock: boolean;
  doNotInitiate: boolean;
  protectedTopics: string[];
  relationshipState?: RelationshipState;
  relationshipScore?: number;
  positiveMarks?: number;
  escalationStage?: number;
  escalationUpdatedAt?: Date | null;
  coldUntil?: Date | null;
  coldPermanent?: boolean;
  /** V5.1: постоянная характеристика пользователя (3–5 коротких фраз). Обновляется evaluator'ом раз в N сессий. */
  characteristic?: string | null;
  /** V5.1: что произошло в последней сессии — короткий блок настроения/ключевого изменения. */
  lastChange?: string | null;
  characteristicUpdatedAt?: Date | null;
}

export interface MessageEnvelope {
  messageId: string;
  guildId: string;
  channelId: string;
  userId: string;
  username: string;
  displayName?: string | null;
  channelName?: string | null;
  content: string;
  createdAt: Date;
  replyToMessageId?: string | null;
  mentionCount: number;
  mentionedBot: boolean;
  mentionsBotByName: boolean;
  mentionedUserIds: string[];
  triggerSource?: TriggerSource;
  isModerator: boolean;
  explicitInvocation: boolean;
  isDirectMessage?: boolean;
}

export interface IntentResult {
  intent: BotIntent;
  confidence: number;
  reason: string;
  cleanedContent: string;
  requiresSearch: boolean;
  /**
   * V6 Item 12: символ-sigil из начала сообщения (`?`/`!`/`*`/`>`/`^`),
   * если он сработал. Используется compose-pipeline-ом для вставки
   * sigil-overlay блока в system prompt.
   */
  sigil?: string;
}

export interface LlmChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id?: string;
    function: {
      name: string;
      arguments: Record<string, unknown>;
    };
  }>;
}

export interface ToolExecutionResult {
  toolName: string;
  args: Record<string, unknown>;
  output: unknown;
}

export interface ChatRunResult {
  text: string;
  toolCalls: ToolExecutionResult[];
}

export interface SearchHit {
  title: string;
  url: string;
  description: string;
  source?: string;
  publishedAt?: string;
}

export interface SearchPayload {
  query: string;
  freshness?: string;
  maxResults?: number;
}

export interface FetchPayload {
  url: string;
}

export interface SummarizeSourcesPayload {
  query: string;
  sources: Array<{
    title: string;
    url: string;
    content: string;
  }>;
}

export interface BotTrace {
  triggerSource?: TriggerSource;
  explicitInvocation: boolean;
  intent: BotIntent;
  routeReason: string;
  modelKind?: ModelKind;
  usedSearch: boolean;
  toolNames: string[];
  contextMessages: number;
  memoryLayers: MemoryLayer[];
  relationshipApplied: boolean;
  responseBudget?: {
    contour: "A" | "B" | "C";
    reason: string;
  };
  conflict?: {
    isConflict: boolean;
    score: number;
    participants: string[];
    reasons: string[];
  };
  emotion?: {
    label: string;
    mode: PersonaMode;
    style: {
      warmth: number;
      energy: number;
      directness: number;
    };
  };
  latencyMs?: number;
  responded: boolean;
  behavior?: PersonaBehaviorTrace;
  context?: ContextTrace;
  queue?: ReplyQueueTrace;
  media?: MediaReactionTrace;
  linkUnderstanding?: {
    enabled: boolean;
    urls: string[];
    fetched: number;
    reason?: string;
  };
  activeMemory?: {
    enabled: boolean;
    entries: number;
    layers: string[];
    reason?: string;
  };
  microReaction?: {
    kind: "toxicity" | "praise" | "meta_feedback";
    rule: string;
    confidence: number;
    splitChunks?: string[];
  };
  llmCalls?: LlmCallTrace[];
  searchDiagnostics?: {
    ok: boolean;
    provider?: string;
    error?: string;
    fetchedPages?: number;
    fallbackUsed?: boolean;
  };
  reflection?: {
    recorded: boolean;
    sentiment?: "positive" | "negative" | "neutral";
    lessonId?: string | null;
  };
  aggression?: {
    markerDetected: boolean;
    stageBefore?: number;
    stageAfter?: number;
    checkerVerdict?: "AGGRESSIVE" | "OK" | "SKIPPED";
    moderationRequested?: boolean;
    timeoutMinutes?: number;
    replacementText?: string | null;
  };
  restoredContext?: {
    active: boolean;
    cardId?: string | null;
    title?: string | null;
  };
}

export interface ContextMessage {
  id?: string;
  author: string;
  userId?: string;
  isBot?: boolean;
  content: string;
  createdAt: Date;
  replyToMessageId?: string | null;
}

export interface ActiveTopicContext {
  topicId: string;
  title: string;
  summaryShort: string;
  summaryFacts: string[];
  lastUpdatedAt: Date;
  confidence: number;
}

export interface ContextEntity {
  type: "person" | "org" | "place" | "concept";
  surface: string;
  canonical?: string;
  score: number;
}

export interface ActiveMemoryEntry {
  scope: "user" | "server" | "channel" | "event" | "message";
  key: string;
  value: string;
  type: string;
  score: number;
  reason: string;
  sourceId?: string;
  sourceUserId?: string | null;
  createdAt?: Date;
}

export interface ActiveMemoryContext {
  entries: ActiveMemoryEntry[];
  trace: {
    enabled: boolean;
    layers: string[];
    reason?: string;
  };
}

export interface LlmCallTrace {
  purpose: string;
  model: string;
  provider?: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  source: "reported" | "estimated";
  durationMs?: number;
  finishReason?: string;
  fallbackDepth?: number;
  routedFrom?: string[];
  requestId?: string;
  /** Tokens served from OpenAI prompt cache. Present only when > 0. */
  cachedTokens?: number;
}

export interface ContextScores {
  contextConfidence: number;
  mockeryConfidence: number;
  reasons: string[];
}

export interface ContextTrace {
  version: "v1" | "v2";
  contextConfidence?: number;
  mockeryConfidence?: number;
  activeTopicId?: string | null;
  replyChainCount: number;
  entityTriggers: string[];
  truncation?: {
    maxChars: number;
    droppedRecentMessages: number;
    droppedWarmSections?: number;
  };
  sections: string[];
}

export interface ReplyQueueTrace {
  enabled: boolean;
  action: "none" | "queued" | "processing" | "dropped" | "busy_ack" | "drained";
  itemId?: string | null;
  reason?: string;
}

export interface MediaReactionTrace {
  enabled: boolean;
  selected: boolean;
  mediaId?: string | null;
  reason?: string;
  autoTriggered?: boolean;
  reasonKey?: string | null;
}

export interface BotReplyPayload {
  text: string;
  media?: {
    filePath: string;
    mediaId: string;
    type: string;
  } | null;
}

export interface ContextBundle {
  recentMessages: ContextMessage[];
  relationship?: RelationshipOverlay | null;
}

export interface ContextBundleV2 extends ContextBundle {
  version: "v2";
  repliedMessageId?: string | null;
  activeMemory?: ActiveMemoryContext;
}

export interface AnalyticsTopItem {
  id: string;
  label: string;
  value: number;
}

export interface AnalyticsOverview {
  window: "day" | "week" | "month" | "all";
  topUsers: AnalyticsTopItem[];
  topChannels: AnalyticsTopItem[];
  peakHours: AnalyticsTopItem[];
  totals: {
    messages: number;
    replies: number;
    mentions: number;
  };
}

export interface QueueJobNames {
  summary: "summary.generate";
  profile: "profile.refresh";
  embedding: "embedding.generate";
  topic: "topic.update";
  session: "session.evaluate";
  memoryFormation: "memory.formation";
  cleanup: "cleanup.execute";
  searchCache: "search-cache.cleanup";
}

export interface SummaryJobPayload {
  guildId: string;
  channelId: string;
}

export interface ProfileJobPayload {
  guildId: string;
  userId: string;
}

export interface EmbeddingJobPayload {
  entityType: "message" | "server_memory" | "user_memory" | "channel_memory" | "event_memory";
  entityId: string;
}

export interface MemoryFormationJobPayload {
  runId: string;
  guildId: string;
  channelId?: string | null;
  scope: "channel" | "server";
  depth: "recent" | "deep";
  requestedBy: string;
}

export interface TopicJobPayload {
  guildId: string;
  channelId: string;
  messageId: string;
}

export interface SessionJobPayload {
  guildId: string;
  channelId: string;
  userId: string;
}

export interface CleanupJobPayload {
  kind: "logs" | "interjections";
}

export interface SearchCacheCleanupJobPayload {
  nowIso: string;
}

