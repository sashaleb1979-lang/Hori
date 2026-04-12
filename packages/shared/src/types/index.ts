export type BotIntent =
  | "chat"
  | "help"
  | "summary"
  | "analytics"
  | "search"
  | "profile"
  | "memory_write"
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
  | "user_profile"
  | "relationship"
  | "reply_chain"
  | "active_topic"
  | "topic_window"
  | "entity_memory";

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
}

export interface FeatureFlags {
  webSearch: boolean;
  autoInterject: boolean;
  userProfiles: boolean;
  contextActions: boolean;
  roast: boolean;
  contextV2Enabled: boolean;
  contextConfidenceEnabled: boolean;
  topicEngineEnabled: boolean;
  affinitySignalsEnabled: boolean;
  moodEngineEnabled: boolean;
  replyQueueEnabled: boolean;
  mediaReactionsEnabled: boolean;
  runtimeConfigCacheEnabled: boolean;
  embeddingCacheEnabled: boolean;
  channelAwareMode: boolean;
  messageKindAwareMode: boolean;
  antiSlopStrictMode: boolean;
  playfulModeEnabled: boolean;
  irritatedModeEnabled: boolean;
  ideologicalFlavourEnabled: boolean;
  analogyBanEnabled: boolean;
  slangLayerEnabled: boolean;
  selfInterjectionConstraintsEnabled: boolean;
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
}

export interface RelationshipOverlay {
  toneBias: string;
  roastLevel: number;
  praiseBias: number;
  interruptPriority: number;
  doNotMock: boolean;
  doNotInitiate: boolean;
  protectedTopics: string[];
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
}

export interface IntentResult {
  intent: BotIntent;
  confidence: number;
  reason: string;
  cleanedContent: string;
  requiresSearch: boolean;
}

export interface LlmChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
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
  latencyMs?: number;
  responded: boolean;
  behavior?: PersonaBehaviorTrace;
  context?: ContextTrace;
  queue?: ReplyQueueTrace;
  media?: MediaReactionTrace;
}

export interface ContextMessage {
  id?: string;
  author: string;
  userId?: string;
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
  summaries: Array<{ summaryShort: string; summaryLong: string; rangeStart: Date; rangeEnd: Date; topicTags?: string[] }>;
  serverMemories: Array<{ key: string; value: string; type: string }>;
  userProfile?: {
    summaryShort: string;
    styleTags: string[];
    topicTags: string[];
    confidenceScore: number;
  } | null;
  relationship?: RelationshipOverlay | null;
}

export interface ContextBundleV2 extends ContextBundle {
  version: "v2";
  replyChain: ContextMessage[];
  repliedMessageId?: string | null;
  activeTopic?: ActiveTopicContext | null;
  topicWindow: ContextMessage[];
  entities: ContextEntity[];
  entityMemories: Array<{ key: string; value: string; type: string; score: number }>;
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
  entityType: "message" | "server_memory" | "user_memory";
  entityId: string;
}

export interface TopicJobPayload {
  guildId: string;
  channelId: string;
  messageId: string;
}

export interface CleanupJobPayload {
  kind: "logs" | "interjections";
}

export interface SearchCacheCleanupJobPayload {
  nowIso: string;
}

