import { buildFeatureFlags, defaultPersonaSettings, type AppEnv } from "@hori/config";
import type { AppPrismaClient, FeatureFlags, PersonaSettings } from "@hori/shared";

const FEATURE_KEY_MAP = {
  web_search: "webSearch",
  auto_interject: "autoInterject",
  user_profiles: "userProfiles",
  context_actions: "contextActions",
  roast: "roast"
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
  constructor(
    private readonly prisma: AppPrismaClient,
    private readonly env: AppEnv
  ) {}

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
    const [guildSettings, featureFlags, channelPolicy] = await Promise.all([
      this.getGuildSettings(guildId),
      this.getFeatureFlags(guildId),
      this.getChannelPolicy(guildId, channelId)
    ]);

    return {
      guildSettings,
      featureFlags,
      channelPolicy
    };
  }
}
