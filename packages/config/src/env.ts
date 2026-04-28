import { z } from "zod";

import { parseCsv } from "@hori/shared";

import { defaultRuntimeTuning, type RuntimeTuning } from "./defaults";

function preserveMissing(value: unknown) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
}

function normalizeStringValue(value: unknown) {
  const next = preserveMissing(value);

  if (next === undefined) {
    return undefined;
  }

  if (typeof next !== "string") {
    return next;
  }

  const trimmed = next.trim();
  const hasDoubleQuotes = trimmed.startsWith("\"") && trimmed.endsWith("\"");
  const hasSingleQuotes = trimmed.startsWith("'") && trimmed.endsWith("'");

  if (hasDoubleQuotes || hasSingleQuotes) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

const boolish = z.preprocess((value) => {
  const next = preserveMissing(value);

  if (next === undefined) {
    return undefined;
  }

  if (typeof next === "boolean") {
    return next;
  }

  const normalized = String(next).trim().toLowerCase();

  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }

  return next;
}, z.boolean());

const intish = z.preprocess((value) => {
  const next = preserveMissing(value);

  if (next === undefined) {
    return undefined;
  }

  return Number(next);
}, z.number().int());

const floatish = z.preprocess((value) => {
  const next = preserveMissing(value);

  if (next === undefined) {
    return undefined;
  }

  return Number(next);
}, z.number());

const csvish = z.preprocess((value) => {
  const next = preserveMissing(value);

  if (next === undefined) {
    return undefined;
  }

  return parseCsv(typeof next === "string" ? next : undefined);
}, z.array(z.string()));

const urlish = z.preprocess((value) => normalizeStringValue(value), z.string().url());

const coreEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.string().default("info"),

  DISCORD_TOKEN: z.string().optional(),
  DISCORD_CLIENT_ID: z.string().optional(),
  DISCORD_OWNER_IDS: csvish.default([]),

  BOT_NAME: z.string().default("Хори"),
  BOT_DEFAULT_LANGUAGE: z.string().default("ru"),

  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: intish.default(3000),
  API_ADMIN_TOKEN: z.string().default("change-me"),

  DATABASE_URL: urlish,
  REDIS_URL: urlish,

  LLM_PROVIDER: z.enum(["ollama", "openai", "router"]).default("ollama"),

  OLLAMA_BASE_URL: urlish.optional(),
  OLLAMA_FAST_MODEL: z.string().default("qwen3.5:9b"),
  OLLAMA_SMART_MODEL: z.string().default("qwen3.5:9b"),
  OLLAMA_EMBED_MODEL: z.string().default("nomic-embed-text"),
  OLLAMA_TIMEOUT_MS: intish.default(45000),
  OLLAMA_LOG_TRAFFIC: boolish.default(false),
  OLLAMA_LOG_PROMPTS: boolish.default(false),
  OLLAMA_LOG_RESPONSES: boolish.default(false),
  OLLAMA_LOG_MAX_CHARS: intish.default(12000),

  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-5-nano"),
  OPENAI_CHAT_MODEL: z.string().default("gpt-5.4-nano"),
  OPENAI_SMART_MODEL: z.string().default("gpt-5.4-nano"),
  OPENAI_EMBED_MODEL: z.string().default("text-embedding-3-small"),
  OPENAI_EMBED_DIMENSIONS: intish.default(768),

  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_BASE_URL: urlish.default("https://api.deepseek.com"),
  DEEPSEEK_MODEL: z.string().default("deepseek-v4-flash"),

  GOOGLE_API_KEY: z.string().optional(),
  GEMINI_FLASH_MODEL: z.string().default("gemini-2.5-flash"),
  GEMINI_PRO_MODEL: z.string().default("gemini-2.5-pro"),

  CF_ACCOUNT_ID: z.string().optional(),
  CF_API_TOKEN: z.string().optional(),
  CF_MODEL: z.string().default("@cf/zai-org/glm-4.7-flash"),

  GITHUB_TOKEN: z.string().optional(),
  GITHUB_MODELS_URL: urlish.default("https://models.github.ai/inference/chat/completions"),
  GITHUB_MODEL_PRIMARY: z.string().default("openai/gpt-5-mini"),
  GITHUB_MODEL_SECONDARY: z.string().default("openai/gpt-5-chat"),
  GITHUB_MODEL_TERTIARY: z.string().default("openai/gpt-5-nano"),

  AI_ROUTER_ENABLE_DEEPSEEK: boolish.default(true),
  AI_ROUTER_ENABLE_GEMINI: boolish.default(true),
  AI_ROUTER_ENABLE_CLOUDFLARE: boolish.default(true),
  AI_ROUTER_ENABLE_GITHUB: boolish.default(true),
  AI_ROUTER_ENABLE_OPENAI: boolish.default(true),
  AI_ROUTER_LOG_VERBOSE: boolish.default(false),
  AI_ROUTER_USE_GEMINI_PRO_FOR_COMPLEX: boolish.default(true),
  AI_ROUTER_DEEPSEEK_COOLDOWN_MS: intish.default(300000),
  AI_ROUTER_GEMINI_FLASH_DAILY_LIMIT: intish.default(250),
  AI_ROUTER_GEMINI_PRO_DAILY_LIMIT: intish.default(100),
  AI_ROUTER_CLOUDFLARE_COOLDOWN_MS: intish.default(900000),
  AI_ROUTER_GITHUB_COOLDOWN_MS: intish.default(1800000),
  AI_ROUTER_OPENAI_COOLDOWN_MS: intish.default(300000),

  BRAVE_SEARCH_API_KEY: z.string().optional(),

  CFG: z.string().optional()
});

const compactConfigSchema = z
  .object({
    features: z
      .object({
        webSearch: z.boolean().optional(),
        autoInterject: z.boolean().optional(),
        memoryHydeEnabled: z.boolean().optional(),
        emotionalAdviceAnchorsEnabled: z.boolean().optional(),
        userProfiles: z.boolean().optional(),
        contextActions: z.boolean().optional(),
        roast: z.boolean().optional(),
        contextV2Enabled: z.boolean().optional(),
        contextConfidenceEnabled: z.boolean().optional(),
        topicEngineEnabled: z.boolean().optional(),
        affinitySignalsEnabled: z.boolean().optional(),
        moodEngineEnabled: z.boolean().optional(),
        replyQueueEnabled: z.boolean().optional(),
        mediaReactionsEnabled: z.boolean().optional(),
        runtimeConfigCacheEnabled: z.boolean().optional(),
        embeddingCacheEnabled: z.boolean().optional(),
        channelAwareMode: z.boolean().optional(),
        messageKindAwareMode: z.boolean().optional(),
        antiSlopStrictMode: z.boolean().optional(),
        playfulModeEnabled: z.boolean().optional(),
        irritatedModeEnabled: z.boolean().optional(),
        ideologicalFlavourEnabled: z.boolean().optional(),
        analogyBanEnabled: z.boolean().optional(),
        slangLayerEnabled: z.boolean().optional(),
        selfInterjectionConstraintsEnabled: z.boolean().optional(),
        memoryAlbumEnabled: z.boolean().optional(),
        interactionRequestsEnabled: z.boolean().optional(),
        linkUnderstandingEnabled: z.boolean().optional(),
        naturalMessageSplittingEnabled: z.boolean().optional(),
        selectiveEngagementEnabled: z.boolean().optional(),
        selfReflectionLessonsEnabled: z.boolean().optional()
      })
      .partial()
      .optional(),
    llm: z
      .object({
        contextMessages: z.number().int().positive().optional(),
        toolCalls: z.number().int().positive().optional(),
        replyMaxTokens: z.number().int().positive().optional(),
        keepAlive: z.string().optional(),
        numCtx: z.number().int().positive().optional(),
        numBatch: z.number().int().positive().optional()
      })
      .partial()
      .optional(),
    context: z
      .object({
        maxChars: z.number().int().positive().optional(),
        topicTtlMinutes: z.number().int().positive().optional(),
        topicSimilarityThreshold: z.number().min(0).max(1).optional(),
        runtimeConfigCacheTtlSec: z.number().int().nonnegative().optional(),
        embeddingCacheTtlSec: z.number().int().nonnegative().optional(),
        replyQueueBusyTtlSec: z.number().int().positive().optional()
      })
      .partial()
      .optional(),
    profiles: z
      .object({
        minMessages: z.number().int().nonnegative().optional(),
        refreshMessages: z.number().int().nonnegative().optional(),
        refreshHours: z.number().int().nonnegative().optional()
      })
      .partial()
      .optional(),
    summary: z
      .object({
        chunkMessages: z.number().int().positive().optional(),
        minMessages: z.number().int().positive().optional()
      })
      .partial()
      .optional(),
    search: z
      .object({
        cacheTtlSec: z.number().int().positive().optional(),
        maxRequests: z.number().int().positive().optional(),
        maxPages: z.number().int().positive().optional(),
        userCooldownSec: z.number().int().nonnegative().optional(),
        allowlist: z.array(z.string()).optional(),
        denylist: z.array(z.string()).optional()
      })
      .partial()
      .optional(),
    interject: z
      .object({
        channels: z.array(z.string()).optional(),
        cooldownSec: z.number().int().nonnegative().optional(),
        maxPerHour: z.number().int().nonnegative().optional(),
        minConfidence: z.number().nonnegative().optional()
      })
      .partial()
      .optional(),
    message: z
      .object({
        historyLimit: z.number().int().positive().optional(),
        embedMinChars: z.number().int().positive().optional(),
        embedBatchSize: z.number().int().positive().optional()
      })
      .partial()
      .optional(),
    reply: z
      .object({
        maxChars: z.number().int().positive().optional(),
        roastLevel: z.number().int().nonnegative().optional(),
        sarcasmLevel: z.number().int().nonnegative().optional(),
        interjectTendency: z.number().int().nonnegative().optional()
      })
      .partial()
      .optional(),
    chat: z
      .object({
        naturalSplitChance: z.number().min(0).max(1).optional(),
        naturalSplitCooldownSec: z.number().int().nonnegative().optional(),
        selectiveEngagementMinScore: z.number().min(0).max(1).optional()
      })
      .partial()
      .optional(),
    media: z
      .object({
        autoGlobalCooldownSec: z.number().int().nonnegative().optional(),
        autoMinConfidence: z.number().min(0).max(1).optional(),
        autoMinIntensity: z.number().min(0).max(1).optional()
      })
      .partial()
      .optional(),
    jobs: z
      .object({
        prefix: z.string().optional(),
        summaries: z.number().int().positive().optional(),
        profiles: z.number().int().positive().optional(),
        embeddings: z.number().int().positive().optional()
      })
      .partial()
      .optional()
  })
  .partial();

const legacyAdvancedSchema = z
  .object({
    FEATURE_WEB_SEARCH: boolish.optional(),
    FEATURE_AUTOINTERJECT: boolish.optional(),
    FEATURE_MEMORY_HYDE_ENABLED: boolish.optional(),
    FEATURE_EMOTIONAL_ADVICE_ANCHORS_ENABLED: boolish.optional(),
    FEATURE_USER_PROFILES: boolish.optional(),
    FEATURE_CONTEXT_ACTIONS: boolish.optional(),
    FEATURE_ROAST: boolish.optional(),
    FEATURE_CONTEXT_V2_ENABLED: boolish.optional(),
    FEATURE_CONTEXT_CONFIDENCE_ENABLED: boolish.optional(),
    FEATURE_TOPIC_ENGINE_ENABLED: boolish.optional(),
    FEATURE_AFFINITY_SIGNALS_ENABLED: boolish.optional(),
    FEATURE_MOOD_ENGINE_ENABLED: boolish.optional(),
    FEATURE_REPLY_QUEUE_ENABLED: boolish.optional(),
    FEATURE_MEDIA_REACTIONS_ENABLED: boolish.optional(),
    FEATURE_RUNTIME_CONFIG_CACHE_ENABLED: boolish.optional(),
    FEATURE_EMBEDDING_CACHE_ENABLED: boolish.optional(),
    FEATURE_CHANNEL_AWARE_MODE: boolish.optional(),
    FEATURE_MESSAGE_KIND_AWARE_MODE: boolish.optional(),
    FEATURE_ANTI_SLOP_STRICT_MODE: boolish.optional(),
    FEATURE_PLAYFUL_MODE_ENABLED: boolish.optional(),
    FEATURE_IRRITATED_MODE_ENABLED: boolish.optional(),
    FEATURE_IDEOLOGICAL_FLAVOUR_ENABLED: boolish.optional(),
    FEATURE_ANALOGY_BAN_ENABLED: boolish.optional(),
    FEATURE_SLANG_LAYER_ENABLED: boolish.optional(),
    FEATURE_SELF_INTERJECTION_CONSTRAINTS_ENABLED: boolish.optional(),
    FEATURE_MEMORY_ALBUM_ENABLED: boolish.optional(),
    FEATURE_INTERACTION_REQUESTS_ENABLED: boolish.optional(),
    FEATURE_LINK_UNDERSTANDING_ENABLED: boolish.optional(),
    FEATURE_NATURAL_MESSAGE_SPLITTING_ENABLED: boolish.optional(),
    FEATURE_SELECTIVE_ENGAGEMENT_ENABLED: boolish.optional(),
    FEATURE_SELF_REFLECTION_LESSONS_ENABLED: boolish.optional(),
    LLM_MAX_CONTEXT_MESSAGES: intish.optional(),
    LLM_MAX_TOOL_CALLS: intish.optional(),
    LLM_REPLY_MAX_TOKENS: intish.optional(),
    OLLAMA_KEEP_ALIVE: z.string().optional(),
    OLLAMA_NUM_CTX: intish.optional(),
    OLLAMA_NUM_BATCH: intish.optional(),
    RUNTIME_CONFIG_CACHE_TTL_SEC: intish.optional(),
    EMBEDDING_CACHE_TTL_SEC: intish.optional(),
    CONTEXT_V2_MAX_CHARS: intish.optional(),
    TOPIC_TTL_MINUTES: intish.optional(),
    TOPIC_SIM_THRESHOLD: floatish.optional(),
    REPLY_QUEUE_BUSY_TTL_SEC: intish.optional(),
    USER_PROFILE_MIN_MESSAGES: intish.optional(),
    USER_PROFILE_REFRESH_MESSAGES: intish.optional(),
    USER_PROFILE_REFRESH_HOURS: intish.optional(),
    SUMMARY_CHUNK_MESSAGE_COUNT: intish.optional(),
    SUMMARY_MIN_MESSAGES: intish.optional(),
    SEARCH_CACHE_TTL_SEC: intish.optional(),
    SEARCH_MAX_REQUESTS_PER_RESPONSE: intish.optional(),
    SEARCH_MAX_PAGES_PER_RESPONSE: intish.optional(),
    SEARCH_USER_COOLDOWN_SEC: intish.optional(),
    SEARCH_DOMAIN_ALLOWLIST: csvish.optional(),
    SEARCH_DOMAIN_DENYLIST: csvish.optional(),
    AUTOINTERJECT_CHANNEL_ALLOWLIST: csvish.optional(),
    AUTOINTERJECT_COOLDOWN_SEC: intish.optional(),
    AUTOINTERJECT_MAX_PER_HOUR: intish.optional(),
    AUTOINTERJECT_MIN_CONFIDENCE: floatish.optional(),
    MESSAGE_HISTORY_LIMIT: intish.optional(),
    MESSAGE_EMBED_MIN_CHARS: intish.optional(),
    MESSAGE_EMBED_BATCH_SIZE: intish.optional(),
    DEFAULT_REPLY_MAX_CHARS: intish.optional(),
    DEFAULT_ROAST_LEVEL: intish.optional(),
    DEFAULT_SARCASM_LEVEL: intish.optional(),
    DEFAULT_INTERJECT_TENDENCY: intish.optional(),
    NATURAL_SPLIT_CHANCE: floatish.optional(),
    NATURAL_SPLIT_COOLDOWN_SEC: intish.optional(),
    SELECTIVE_ENGAGEMENT_MIN_SCORE: floatish.optional(),
    MEDIA_AUTO_GLOBAL_COOLDOWN_SEC: intish.optional(),
    MEDIA_AUTO_MIN_CONFIDENCE: floatish.optional(),
    MEDIA_AUTO_MIN_INTENSITY: floatish.optional(),
    DISCORD_REGISTER_LEGACY_COMMANDS: boolish.optional(),
    JOB_QUEUE_PREFIX: z.string().optional(),
    JOB_CONCURRENCY_SUMMARIES: intish.optional(),
    JOB_CONCURRENCY_PROFILES: intish.optional(),
    JOB_CONCURRENCY_EMBEDDINGS: intish.optional()
  })
  .partial();

export interface AppEnv extends z.infer<typeof coreEnvSchema>, RuntimeTuning {}
export type AppRole = "bot" | "api" | "worker";

export const AI_ROUTER_PROVIDER_NAMES = ["deepseek", "gemini", "cloudflare", "github", "openai"] as const;
export type AiRouterProviderName = (typeof AI_ROUTER_PROVIDER_NAMES)[number];

export interface AiRouterProviderEnvState {
  name: AiRouterProviderName;
  enabledByFlag: boolean;
  configured: boolean;
  enabled: boolean;
  missing: string[];
}

export type AiRouterEnvState = Record<AiRouterProviderName, AiRouterProviderEnvState>;

const envAliasMap = {
  BOT_TOKEN: "DISCORD_TOKEN",
  BOT_ID: "DISCORD_CLIENT_ID",
  BOT_OWNERS: "DISCORD_OWNER_IDS",
  BOT_LANG: "BOT_DEFAULT_LANGUAGE",
  HOST: "API_HOST",
  PORT: "API_PORT",
  ADMIN_KEY: "API_ADMIN_TOKEN",
  DB_URL: "DATABASE_URL",
  KV_URL: "REDIS_URL",
  AI_URL: "OLLAMA_BASE_URL",
  AI_FAST: "OLLAMA_FAST_MODEL",
  AI_SMART: "OLLAMA_SMART_MODEL",
  AI_EMBED: "OLLAMA_EMBED_MODEL",
  AI_TIMEOUT: "OLLAMA_TIMEOUT_MS",
  AI_LOG_TRAFFIC: "OLLAMA_LOG_TRAFFIC",
  AI_LOG_PROMPTS: "OLLAMA_LOG_PROMPTS",
  AI_LOG_RESPONSES: "OLLAMA_LOG_RESPONSES",
  AI_LOG_MAX_CHARS: "OLLAMA_LOG_MAX_CHARS",
  BRAVE_KEY: "BRAVE_SEARCH_API_KEY",
  HORI_CFG: "CFG",
  HORI_CONFIG_JSON: "CFG",
  AI_PROVIDER: "LLM_PROVIDER",
  OAI_KEY: "OPENAI_API_KEY",
  OAI_MODEL: "OPENAI_MODEL",
  OAI_CHAT: "OPENAI_CHAT_MODEL",
  OAI_SMART: "OPENAI_SMART_MODEL",
  OAI_EMBED: "OPENAI_EMBED_MODEL",
  OAI_EMBED_DIMS: "OPENAI_EMBED_DIMENSIONS",
  DS_KEY: "DEEPSEEK_API_KEY",
  DS_URL: "DEEPSEEK_BASE_URL",
  DS_MODEL: "DEEPSEEK_MODEL",
  GOOGLE_KEY: "GOOGLE_API_KEY",
  GEMINI_FLASH: "GEMINI_FLASH_MODEL",
  GEMINI_PRO: "GEMINI_PRO_MODEL",
  CF_ACCOUNT: "CF_ACCOUNT_ID",
  CF_TOKEN: "CF_API_TOKEN",
  GH_TOKEN: "GITHUB_TOKEN",
  GH_MODELS_URL: "GITHUB_MODELS_URL",
  GH_MODEL_PRIMARY: "GITHUB_MODEL_PRIMARY",
  GH_MODEL_SECONDARY: "GITHUB_MODEL_SECONDARY",
  GH_MODEL_TERTIARY: "GITHUB_MODEL_TERTIARY"
} as const satisfies Record<string, string>;

const canonicalEnvHints = {
  DATABASE_URL: ["DATABASE_URL", "DB_URL"],
  REDIS_URL: ["REDIS_URL", "KV_URL"],
  OLLAMA_BASE_URL: ["OLLAMA_BASE_URL", "AI_URL"]
} as const satisfies Partial<Record<keyof z.infer<typeof coreEnvSchema>, readonly string[]>>;

export function applyEnvAliases(raw: NodeJS.ProcessEnv = process.env) {
  for (const [alias, canonical] of Object.entries(envAliasMap)) {
    const aliasValue = raw[alias];

    if (!raw[canonical] && aliasValue) {
      raw[canonical] = aliasValue;
    }
  }

  return raw;
}

function mapCoreAliases(raw: NodeJS.ProcessEnv) {
  return {
    NODE_ENV: raw.NODE_ENV,
    LOG_LEVEL: raw.LOG_LEVEL,
    DISCORD_TOKEN: raw.BOT_TOKEN ?? raw.DISCORD_TOKEN,
    DISCORD_CLIENT_ID: raw.BOT_ID ?? raw.DISCORD_CLIENT_ID,
    DISCORD_OWNER_IDS: raw.BOT_OWNERS ?? raw.DISCORD_OWNER_IDS,
    BOT_NAME: raw.BOT_NAME,
    BOT_DEFAULT_LANGUAGE: raw.BOT_LANG ?? raw.BOT_DEFAULT_LANGUAGE,
    API_HOST: raw.HOST ?? raw.API_HOST,
    API_PORT: raw.PORT ?? raw.API_PORT,
    API_ADMIN_TOKEN: raw.ADMIN_KEY ?? raw.API_ADMIN_TOKEN,
    DATABASE_URL: raw.DB_URL ?? raw.DATABASE_URL,
    REDIS_URL: raw.KV_URL ?? raw.REDIS_URL,
    OLLAMA_BASE_URL: raw.AI_URL ?? raw.OLLAMA_BASE_URL,
    OLLAMA_FAST_MODEL: raw.AI_FAST ?? raw.OLLAMA_FAST_MODEL,
    OLLAMA_SMART_MODEL: raw.AI_SMART ?? raw.OLLAMA_SMART_MODEL,
    OLLAMA_EMBED_MODEL: raw.AI_EMBED ?? raw.OLLAMA_EMBED_MODEL,
    OLLAMA_TIMEOUT_MS: raw.AI_TIMEOUT ?? raw.OLLAMA_TIMEOUT_MS,
    OLLAMA_LOG_TRAFFIC: raw.AI_LOG_TRAFFIC ?? raw.OLLAMA_LOG_TRAFFIC,
    OLLAMA_LOG_PROMPTS: raw.AI_LOG_PROMPTS ?? raw.OLLAMA_LOG_PROMPTS,
    OLLAMA_LOG_RESPONSES: raw.AI_LOG_RESPONSES ?? raw.OLLAMA_LOG_RESPONSES,
    OLLAMA_LOG_MAX_CHARS: raw.AI_LOG_MAX_CHARS ?? raw.OLLAMA_LOG_MAX_CHARS,
    BRAVE_SEARCH_API_KEY: raw.BRAVE_KEY ?? raw.BRAVE_SEARCH_API_KEY,
    CFG: raw.CFG ?? raw.HORI_CFG ?? raw.HORI_CONFIG_JSON,
    LLM_PROVIDER: raw.AI_PROVIDER ?? raw.LLM_PROVIDER,
    OPENAI_API_KEY: raw.OAI_KEY ?? raw.OPENAI_API_KEY,
    OPENAI_MODEL: raw.OAI_MODEL ?? raw.OPENAI_MODEL ?? raw.OAI_CHAT ?? raw.OPENAI_CHAT_MODEL,
    OPENAI_CHAT_MODEL: raw.OAI_CHAT ?? raw.OPENAI_CHAT_MODEL ?? raw.OAI_MODEL ?? raw.OPENAI_MODEL,
    OPENAI_SMART_MODEL: raw.OAI_SMART ?? raw.OPENAI_SMART_MODEL ?? raw.OAI_MODEL ?? raw.OPENAI_MODEL,
    OPENAI_EMBED_MODEL: raw.OAI_EMBED ?? raw.OPENAI_EMBED_MODEL,
    OPENAI_EMBED_DIMENSIONS: raw.OAI_EMBED_DIMS ?? raw.OPENAI_EMBED_DIMENSIONS,
    DEEPSEEK_API_KEY: raw.DS_KEY ?? raw.DEEPSEEK_API_KEY,
    DEEPSEEK_BASE_URL: raw.DS_URL ?? raw.DEEPSEEK_BASE_URL,
    DEEPSEEK_MODEL: raw.DS_MODEL ?? raw.DEEPSEEK_MODEL,
    GOOGLE_API_KEY: raw.GOOGLE_KEY ?? raw.GOOGLE_API_KEY,
    GEMINI_FLASH_MODEL: raw.GEMINI_FLASH ?? raw.GEMINI_FLASH_MODEL,
    GEMINI_PRO_MODEL: raw.GEMINI_PRO ?? raw.GEMINI_PRO_MODEL,
    CF_ACCOUNT_ID: raw.CF_ACCOUNT ?? raw.CF_ACCOUNT_ID,
    CF_API_TOKEN: raw.CF_TOKEN ?? raw.CF_API_TOKEN,
    CF_MODEL: raw.CF_MODEL,
    GITHUB_TOKEN: raw.GH_TOKEN ?? raw.GITHUB_TOKEN,
    GITHUB_MODELS_URL: raw.GH_MODELS_URL ?? raw.GITHUB_MODELS_URL,
    GITHUB_MODEL_PRIMARY: raw.GH_MODEL_PRIMARY ?? raw.GITHUB_MODEL_PRIMARY,
    GITHUB_MODEL_SECONDARY: raw.GH_MODEL_SECONDARY ?? raw.GITHUB_MODEL_SECONDARY,
    GITHUB_MODEL_TERTIARY: raw.GH_MODEL_TERTIARY ?? raw.GITHUB_MODEL_TERTIARY,
    AI_ROUTER_ENABLE_DEEPSEEK: raw.AI_ROUTER_ENABLE_DEEPSEEK,
    AI_ROUTER_ENABLE_GEMINI: raw.AI_ROUTER_ENABLE_GEMINI,
    AI_ROUTER_ENABLE_CLOUDFLARE: raw.AI_ROUTER_ENABLE_CLOUDFLARE,
    AI_ROUTER_ENABLE_GITHUB: raw.AI_ROUTER_ENABLE_GITHUB,
    AI_ROUTER_ENABLE_OPENAI: raw.AI_ROUTER_ENABLE_OPENAI,
    AI_ROUTER_LOG_VERBOSE: raw.AI_ROUTER_LOG_VERBOSE,
    AI_ROUTER_USE_GEMINI_PRO_FOR_COMPLEX: raw.AI_ROUTER_USE_GEMINI_PRO_FOR_COMPLEX,
    AI_ROUTER_DEEPSEEK_COOLDOWN_MS: raw.AI_ROUTER_DEEPSEEK_COOLDOWN_MS,
    AI_ROUTER_GEMINI_FLASH_DAILY_LIMIT: raw.AI_ROUTER_GEMINI_FLASH_DAILY_LIMIT,
    AI_ROUTER_GEMINI_PRO_DAILY_LIMIT: raw.AI_ROUTER_GEMINI_PRO_DAILY_LIMIT,
    AI_ROUTER_CLOUDFLARE_COOLDOWN_MS: raw.AI_ROUTER_CLOUDFLARE_COOLDOWN_MS,
    AI_ROUTER_GITHUB_COOLDOWN_MS: raw.AI_ROUTER_GITHUB_COOLDOWN_MS,
    AI_ROUTER_OPENAI_COOLDOWN_MS: raw.AI_ROUTER_OPENAI_COOLDOWN_MS
  };
}

export function resolveAiRouterEnvState(env: AppEnv): AiRouterEnvState {
  return {
    deepseek: buildProviderState("deepseek", env.AI_ROUTER_ENABLE_DEEPSEEK, [
      ["DEEPSEEK_API_KEY", env.DEEPSEEK_API_KEY]
    ]),
    gemini: buildProviderState("gemini", env.AI_ROUTER_ENABLE_GEMINI, [
      ["GOOGLE_API_KEY", env.GOOGLE_API_KEY]
    ]),
    cloudflare: buildProviderState("cloudflare", env.AI_ROUTER_ENABLE_CLOUDFLARE, [
      ["CF_ACCOUNT_ID", env.CF_ACCOUNT_ID],
      ["CF_API_TOKEN", env.CF_API_TOKEN]
    ]),
    github: buildProviderState("github", env.AI_ROUTER_ENABLE_GITHUB, [
      ["GITHUB_TOKEN", env.GITHUB_TOKEN]
    ]),
    openai: buildProviderState("openai", env.AI_ROUTER_ENABLE_OPENAI, [
      ["OPENAI_API_KEY", env.OPENAI_API_KEY]
    ])
  };
}

export function getEnabledAiRouterProviders(env: AppEnv): AiRouterProviderName[] {
  const state = resolveAiRouterEnvState(env);
  return AI_ROUTER_PROVIDER_NAMES.filter((provider) => state[provider].enabled);
}

function parseCompactConfig(cfg?: string): Partial<RuntimeTuning> {
  if (!cfg) {
    return {};
  }

  let json: unknown;

  try {
    json = JSON.parse(cfg);
  } catch (error) {
    throw new Error(`Invalid CFG JSON: ${error instanceof Error ? error.message : "failed to parse"}`);
  }

  const parsed = compactConfigSchema.parse(json);

  return {
    FEATURE_WEB_SEARCH: parsed.features?.webSearch,
    FEATURE_AUTOINTERJECT: parsed.features?.autoInterject,
    FEATURE_MEMORY_HYDE_ENABLED: parsed.features?.memoryHydeEnabled,
    FEATURE_EMOTIONAL_ADVICE_ANCHORS_ENABLED: parsed.features?.emotionalAdviceAnchorsEnabled,
    FEATURE_USER_PROFILES: parsed.features?.userProfiles,
    FEATURE_CONTEXT_ACTIONS: parsed.features?.contextActions,
    FEATURE_ROAST: parsed.features?.roast,
    FEATURE_CONTEXT_V2_ENABLED: parsed.features?.contextV2Enabled,
    FEATURE_CONTEXT_CONFIDENCE_ENABLED: parsed.features?.contextConfidenceEnabled,
    FEATURE_TOPIC_ENGINE_ENABLED: parsed.features?.topicEngineEnabled,
    FEATURE_AFFINITY_SIGNALS_ENABLED: parsed.features?.affinitySignalsEnabled,
    FEATURE_MOOD_ENGINE_ENABLED: parsed.features?.moodEngineEnabled,
    FEATURE_REPLY_QUEUE_ENABLED: parsed.features?.replyQueueEnabled,
    FEATURE_MEDIA_REACTIONS_ENABLED: parsed.features?.mediaReactionsEnabled,
    FEATURE_RUNTIME_CONFIG_CACHE_ENABLED: parsed.features?.runtimeConfigCacheEnabled,
    FEATURE_EMBEDDING_CACHE_ENABLED: parsed.features?.embeddingCacheEnabled,
    FEATURE_CHANNEL_AWARE_MODE: parsed.features?.channelAwareMode,
    FEATURE_MESSAGE_KIND_AWARE_MODE: parsed.features?.messageKindAwareMode,
    FEATURE_ANTI_SLOP_STRICT_MODE: parsed.features?.antiSlopStrictMode,
    FEATURE_PLAYFUL_MODE_ENABLED: parsed.features?.playfulModeEnabled,
    FEATURE_IRRITATED_MODE_ENABLED: parsed.features?.irritatedModeEnabled,
    FEATURE_IDEOLOGICAL_FLAVOUR_ENABLED: parsed.features?.ideologicalFlavourEnabled,
    FEATURE_ANALOGY_BAN_ENABLED: parsed.features?.analogyBanEnabled,
    FEATURE_SLANG_LAYER_ENABLED: parsed.features?.slangLayerEnabled,
    FEATURE_SELF_INTERJECTION_CONSTRAINTS_ENABLED: parsed.features?.selfInterjectionConstraintsEnabled,
    FEATURE_MEMORY_ALBUM_ENABLED: parsed.features?.memoryAlbumEnabled,
    FEATURE_INTERACTION_REQUESTS_ENABLED: parsed.features?.interactionRequestsEnabled,
    FEATURE_LINK_UNDERSTANDING_ENABLED: parsed.features?.linkUnderstandingEnabled,
    FEATURE_NATURAL_MESSAGE_SPLITTING_ENABLED: parsed.features?.naturalMessageSplittingEnabled,
    FEATURE_SELECTIVE_ENGAGEMENT_ENABLED: parsed.features?.selectiveEngagementEnabled,
    FEATURE_SELF_REFLECTION_LESSONS_ENABLED: parsed.features?.selfReflectionLessonsEnabled,
    LLM_MAX_CONTEXT_MESSAGES: parsed.llm?.contextMessages,
    LLM_MAX_TOOL_CALLS: parsed.llm?.toolCalls,
    LLM_REPLY_MAX_TOKENS: parsed.llm?.replyMaxTokens,
    OLLAMA_KEEP_ALIVE: parsed.llm?.keepAlive,
    OLLAMA_NUM_CTX: parsed.llm?.numCtx,
    OLLAMA_NUM_BATCH: parsed.llm?.numBatch,
    RUNTIME_CONFIG_CACHE_TTL_SEC: parsed.context?.runtimeConfigCacheTtlSec,
    EMBEDDING_CACHE_TTL_SEC: parsed.context?.embeddingCacheTtlSec,
    CONTEXT_V2_MAX_CHARS: parsed.context?.maxChars,
    TOPIC_TTL_MINUTES: parsed.context?.topicTtlMinutes,
    TOPIC_SIM_THRESHOLD: parsed.context?.topicSimilarityThreshold,
    REPLY_QUEUE_BUSY_TTL_SEC: parsed.context?.replyQueueBusyTtlSec,
    USER_PROFILE_MIN_MESSAGES: parsed.profiles?.minMessages,
    USER_PROFILE_REFRESH_MESSAGES: parsed.profiles?.refreshMessages,
    USER_PROFILE_REFRESH_HOURS: parsed.profiles?.refreshHours,
    SUMMARY_CHUNK_MESSAGE_COUNT: parsed.summary?.chunkMessages,
    SUMMARY_MIN_MESSAGES: parsed.summary?.minMessages,
    SEARCH_CACHE_TTL_SEC: parsed.search?.cacheTtlSec,
    SEARCH_MAX_REQUESTS_PER_RESPONSE: parsed.search?.maxRequests,
    SEARCH_MAX_PAGES_PER_RESPONSE: parsed.search?.maxPages,
    SEARCH_USER_COOLDOWN_SEC: parsed.search?.userCooldownSec,
    SEARCH_DOMAIN_ALLOWLIST: parsed.search?.allowlist,
    SEARCH_DOMAIN_DENYLIST: parsed.search?.denylist,
    AUTOINTERJECT_CHANNEL_ALLOWLIST: parsed.interject?.channels,
    AUTOINTERJECT_COOLDOWN_SEC: parsed.interject?.cooldownSec,
    AUTOINTERJECT_MAX_PER_HOUR: parsed.interject?.maxPerHour,
    AUTOINTERJECT_MIN_CONFIDENCE: parsed.interject?.minConfidence,
    MESSAGE_HISTORY_LIMIT: parsed.message?.historyLimit,
    MESSAGE_EMBED_MIN_CHARS: parsed.message?.embedMinChars,
    MESSAGE_EMBED_BATCH_SIZE: parsed.message?.embedBatchSize,
    DEFAULT_REPLY_MAX_CHARS: parsed.reply?.maxChars,
    DEFAULT_ROAST_LEVEL: parsed.reply?.roastLevel,
    DEFAULT_SARCASM_LEVEL: parsed.reply?.sarcasmLevel,
    DEFAULT_INTERJECT_TENDENCY: parsed.reply?.interjectTendency,
    NATURAL_SPLIT_CHANCE: parsed.chat?.naturalSplitChance,
    NATURAL_SPLIT_COOLDOWN_SEC: parsed.chat?.naturalSplitCooldownSec,
    SELECTIVE_ENGAGEMENT_MIN_SCORE: parsed.chat?.selectiveEngagementMinScore,
    MEDIA_AUTO_GLOBAL_COOLDOWN_SEC: parsed.media?.autoGlobalCooldownSec,
    MEDIA_AUTO_MIN_CONFIDENCE: parsed.media?.autoMinConfidence,
    MEDIA_AUTO_MIN_INTENSITY: parsed.media?.autoMinIntensity,
    DISCORD_REGISTER_LEGACY_COMMANDS: undefined,
    JOB_QUEUE_PREFIX: parsed.jobs?.prefix,
    JOB_CONCURRENCY_SUMMARIES: parsed.jobs?.summaries,
    JOB_CONCURRENCY_PROFILES: parsed.jobs?.profiles,
    JOB_CONCURRENCY_EMBEDDINGS: parsed.jobs?.embeddings
  };
}

function removeUndefined<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Partial<T>;
}

function formatUrlEnvError(key: string, value: unknown): string {
  const hint = canonicalEnvHints[key as keyof typeof canonicalEnvHints];

  if (value === undefined || value === null || value === "") {
    return hint
      ? `Missing required env ${key}. Set one of: ${hint.join(", ")}.`
      : `Missing required env ${key}.`;
  }

  const text = String(value).trim();

  if (text.startsWith("${{") && text.endsWith("}}")) {
    return `Invalid ${key}: Railway reference "${text}" was not resolved. Check the referenced service name and variable key.`;
  }

  if (text.includes("localhost") || text.includes("127.0.0.1") || text.includes("::1")) {
    return `Invalid ${key}: loopback address "${text}" is not usable in Railway production.`;
  }

  return `Invalid ${key}: expected a full URL, got "${text}".`;
}

export function loadEnv(raw: NodeJS.ProcessEnv = process.env): AppEnv {
  const normalizedRaw = raw === process.env ? applyEnvAliases(raw) : applyEnvAliases({ ...raw });
  const mappedCore = mapCoreAliases(normalizedRaw);
  const parsedCore = coreEnvSchema.safeParse(mappedCore);

  if (!parsedCore.success) {
    const urlIssue = parsedCore.error.issues.find((issue) => {
      if (typeof issue.path[0] !== "string") {
        return false;
      }

      if (issue.code === "invalid_string" && issue.validation === "url") {
        return true;
      }

      return issue.code === "invalid_type" && issue.expected === "string";
    });

    if (urlIssue) {
      const key = String(urlIssue.path[0]);
      throw new Error(formatUrlEnvError(key, mappedCore[key as keyof typeof mappedCore]));
    }

    throw parsedCore.error;
  }

  const core = parsedCore.data;
  const compactOverrides = parseCompactConfig(core.CFG);
  const legacyOverrides = legacyAdvancedSchema.parse(normalizedRaw);

  return {
    ...defaultRuntimeTuning,
    ...removeUndefined(compactOverrides),
    ...removeUndefined(legacyOverrides),
    ...core
  };
}

export function assertEnvForRole(env: AppEnv, role: AppRole) {
  if (role === "bot") {
    const required = [
      ["DISCORD_TOKEN", "BOT_TOKEN or DISCORD_TOKEN"],
      ["DISCORD_CLIENT_ID", "BOT_ID or DISCORD_CLIENT_ID"]
    ] as const;

    for (const [key, label] of required) {
      if (!env[key]) {
        throw new Error(`Missing required env for bot role: ${label}`);
      }
    }
  }

  if ((role === "bot" || role === "worker") && env.LLM_PROVIDER === "ollama" && !env.OLLAMA_BASE_URL) {
    console.warn("[config] OLLAMA_BASE_URL not set \u2014 LLM features will use fallback replies until configured via /bot-ai-url or env");
  }

  if ((role === "bot" || role === "worker") && env.LLM_PROVIDER === "openai" && !env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY — required when LLM_PROVIDER=openai. Set OAI_KEY or OPENAI_API_KEY.");
  }

  if ((role === "bot" || role === "worker") && env.LLM_PROVIDER === "router") {
    const state = resolveAiRouterEnvState(env);
    const enabledProviders = AI_ROUTER_PROVIDER_NAMES.filter((provider) => state[provider].enabled);

    for (const provider of AI_ROUTER_PROVIDER_NAMES) {
      const details = state[provider];
      if (details.enabledByFlag && !details.configured) {
        console.warn(`[config] AI router provider ${provider} disabled: missing ${details.missing.join(", ")}`);
      }
    }

    if (!env.OPENAI_API_KEY) {
      console.warn("[config] AI router embeddings disabled: missing OPENAI_API_KEY");
    }

    if (enabledProviders.length === 0) {
      console.warn("[config] AI router has no configured providers — bot will fall back to safe empty-reply handling until secrets are configured");
    }
  }
}

function buildProviderState(
  name: AiRouterProviderName,
  enabledByFlag: boolean,
  requirements: Array<[string, string | undefined]>
): AiRouterProviderEnvState {
  const missing = requirements
    .filter(([, value]) => !value?.trim())
    .map(([key]) => key);

  return {
    name,
    enabledByFlag,
    configured: missing.length === 0,
    enabled: enabledByFlag && missing.length === 0,
    missing
  };
}
