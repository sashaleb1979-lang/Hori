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

export type MemoryLayer = "recent_messages" | "channel_summaries" | "server_memory" | "user_profile" | "relationship";

export interface FeatureFlags {
  webSearch: boolean;
  autoInterject: boolean;
  userProfiles: boolean;
  contextActions: boolean;
  roast: boolean;
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
}

export interface ContextBundle {
  recentMessages: Array<{ author: string; content: string; createdAt: Date }>;
  summaries: Array<{ summaryShort: string; summaryLong: string; rangeStart: Date; rangeEnd: Date }>;
  serverMemories: Array<{ key: string; value: string; type: string }>;
  userProfile?: {
    summaryShort: string;
    styleTags: string[];
    topicTags: string[];
    confidenceScore: number;
  } | null;
  relationship?: RelationshipOverlay | null;
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

export interface CleanupJobPayload {
  kind: "logs" | "interjections";
}

export interface SearchCacheCleanupJobPayload {
  nowIso: string;
}

