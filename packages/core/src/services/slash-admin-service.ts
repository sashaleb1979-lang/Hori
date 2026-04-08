import type { AppPrismaClient } from "@hori/shared";
import { parseCsv } from "@hori/shared";

import { defaultPersonaSettings } from "@hori/config";
import { AnalyticsQueryService, formatAnalyticsOverview } from "@hori/analytics";
import { RelationshipService, RetrievalService, SummaryService } from "@hori/memory";

export class SlashAdminService {
  constructor(
    private readonly prisma: AppPrismaClient,
    private readonly analytics: AnalyticsQueryService,
    private readonly relationships: RelationshipService,
    private readonly retrieval: RetrievalService,
    private readonly summaries: SummaryService
  ) {}

  async handleHelp() {
    return "Команды админки: /bot-style, /bot-memory, /bot-relationship, /bot-feature, /bot-debug, /bot-profile, /bot-channel, /bot-summary, /bot-stats.";
  }

  async updateStyle(
    guildId: string,
    input: {
      roughnessLevel?: number | null;
      sarcasmLevel?: number | null;
      roastLevel?: number | null;
      replyLength?: "short" | "medium" | "long" | null;
      preferredStyle?: string | null;
      forbiddenWords?: string | null;
      forbiddenTopics?: string | null;
      botName?: string | null;
    }
  ) {
    const guild = await this.prisma.guild.upsert({
      where: { id: guildId },
      update: {
        botName: input.botName ?? undefined,
        roughnessLevel: input.roughnessLevel ?? undefined,
        sarcasmLevel: input.sarcasmLevel ?? undefined,
        roastLevel: input.roastLevel ?? undefined,
        replyLength: input.replyLength ?? undefined,
        preferredStyle: input.preferredStyle ?? undefined,
        forbiddenWords: input.forbiddenWords ? parseCsv(input.forbiddenWords) : undefined,
        forbiddenTopics: input.forbiddenTopics ? parseCsv(input.forbiddenTopics) : undefined
      },
      create: {
        id: guildId,
        botName: input.botName ?? defaultPersonaSettings.botName,
        preferredLanguage: defaultPersonaSettings.preferredLanguage,
        roughnessLevel: input.roughnessLevel ?? defaultPersonaSettings.roughnessLevel,
        sarcasmLevel: input.sarcasmLevel ?? defaultPersonaSettings.sarcasmLevel,
        roastLevel: input.roastLevel ?? defaultPersonaSettings.roastLevel,
        interjectTendency: defaultPersonaSettings.interjectTendency,
        replyLength: input.replyLength ?? defaultPersonaSettings.replyLength,
        preferredStyle: input.preferredStyle ?? defaultPersonaSettings.preferredStyle,
        forbiddenWords: input.forbiddenWords ? parseCsv(input.forbiddenWords) : defaultPersonaSettings.forbiddenWords,
        forbiddenTopics: input.forbiddenTopics ? parseCsv(input.forbiddenTopics) : defaultPersonaSettings.forbiddenTopics
      }
    });

    return `Стиль обновлён. Имя=${guild.botName}, rough=${guild.roughnessLevel}, sarcasm=${guild.sarcasmLevel}, roast=${guild.roastLevel}, length=${guild.replyLength}.`;
  }

  async updateFeature(guildId: string, key: string, enabled: boolean) {
    await this.prisma.featureFlag.upsert({
      where: {
        scope_scopeId_key: {
          scope: "guild",
          scopeId: guildId,
          key
        }
      },
      update: {
        enabled,
        updatedAt: new Date()
      },
      create: {
        scope: "guild",
        scopeId: guildId,
        key,
        enabled
      }
    });

    return `Фича ${key}: ${enabled ? "on" : "off"}.`;
  }

  async updateRelationship(
    guildId: string,
    userId: string,
    updatedBy: string,
    input: {
      toneBias: string;
      roastLevel: number;
      praiseBias: number;
      interruptPriority: number;
      doNotMock: boolean;
      doNotInitiate: boolean;
      protectedTopics: string[];
    }
  ) {
    await this.relationships.upsertRelationship({
      guildId,
      userId,
      updatedBy,
      ...input
    });

    return `Relationship для ${userId} обновлён.`;
  }

  async remember(guildId: string, createdBy: string, key: string, value: string) {
    await this.retrieval.rememberServerFact({
      guildId,
      key,
      value,
      type: "note",
      createdBy,
      source: "slash"
    });

    return `Запомнила: ${key}.`;
  }

  async forget(guildId: string, key: string) {
    await this.retrieval.forgetServerFact(guildId, key);
    return `Удалила память по ключу ${key}.`;
  }

  async channelConfig(
    guildId: string,
    channelId: string,
    input: {
      allowBotReplies?: boolean | null;
      allowInterjections?: boolean | null;
      isMuted?: boolean | null;
      topicInterestTags?: string | null;
    }
  ) {
    await this.prisma.channelConfig.upsert({
      where: {
        guildId_channelId: { guildId, channelId }
      },
      update: {
        allowBotReplies: input.allowBotReplies ?? undefined,
        allowInterjections: input.allowInterjections ?? undefined,
        isMuted: input.isMuted ?? undefined,
        topicInterestTags: input.topicInterestTags ? parseCsv(input.topicInterestTags) : undefined
      },
      create: {
        guildId,
        channelId,
        allowBotReplies: input.allowBotReplies ?? true,
        allowInterjections: input.allowInterjections ?? false,
        isMuted: input.isMuted ?? false,
        topicInterestTags: input.topicInterestTags ? parseCsv(input.topicInterestTags) : []
      }
    });

    return `Настройки канала ${channelId} обновлены.`;
  }

  async debugTrace(messageId: string) {
    const trace = await this.prisma.botEventLog.findFirst({
      where: { messageId },
      orderBy: { createdAt: "desc" }
    });

    if (!trace) {
      return "Трассировку не нашла.";
    }

    return JSON.stringify(trace.debugTrace, null, 2);
  }

  async profile(guildId: string, userId: string) {
    const profile = await this.prisma.userProfile.findUnique({
      where: {
        guildId_userId: { guildId, userId }
      }
    });

    if (!profile) {
      return "Профиль пока не готов.";
    }

    return `${profile.summaryShort}\nТеги: ${profile.styleTags.join(", ")} | ${profile.topicTags.join(", ")}\nConfidence: ${profile.confidenceScore}`;
  }

  async summary(guildId: string, channelId: string) {
    const summaries = await this.summaries.getRecentSummaries(guildId, channelId, 2);

    if (!summaries.length) {
      return "Сводок пока нет.";
    }

    return summaries.map((entry) => `- ${entry.summaryShort}`).join("\n");
  }

  async stats(guildId: string) {
    const overview = await this.analytics.getOverview(guildId, "week");
    return formatAnalyticsOverview(overview);
  }
}
