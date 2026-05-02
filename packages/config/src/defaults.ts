import type { PersonaSettings } from "@hori/shared";

export const POWER_PROFILE_PRESETS = {
  economy: {
    llmMaxContextMessages: 8,
    contextMaxChars: 1800,
    llmReplyMaxTokens: 160,
    defaultReplyMaxChars: 1100,
    ollamaKeepAlive: "5m",
    ollamaNumCtx: 4096,
    ollamaNumBatch: 64
  },
  balanced: {
    llmMaxContextMessages: 12,
    contextMaxChars: 4000,
    llmReplyMaxTokens: 220,
    defaultReplyMaxChars: 1600,
    ollamaKeepAlive: "10m",
    ollamaNumCtx: 8192,
    ollamaNumBatch: 128
  },
  expanded: {
    llmMaxContextMessages: 18,
    contextMaxChars: 4200,
    llmReplyMaxTokens: 320,
    defaultReplyMaxChars: 2200,
    ollamaKeepAlive: "20m",
    ollamaNumCtx: 12288,
    ollamaNumBatch: 256
  },
  max: {
    llmMaxContextMessages: 24,
    contextMaxChars: 6000,
    llmReplyMaxTokens: 480,
    defaultReplyMaxChars: 3000,
    ollamaKeepAlive: "30m",
    ollamaNumCtx: 16384,
    ollamaNumBatch: 256
  }
} as const;

export type PowerProfileName = keyof typeof POWER_PROFILE_PRESETS;
export type PowerProfileSettings = (typeof POWER_PROFILE_PRESETS)[PowerProfileName];

export const defaultPersonaSettings: PersonaSettings = {
  botName: "Хори",
  preferredLanguage: "ru",
  roughnessLevel: 2,
  sarcasmLevel: 2,
  roastLevel: 2,
  interjectTendency: 1,
  replyLength: "short",
  preferredStyle: "коротко, сухо, по делу",
  forbiddenWords: [],
  forbiddenTopics: []
};

export const defaultRuntimeTuning = {
  FEATURE_WEB_SEARCH: true,
  FEATURE_AUTOINTERJECT: false,
  FEATURE_MEMORY_HYDE_ENABLED: true,
  FEATURE_CONTEXT_ACTIONS: true,
  FEATURE_ROAST: true,
  FEATURE_TOPIC_ENGINE_ENABLED: true,
  FEATURE_REPLY_QUEUE_ENABLED: true,
  FEATURE_RUNTIME_CONFIG_CACHE_ENABLED: true,
  FEATURE_EMBEDDING_CACHE_ENABLED: true,
  FEATURE_MESSAGE_KIND_AWARE_MODE: true,
  FEATURE_MEMORY_ALBUM_ENABLED: true,
  FEATURE_INTERACTION_REQUESTS_ENABLED: true,
  FEATURE_LINK_UNDERSTANDING_ENABLED: true,
  FEATURE_NATURAL_MESSAGE_SPLITTING_ENABLED: true,
  FEATURE_SELECTIVE_ENGAGEMENT_ENABLED: true,
  FEATURE_SELF_REFLECTION_LESSONS_ENABLED: true,
  FEATURE_MEDIA_REACTIONS_ENABLED: true,
  LLM_MAX_CONTEXT_MESSAGES: 12,
  LLM_MAX_TOOL_CALLS: 4,
  LLM_REPLY_MAX_TOKENS: 220,
  OLLAMA_KEEP_ALIVE: "10m",
  OLLAMA_NUM_CTX: 8192,
  OLLAMA_NUM_BATCH: 128,
  RUNTIME_CONFIG_CACHE_TTL_SEC: 20,
  EMBEDDING_CACHE_TTL_SEC: 300,
  CONTEXT_V2_MAX_CHARS: 4000,
  TOPIC_TTL_MINUTES: 30,
  TOPIC_SIM_THRESHOLD: 0.35,
  REPLY_QUEUE_BUSY_TTL_SEC: 45,
  USER_PROFILE_MIN_MESSAGES: 50,
  USER_PROFILE_REFRESH_MESSAGES: 40,
  USER_PROFILE_REFRESH_HOURS: 12,
  SUMMARY_CHUNK_MESSAGE_COUNT: 80,
  SUMMARY_MIN_MESSAGES: 25,
  SEARCH_CACHE_TTL_SEC: 1800,
  SEARCH_MAX_REQUESTS_PER_RESPONSE: 2,
  SEARCH_MAX_PAGES_PER_RESPONSE: 3,
  SEARCH_USER_COOLDOWN_SEC: 30,
  SEARCH_DOMAIN_ALLOWLIST: [] as string[],
  SEARCH_DOMAIN_DENYLIST: ["reddit.com"] as string[],
  AUTOINTERJECT_CHANNEL_ALLOWLIST: [] as string[],
  AUTOINTERJECT_COOLDOWN_SEC: 900,
  AUTOINTERJECT_MAX_PER_HOUR: 2,
  AUTOINTERJECT_MIN_CONFIDENCE: 0.8,
  MESSAGE_HISTORY_LIMIT: 40,
  MESSAGE_EMBED_MIN_CHARS: 40,
  MESSAGE_EMBED_BATCH_SIZE: 16,
  DEFAULT_REPLY_MAX_CHARS: 1600,
  DEFAULT_ROAST_LEVEL: 2,
  DEFAULT_SARCASM_LEVEL: 2,
  DEFAULT_INTERJECT_TENDENCY: 1,
  NATURAL_SPLIT_CHANCE: 0.14,
  NATURAL_SPLIT_COOLDOWN_SEC: 600,
  SELECTIVE_ENGAGEMENT_MIN_SCORE: 0.68,
  JOB_QUEUE_PREFIX: "hori",
  JOB_CONCURRENCY_SUMMARIES: 1,
  JOB_CONCURRENCY_PROFILES: 1,
  JOB_CONCURRENCY_EMBEDDINGS: 1,
  MEDIA_AUTO_GLOBAL_COOLDOWN_SEC: 7200,
  MEDIA_AUTO_MIN_CONFIDENCE: 0.82,
  MEDIA_AUTO_MIN_INTENSITY: 0.62,
  DISCORD_REGISTER_LEGACY_COMMANDS: false,

  // --- Quiet hours + rate limits (из AICO agency.yaml) ---
  QUIET_HOURS_ENABLED: true,
  QUIET_HOURS_START: 22,      // 22:00
  QUIET_HOURS_END: 8,         // 08:00
  MAX_PROACTIVE_PER_DAY: 5,
  MIN_HOURS_BETWEEN_PROACTIVE: 2,
};

export type RuntimeTuning = typeof defaultRuntimeTuning;
