import { buildFeatureFlags, defaultPersonaSettings, POWER_PROFILE_PRESETS, type AppEnv, type PowerProfileName } from "@hori/config";
import {
  defaultModelRoutingPresetForEnv,
  isModelRoutingModelId,
  isModelRoutingPresetName,
  isModelRoutingSlot,
  MODEL_ROUTING_SETTING_KEY,
  parseStoredModelRouting,
  resolveModelRouting,
  sanitizeOverrides,
  serializeModelRouting,
  type ModelRoutingModelId,
  type ModelRoutingPresetName,
  type ModelRoutingSlot,
  type ResolvedModelRouting
} from "@hori/llm";
import type { AppPrismaClient, FeatureFlags, PersonaSettings } from "@hori/shared";

export const FEATURE_KEY_MAP = {
  web_search: "webSearch",
  auto_interject: "autoInterject",
  user_profiles: "userProfiles",
  context_actions: "contextActions",
  roast: "roast",
  context_v2_enabled: "contextV2Enabled",
  context_confidence_enabled: "contextConfidenceEnabled",
  topic_engine_enabled: "topicEngineEnabled",
  affinity_signals_enabled: "affinitySignalsEnabled",
  mood_engine_enabled: "moodEngineEnabled",
  reply_queue_enabled: "replyQueueEnabled",
  media_reactions_enabled: "mediaReactionsEnabled",
  runtime_config_cache_enabled: "runtimeConfigCacheEnabled",
  embedding_cache_enabled: "embeddingCacheEnabled",
  channel_aware_mode: "channelAwareMode",
  message_kind_aware_mode: "messageKindAwareMode",
  anti_slop_strict_mode: "antiSlopStrictMode",
  playful_mode_enabled: "playfulModeEnabled",
  irritated_mode_enabled: "irritatedModeEnabled",
  ideological_flavour_enabled: "ideologicalFlavourEnabled",
  analogy_ban_enabled: "analogyBanEnabled",
  slang_layer_enabled: "slangLayerEnabled",
  self_interjection_constraints_enabled: "selfInterjectionConstraintsEnabled",
  memory_album_enabled: "memoryAlbumEnabled",
  interaction_requests_enabled: "interactionRequestsEnabled",
  link_understanding_enabled: "linkUnderstandingEnabled",
  natural_message_splitting_enabled: "naturalMessageSplittingEnabled",
  selective_engagement_enabled: "selectiveEngagementEnabled",
  self_reflection_lessons_enabled: "selfReflectionLessonsEnabled"
} as const satisfies Record<string, keyof FeatureFlags>;

export const POWER_PROFILE_SETTING_KEY = "power.profile";

const RUNTIME_OVERRIDE_DEFINITIONS: Record<string, { field: keyof Omit<EffectiveRuntimeSettings, "powerProfile" | "modelRouting">; parse: (value: string) => string | number | undefined }> = {
  "runtime.llm.max_context_messages": { field: "llmMaxContextMessages", parse: parsePositiveInt },
  "runtime.context.max_chars": { field: "contextMaxChars", parse: parsePositiveInt },
  "runtime.llm.reply_max_tokens": { field: "llmReplyMaxTokens", parse: parsePositiveInt },
  "runtime.reply.max_chars": { field: "defaultReplyMaxChars", parse: parsePositiveInt },
  "runtime.ollama.keep_alive": { field: "ollamaKeepAlive", parse: parseStringValue },
  "runtime.ollama.num_ctx": { field: "ollamaNumCtx", parse: parsePositiveInt },
  "runtime.ollama.num_batch": { field: "ollamaNumBatch", parse: parsePositiveInt },
  "runtime.media.auto_global_cooldown_sec": { field: "mediaAutoGlobalCooldownSec", parse: parseNonNegativeInt },
  "runtime.media.auto_min_confidence": { field: "mediaAutoMinConfidence", parse: parseUnitFloat },
  "runtime.media.auto_min_intensity": { field: "mediaAutoMinIntensity", parse: parseUnitFloat }
};

export interface EffectiveChannelPolicy {
  allowBotReplies: boolean;
  allowInterjections: boolean;
  isMuted: boolean;
  topicInterestTags: string[];
  responseLengthOverride?: string | null;
}

export interface EffectiveRuntimeSettings {
  powerProfile: PowerProfileName;
  modelRouting: ResolvedModelRouting;
  llmMaxContextMessages: number;
  contextMaxChars: number;
  llmReplyMaxTokens: number;
  defaultReplyMaxChars: number;
  ollamaKeepAlive: string;
  ollamaNumCtx: number;
  ollamaNumBatch: number;
  mediaAutoGlobalCooldownSec: number;
  mediaAutoMinConfidence: number;
  mediaAutoMinIntensity: number;
}

export interface PowerProfileStatus {
  activeProfile: PowerProfileName;
  effective: EffectiveRuntimeSettings;
  source: "default" | "runtime_setting";
  updatedBy?: string | null;
  updatedAt?: Date | null;
}

export type ModelRoutingStatus = ResolvedModelRouting & {
  updatedBy?: string | null;
  updatedAt?: Date | null;
};

export interface EffectiveRoutingConfig {
  guildSettings: PersonaSettings;
  featureFlags: FeatureFlags;
  channelPolicy: EffectiveChannelPolicy;
  runtimeSettings: EffectiveRuntimeSettings;
}

export class RuntimeConfigService {
  private readonly routingCache = new Map<string, { expiresAt: number; value: EffectiveRoutingConfig }>();

  constructor(
    private readonly prisma: AppPrismaClient,
    private readonly env: AppEnv
  ) {}

  invalidate(guildId?: string, channelId?: string) {
    if (!guildId) {
      this.routingCache.clear();
      return;
    }

    if (channelId) {
      this.routingCache.delete(this.cacheKey(guildId, channelId));
      return;
    }

    for (const key of this.routingCache.keys()) {
      if (key.startsWith(`${guildId}:`)) {
        this.routingCache.delete(key);
      }
    }
  }

  private cacheKey(guildId: string, channelId?: string) {
    return `${guildId}:${channelId ?? "*"}`;
  }

  async getFeatureFlags(guildId?: string): Promise<FeatureFlags> {
    const defaults = buildFeatureFlags(this.env);
    const resolved: FeatureFlags = { ...defaults };

    const globalFlags = await this.prisma.featureFlag.findMany({
      where: {
        scope: "global",
        scopeId: "global"
      }
    });

    for (const record of globalFlags) {
      const mappedKey = FEATURE_KEY_MAP[record.key as keyof typeof FEATURE_KEY_MAP];

      if (mappedKey) {
        resolved[mappedKey] = record.enabled;
      }
    }

    if (!guildId) {
      return resolved;
    }

    const guildFlags = await this.prisma.featureFlag.findMany({
      where: {
        scope: "guild",
        scopeId: guildId
      }
    });

    for (const record of guildFlags) {
      const mappedKey = FEATURE_KEY_MAP[record.key as keyof typeof FEATURE_KEY_MAP];

      if (mappedKey) {
        resolved[mappedKey] = record.enabled;
      }
    }

    return resolved;
  }

  async getRuntimeSettings(): Promise<EffectiveRuntimeSettings> {
    return (await this.resolveRuntimeSettings()).effective;
  }

  async getPowerProfileStatus(): Promise<PowerProfileStatus> {
    const resolved = await this.resolveRuntimeSettings();

    return {
      activeProfile: resolved.effective.powerProfile,
      effective: resolved.effective,
      source: resolved.source,
      updatedBy: resolved.updatedBy,
      updatedAt: resolved.updatedAt
    };
  }

  async setPowerProfile(profile: PowerProfileName, updatedBy?: string) {
    if (!isPowerProfileName(profile)) {
      throw new Error(`Unsupported power profile: ${profile}`);
    }

    await this.prisma.runtimeSetting.upsert({
      where: { key: POWER_PROFILE_SETTING_KEY },
      update: {
        value: profile,
        updatedBy: updatedBy ?? null,
        updatedAt: new Date()
      },
      create: {
        key: POWER_PROFILE_SETTING_KEY,
        value: profile,
        updatedBy: updatedBy ?? null
      }
    });

    this.invalidate();
    return this.getPowerProfileStatus();
  }

  async getModelRoutingStatus(): Promise<ModelRoutingStatus> {
    const row = await this.getRuntimeSettingRow(MODEL_ROUTING_SETTING_KEY);
    const routing = resolveModelRouting(this.env, row?.value);

    return {
      ...routing,
      updatedBy: row?.updatedBy,
      updatedAt: row?.updatedAt
    };
  }

  async setModelPreset(preset: ModelRoutingPresetName, updatedBy?: string) {
    if (!isModelRoutingPresetName(preset)) {
      throw new Error(`Unsupported model preset: ${preset}`);
    }

    await this.writeModelRouting(serializeModelRouting(preset), updatedBy);
    return this.getModelRoutingStatus();
  }

  async setModelSlot(slot: ModelRoutingSlot, model: ModelRoutingModelId, updatedBy?: string) {
    if (!isModelRoutingSlot(slot)) {
      throw new Error(`Unsupported model slot: ${slot}`);
    }

    if (!isModelRoutingModelId(model)) {
      throw new Error(`Unsupported model id: ${model}`);
    }

    const stored = await this.getStoredModelRoutingValue();
    const preset = stored?.preset ?? defaultModelRoutingPresetForEnv(this.env);
    const overrides = {
      ...(stored?.overrides ?? {}),
      [slot]: model
    };

    await this.writeModelRouting(serializeModelRouting(preset, overrides), updatedBy);
    return this.getModelRoutingStatus();
  }

  async resetModelSlot(slot: ModelRoutingSlot, updatedBy?: string) {
    if (!isModelRoutingSlot(slot)) {
      throw new Error(`Unsupported model slot: ${slot}`);
    }

    const stored = await this.getStoredModelRoutingValue();
    const preset = stored?.preset ?? defaultModelRoutingPresetForEnv(this.env);
    const overrides = { ...(stored?.overrides ?? {}) };
    delete overrides[slot];

    await this.writeModelRouting(serializeModelRouting(preset, overrides), updatedBy);
    return this.getModelRoutingStatus();
  }

  async resetModelRouting(updatedBy?: string) {
    const stored = await this.getStoredModelRoutingValue();
    const preset = stored?.preset ?? defaultModelRoutingPresetForEnv(this.env);

    await this.writeModelRouting(serializeModelRouting(preset), updatedBy);
    return this.getModelRoutingStatus();
  }

  async getGuildSettings(guildId: string): Promise<PersonaSettings> {
    const guild = await this.prisma.guild.findUnique({
      where: { id: guildId }
    });

    return {
      botName: guild?.botName ?? this.env.BOT_NAME ?? defaultPersonaSettings.botName,
      preferredLanguage: guild?.preferredLanguage ?? this.env.BOT_DEFAULT_LANGUAGE,
      roughnessLevel: guild?.roughnessLevel ?? defaultPersonaSettings.roughnessLevel,
      sarcasmLevel: guild?.sarcasmLevel ?? this.env.DEFAULT_SARCASM_LEVEL,
      roastLevel: guild?.roastLevel ?? this.env.DEFAULT_ROAST_LEVEL,
      interjectTendency: guild?.interjectTendency ?? this.env.DEFAULT_INTERJECT_TENDENCY,
      replyLength: (guild?.replyLength as PersonaSettings["replyLength"] | null) ?? defaultPersonaSettings.replyLength,
      preferredStyle: guild?.preferredStyle ?? defaultPersonaSettings.preferredStyle,
      forbiddenWords: guild?.forbiddenWords ?? [],
      forbiddenTopics: guild?.forbiddenTopics ?? []
    };
  }

  async getChannelPolicy(guildId: string, channelId: string): Promise<EffectiveChannelPolicy> {
    const config = await this.prisma.channelConfig.findUnique({
      where: {
        guildId_channelId: {
          guildId,
          channelId
        }
      }
    });

    return {
      allowBotReplies: config?.allowBotReplies ?? true,
      allowInterjections: config?.allowInterjections ?? false,
      isMuted: config?.isMuted ?? false,
      topicInterestTags: config?.topicInterestTags ?? [],
      responseLengthOverride: config?.responseLengthOverride ?? null
    };
  }

  async getRoutingConfig(guildId: string, channelId: string): Promise<EffectiveRoutingConfig> {
    const cacheKey = this.cacheKey(guildId, channelId);
    const cached = this.routingCache.get(cacheKey);

    if (this.env.FEATURE_RUNTIME_CONFIG_CACHE_ENABLED && cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const [guildSettings, featureFlags, channelPolicy, runtimeSettings] = await Promise.all([
      this.getGuildSettings(guildId),
      this.getFeatureFlags(guildId),
      this.getChannelPolicy(guildId, channelId),
      this.getRuntimeSettings()
    ]);

    const value = {
      guildSettings,
      featureFlags,
      channelPolicy,
      runtimeSettings
    };

    if (featureFlags.runtimeConfigCacheEnabled) {
      this.routingCache.set(cacheKey, {
        expiresAt: Date.now() + this.env.RUNTIME_CONFIG_CACHE_TTL_SEC * 1000,
        value
      });
    }

    return value;
  }

  private async resolveRuntimeSettings(): Promise<{
    effective: EffectiveRuntimeSettings;
    source: "default" | "runtime_setting";
    updatedBy?: string | null;
    updatedAt?: Date | null;
  }> {
    const rows = await this.prisma.runtimeSetting.findMany({
      where: {
        key: {
          in: [POWER_PROFILE_SETTING_KEY, MODEL_ROUTING_SETTING_KEY, ...Object.keys(RUNTIME_OVERRIDE_DEFINITIONS)]
        }
      }
    });

    const profileRow = rows.find((row) => row.key === POWER_PROFILE_SETTING_KEY);
    const modelRoutingRow = rows.find((row) => row.key === MODEL_ROUTING_SETTING_KEY);
    const activeProfile = profileRow && isPowerProfileName(profileRow.value) ? profileRow.value : "balanced";
    const effective = applyPowerProfilePreset(this.buildBaseRuntimeSettings(), activeProfile);
    effective.modelRouting = resolveModelRouting(this.env, modelRoutingRow?.value);

    for (const row of rows) {
      const definition = RUNTIME_OVERRIDE_DEFINITIONS[row.key];

      if (!definition) {
        continue;
      }

      const parsedValue = definition.parse(row.value);

      if (parsedValue !== undefined) {
        applyRuntimeOverride(effective, definition.field, parsedValue);
      }
    }

    return {
      effective,
      source: profileRow ? "runtime_setting" : "default",
      updatedBy: profileRow?.updatedBy,
      updatedAt: profileRow?.updatedAt
    };
  }

  private buildBaseRuntimeSettings(): EffectiveRuntimeSettings {
    return {
      powerProfile: "balanced",
      modelRouting: resolveModelRouting(this.env),
      llmMaxContextMessages: this.env.LLM_MAX_CONTEXT_MESSAGES,
      contextMaxChars: this.env.CONTEXT_V2_MAX_CHARS,
      llmReplyMaxTokens: this.env.LLM_REPLY_MAX_TOKENS,
      defaultReplyMaxChars: this.env.DEFAULT_REPLY_MAX_CHARS,
      ollamaKeepAlive: this.env.OLLAMA_KEEP_ALIVE,
      ollamaNumCtx: this.env.OLLAMA_NUM_CTX,
      ollamaNumBatch: this.env.OLLAMA_NUM_BATCH,
      mediaAutoGlobalCooldownSec: this.env.MEDIA_AUTO_GLOBAL_COOLDOWN_SEC,
      mediaAutoMinConfidence: this.env.MEDIA_AUTO_MIN_CONFIDENCE,
      mediaAutoMinIntensity: this.env.MEDIA_AUTO_MIN_INTENSITY
    };
  }

  private async getRuntimeSettingRow(key: string) {
    const rows = await this.prisma.runtimeSetting.findMany({
      where: {
        key: {
          in: [key]
        }
      }
    });

    return rows[0] ?? null;
  }

  private async getStoredModelRoutingValue() {
    const row = await this.getRuntimeSettingRow(MODEL_ROUTING_SETTING_KEY);
    const parsed = parseStoredModelRouting(row?.value);

    return parsed.value
      ? {
          preset: parsed.value.preset,
          overrides: sanitizeOverrides(parsed.value.overrides)
        }
      : null;
  }

  private async writeModelRouting(value: string, updatedBy?: string) {
    await this.prisma.runtimeSetting.upsert({
      where: { key: MODEL_ROUTING_SETTING_KEY },
      update: {
        value,
        updatedBy: updatedBy ?? null,
        updatedAt: new Date()
      },
      create: {
        key: MODEL_ROUTING_SETTING_KEY,
        value,
        updatedBy: updatedBy ?? null
      }
    });

    this.invalidate();
  }
}

function applyPowerProfilePreset(base: EffectiveRuntimeSettings, profile: PowerProfileName): EffectiveRuntimeSettings {
  const preset = POWER_PROFILE_PRESETS[profile];

  return {
    ...base,
    powerProfile: profile,
    llmMaxContextMessages: preset.llmMaxContextMessages,
    contextMaxChars: preset.contextMaxChars,
    llmReplyMaxTokens: preset.llmReplyMaxTokens,
    defaultReplyMaxChars: preset.defaultReplyMaxChars,
    ollamaKeepAlive: preset.ollamaKeepAlive,
    ollamaNumCtx: preset.ollamaNumCtx,
    ollamaNumBatch: preset.ollamaNumBatch
  };
}

function isPowerProfileName(value: string): value is PowerProfileName {
  return value in POWER_PROFILE_PRESETS;
}

function parseStringValue(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function parsePositiveInt(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function parseNonNegativeInt(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function parseUnitFloat(value: string) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return Math.max(0, Math.min(1, parsed));
}

function applyRuntimeOverride(
  target: EffectiveRuntimeSettings,
  field: keyof Omit<EffectiveRuntimeSettings, "powerProfile" | "modelRouting">,
  value: string | number
) {
  switch (field) {
    case "ollamaKeepAlive":
      target.ollamaKeepAlive = String(value);
      return;
    case "llmMaxContextMessages":
      target.llmMaxContextMessages = Number(value);
      return;
    case "contextMaxChars":
      target.contextMaxChars = Number(value);
      return;
    case "llmReplyMaxTokens":
      target.llmReplyMaxTokens = Number(value);
      return;
    case "defaultReplyMaxChars":
      target.defaultReplyMaxChars = Number(value);
      return;
    case "ollamaNumCtx":
      target.ollamaNumCtx = Number(value);
      return;
    case "ollamaNumBatch":
      target.ollamaNumBatch = Number(value);
      return;
    case "mediaAutoGlobalCooldownSec":
      target.mediaAutoGlobalCooldownSec = Number(value);
      return;
    case "mediaAutoMinConfidence":
      target.mediaAutoMinConfidence = Number(value);
      return;
    case "mediaAutoMinIntensity":
      target.mediaAutoMinIntensity = Number(value);
      return;
  }
}
