import { buildFeatureFlags, defaultPersonaSettings, type AppEnv } from "@hori/config";
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

export interface EffectiveChannelPolicy {
  allowBotReplies: boolean;
  allowInterjections: boolean;
  isMuted: boolean;
  topicInterestTags: string[];
  responseLengthOverride?: string | null;
}

export interface EffectiveRoutingConfig {
  guildSettings: PersonaSettings;
  featureFlags: FeatureFlags;
  channelPolicy: EffectiveChannelPolicy;
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

    const [guildSettings, featureFlags, channelPolicy] = await Promise.all([
      this.getGuildSettings(guildId),
      this.getFeatureFlags(guildId),
      this.getChannelPolicy(guildId, channelId)
    ]);

    const value = {
      guildSettings,
      featureFlags,
      channelPolicy
    };

    if (featureFlags.runtimeConfigCacheEnabled) {
      this.routingCache.set(cacheKey, {
        expiresAt: Date.now() + this.env.RUNTIME_CONFIG_CACHE_TTL_SEC * 1000,
        value
      });
    }

    return value;
  }
}
