import type { AppPrismaClient, PersonaMode } from "@hori/shared";
import { parseCsv } from "@hori/shared";

import { defaultPersonaSettings } from "@hori/config";
import { AnalyticsQueryService, formatAnalyticsOverview } from "@hori/analytics";
import { MemoryAlbumService, ReflectionService, RelationshipService, RetrievalService, SummaryService } from "@hori/memory";
import type { MoodService } from "./mood-service";
import type { ReplyQueueService } from "./reply-queue-service";
import { FEATURE_KEY_MAP, type RuntimeConfigService } from "./runtime-config-service";

export class SlashAdminService {
  constructor(
    private readonly prisma: AppPrismaClient,
    private readonly analytics: AnalyticsQueryService,
    private readonly relationships: RelationshipService,
    private readonly retrieval: RetrievalService,
    private readonly summaries: SummaryService,
    private readonly runtimeConfig?: RuntimeConfigService,
    private readonly mood?: MoodService,
    private readonly replyQueue?: ReplyQueueService,
    private readonly memoryAlbum?: MemoryAlbumService,
    private readonly reflection?: ReflectionService
  ) {}

  async handleHelp() {
    return "Команды: /bot-album для своих сохранённых моментов. Админка: /bot-style, /bot-memory, /bot-relationship, /bot-feature, /bot-debug, /bot-profile, /bot-channel, /bot-summary, /bot-stats, /bot-topic, /bot-mood, /bot-queue, /bot-reflection, /bot-media. Владелец: /bot-lockdown.";
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
    const normalizedKey = key.trim().toLowerCase();

    if (!(normalizedKey in FEATURE_KEY_MAP)) {
      return `Неизвестный feature flag: ${normalizedKey}.`;
    }

    await this.prisma.featureFlag.upsert({
      where: {
        scope_scopeId_key: {
          scope: "guild",
          scopeId: guildId,
          key: normalizedKey
        }
      },
      update: {
        enabled,
        updatedAt: new Date()
      },
      create: {
        scope: "guild",
        scopeId: guildId,
        key: normalizedKey,
        enabled
      }
    });

    this.runtimeConfig?.invalidate(guildId);
    return `Фича ${normalizedKey}: ${enabled ? "on" : "off"}.`;
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

  async albumList(guildId: string, userId: string, limit = 8) {
    const entries = await this.memoryAlbum?.listMoments(guildId, userId, limit);

    if (!entries?.length) {
      return "В твоём альбоме пока пусто. Используй контекстное действие `Хори: запомнить момент` на сообщении.";
    }

    return entries
      .map((entry) => {
        const tags = entry.tags.length ? ` #${entry.tags.join(" #")}` : "";
        const note = entry.note ? `\n   заметка: ${entry.note}` : "";
        const excerpt = entry.content.length > 120 ? `${entry.content.slice(0, 117)}...` : entry.content;
        return `- ${entry.id}${tags}\n  "${excerpt}"${note}`;
      })
      .join("\n");
  }

  async albumRemove(guildId: string, userId: string, id: string) {
    const result = await this.memoryAlbum?.removeMoment(guildId, userId, id);

    if (!result?.count) {
      return "Не нашла такой момент в твоём альбоме.";
    }

    return "Убрала из альбома.";
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

    this.runtimeConfig?.invalidate(guildId, channelId);
    return `Настройки канала ${channelId} обновлены.`;
  }

  async topicStatus(guildId: string, channelId: string) {
    const topic = await this.prisma.topicSession.findFirst({
      where: {
        guildId,
        channelId,
        closedAt: null
      },
      orderBy: { lastActiveAt: "desc" }
    });

    if (!topic) {
      return "Активной темы нет.";
    }

    return `Тема: ${topic.title}\nConfidence: ${topic.confidence}\nОбновлена: ${topic.lastActiveAt.toISOString()}\n${topic.summaryShort}`;
  }

  async topicReset(guildId: string, channelId: string) {
    const result = await this.prisma.topicSession.updateMany({
      where: {
        guildId,
        channelId,
        closedAt: null
      },
      data: {
        closedAt: new Date(),
        closedReason: "manual"
      }
    });

    return `Закрыла активные темы: ${result.count}.`;
  }

  async moodStatus(guildId: string) {
    const mood = await this.mood?.status(guildId);

    if (!mood) {
      return "Mood сейчас neutral.";
    }

    return `Mood=${mood.mood}, intensity=${mood.intensity}, до ${mood.endsAt.toISOString()}.`;
  }

  async moodSet(guildId: string, mood: PersonaMode, minutes: number, reason?: string | null) {
    await this.mood?.setMood(guildId, mood, minutes, reason);
    return `Mood=${mood} на ${minutes} мин.`;
  }

  async moodClear(guildId: string) {
    const result = await this.mood?.clearMood(guildId);
    return `Mood сброшен: ${result?.count ?? 0}.`;
  }

  async queueStatus(guildId: string, channelId?: string | null) {
    const status = await this.replyQueue?.status(guildId, channelId);

    if (!status) {
      return "Reply queue недоступна.";
    }

    return `Queue: queued=${status.queued}, processing=${status.processing}, dropped=${status.dropped}.`;
  }

  async queueClear(guildId: string, channelId?: string | null) {
    const result = await this.replyQueue?.clear(guildId, channelId);
    return `Queue очищена: ${result?.count ?? 0}.`;
  }

  async mediaAdd(input: {
    mediaId: string;
    type: string;
    filePath: string;
    toneTags?: string | null;
    triggerTags?: string | null;
    allowedChannels?: string | null;
    allowedMoods?: string | null;
    nsfw?: boolean | null;
  }) {
    await this.prisma.mediaMetadata.upsert({
      where: { mediaId: input.mediaId },
      update: {
        type: input.type,
        filePath: input.filePath,
        toneTags: input.toneTags ? parseCsv(input.toneTags) : undefined,
        triggerTags: input.triggerTags ? parseCsv(input.triggerTags) : undefined,
        allowedChannels: input.allowedChannels ? parseCsv(input.allowedChannels) : undefined,
        allowedMoods: input.allowedMoods ? parseCsv(input.allowedMoods) : undefined,
        nsfw: input.nsfw ?? undefined,
        enabled: true
      },
      create: {
        mediaId: input.mediaId,
        type: input.type,
        filePath: input.filePath,
        toneTags: input.toneTags ? parseCsv(input.toneTags) : [],
        triggerTags: input.triggerTags ? parseCsv(input.triggerTags) : [],
        allowedChannels: input.allowedChannels ? parseCsv(input.allowedChannels) : [],
        allowedMoods: input.allowedMoods ? parseCsv(input.allowedMoods) : [],
        nsfw: input.nsfw ?? false
      }
    });

    return `Media ${input.mediaId} зарегистрирована.`;
  }

  async mediaList() {
    const entries = await this.prisma.mediaMetadata.findMany({
      orderBy: { createdAt: "desc" },
      take: 10
    });

    if (!entries.length) {
      return "Media registry пуст.";
    }

    return entries.map((entry) => `${entry.enabled ? "on" : "off"} ${entry.mediaId} (${entry.type}) -> ${entry.filePath}`).join("\n");
  }

  async mediaDisable(mediaId: string) {
    const result = await this.prisma.mediaMetadata.updateMany({
      where: { mediaId },
      data: { enabled: false }
    });

    if (!result.count) {
      return `Media ${mediaId} не нашла.`;
    }

    return `Media ${mediaId}: off.`;
  }

  async reflectionStatus(guildId: string) {
    const status = await this.reflection?.status(guildId);

    if (!status) {
      return "Reflection journal недоступен.";
    }

    return `Reflection: open=${status.open}, positive=${status.positive}, negative=${status.negative}.`;
  }

  async reflectionList(guildId: string, limit = 8) {
    const entries = await this.reflection?.listOpenLessons(guildId, limit);

    if (!entries?.length) {
      return "Открытых уроков пока нет.";
    }

    return entries
      .map((entry) => {
        const excerpt = entry.summary.length > 150 ? `${entry.summary.slice(0, 147)}...` : entry.summary;
        return `- ${entry.sentiment}/${entry.severity}: ${excerpt}`;
      })
      .join("\n");
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
