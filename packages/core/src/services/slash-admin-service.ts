import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { AppPrismaClient, PersonaMode } from "@hori/shared";
import { parseCsv } from "@hori/shared";

import { defaultPersonaSettings, type PowerProfileName } from "@hori/config";
import { AnalyticsQueryService, formatAnalyticsOverview } from "@hori/analytics";
import { MemoryAlbumService, ReflectionService, RelationshipService, RetrievalService, SummaryService } from "@hori/memory";
import type { MoodService } from "./mood-service";
import type { ReplyQueueService } from "./reply-queue-service";
import { FEATURE_KEY_MAP, type PowerProfileStatus, type RuntimeConfigService } from "./runtime-config-service";

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
    return "Команды: /bot-album для своих сохранённых моментов. Админка: /bot-style, /bot-memory, /bot-relationship, /bot-feature, /bot-debug, /bot-profile, /bot-channel, /bot-summary, /bot-stats, /bot-topic, /bot-mood, /bot-queue, /bot-reflection, /bot-media. Владелец: /bot-lockdown, /bot-power.";
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

  async powerStatus() {
    if (!this.runtimeConfig) {
      return "Power panel недоступна.";
    }

    return formatPowerProfileStatus(await this.runtimeConfig.getPowerProfileStatus());
  }

  async powerPanel() {
    if (!this.runtimeConfig) {
      return "Power panel недоступна.";
    }

    return `${formatPowerProfileStatus(await this.runtimeConfig.getPowerProfileStatus())}\n\nВыбери пресет кнопками ниже или через /bot-power apply.`;
  }

  async powerApply(profile: PowerProfileName, updatedBy?: string) {
    if (!this.runtimeConfig) {
      return "Power panel недоступна.";
    }

    const status = await this.runtimeConfig.setPowerProfile(profile, updatedBy);
    return `${formatPowerProfileStatus(status)}\n\nПресет применён.`;
  }

  async updateRelationship(
    guildId: string,
    userId: string,
    updatedBy: string,
    input: {
      toneBias?: string;
      roastLevel?: number;
      praiseBias?: number;
      interruptPriority?: number;
      doNotMock?: boolean;
      doNotInitiate?: boolean;
      protectedTopics?: string[];
      closeness?: number;
      trustLevel?: number;
      familiarity?: number;
      proactivityPreference?: number;
    }
  ) {
    const existing = await this.prisma.relationshipProfile.findUnique({
      where: { guildId_userId: { guildId, userId } }
    });
    const current = existing ? await this.relationships.getVector(guildId, userId) : null;

    await this.relationships.upsertRelationship({
      guildId,
      userId,
      updatedBy,
      toneBias: input.toneBias ?? current?.toneBias ?? "neutral",
      roastLevel: input.roastLevel ?? current?.roastLevel ?? 0,
      praiseBias: input.praiseBias ?? current?.praiseBias ?? 0,
      interruptPriority: input.interruptPriority ?? current?.interruptPriority ?? 0,
      doNotMock: input.doNotMock ?? current?.doNotMock ?? false,
      doNotInitiate: input.doNotInitiate ?? current?.doNotInitiate ?? false,
      protectedTopics: input.protectedTopics ?? current?.protectedTopics ?? [],
      closeness: input.closeness ?? current?.closeness ?? 0.5,
      trustLevel: input.trustLevel ?? current?.trustLevel ?? 0.5,
      familiarity: input.familiarity ?? current?.familiarity ?? 0.5,
      interactionCount: current?.interactionCount ?? 0,
      proactivityPreference: input.proactivityPreference ?? current?.proactivityPreference ?? 0.5,
      topicBoundaries: current?.topicBoundaries ?? {}
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

  async mediaSyncPack(catalogPath = "assets/memes/catalog.json") {
    const absolutePath = resolve(process.cwd(), catalogPath);

    let raw: string;
    try {
      raw = await readFile(absolutePath, "utf8");
    } catch {
      return `Не удалось прочитать файл: ${catalogPath}`;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return `Невалидный JSON в ${catalogPath}`;
    }

    const items = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>).items
        : undefined;

    if (!Array.isArray(items) || !items.length) {
      return "Каталог пуст или не содержит items.";
    }

    let synced = 0;
    let skipped = 0;

    for (const entry of items) {
      const mediaId = readTrimmedString(entry, "mediaId");
      const type = readTrimmedString(entry, "type");
      const filePath = readTrimmedString(entry, "filePath");

      if (!mediaId || !type || !filePath) {
        skipped += 1;
        continue;
      }

      await this.prisma.mediaMetadata.upsert({
        where: { mediaId },
        update: {
          type,
          filePath,
          triggerTags: readStringArray(entry, "triggerTags"),
          toneTags: readStringArray(entry, "toneTags"),
          emotionTags: readStringArray(entry, "emotionTags"),
          messageKindTags: readStringArray(entry, "messageKindTags"),
          allowedChannels: readStringArray(entry, "allowedChannels"),
          allowedMoods: readStringArray(entry, "allowedMoods"),
          nsfw: readBoolean(entry, "nsfw") ?? false,
          enabled: readBoolean(entry, "enabled") ?? true,
          autoUseEnabled: readBoolean(entry, "autoUseEnabled") ?? true,
          manualOnly: readBoolean(entry, "manualOnly") ?? false,
          weight: readNumber(entry, "weight") ?? 1,
          cooldownSec: readNumber(entry, "cooldownSec") ?? 600,
          minConfidence: readFloat(entry, "minConfidence") ?? 0.82,
          minIntensity: readFloat(entry, "minIntensity") ?? 0.62,
          metaJson: {
            catalogPath,
            description: readTrimmedString(entry, "description") ?? null
          }
        },
        create: {
          mediaId,
          type,
          filePath,
          triggerTags: readStringArray(entry, "triggerTags"),
          toneTags: readStringArray(entry, "toneTags"),
          emotionTags: readStringArray(entry, "emotionTags"),
          messageKindTags: readStringArray(entry, "messageKindTags"),
          allowedChannels: readStringArray(entry, "allowedChannels"),
          allowedMoods: readStringArray(entry, "allowedMoods"),
          nsfw: readBoolean(entry, "nsfw") ?? false,
          enabled: readBoolean(entry, "enabled") ?? true,
          autoUseEnabled: readBoolean(entry, "autoUseEnabled") ?? true,
          manualOnly: readBoolean(entry, "manualOnly") ?? false,
          weight: readNumber(entry, "weight") ?? 1,
          cooldownSec: readNumber(entry, "cooldownSec") ?? 600,
          minConfidence: readFloat(entry, "minConfidence") ?? 0.82,
          minIntensity: readFloat(entry, "minIntensity") ?? 0.62,
          metaJson: {
            catalogPath,
            description: readTrimmedString(entry, "description") ?? null
          }
        }
      });

      synced += 1;
    }

    return `Синхронизировала pack: ${synced} записей${skipped ? `, пропустила ${skipped}` : ""}.`;
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

  async relationshipDetails(guildId: string, userId: string) {
    const vector = await this.relationships.getVector(guildId, userId);

    return [
      `Relationship для ${userId}`,
      `toneBias=${vector.toneBias}, roast=${vector.roastLevel}, praise=${vector.praiseBias}, interrupt=${vector.interruptPriority}`,
      `doNotMock=${vector.doNotMock}, doNotInitiate=${vector.doNotInitiate}`,
      `closeness=${formatSignal(vector.closeness)}, trust=${formatSignal(vector.trustLevel)}, familiarity=${formatSignal(vector.familiarity)}, proactivity=${formatSignal(vector.proactivityPreference)}`,
      `interactionCount=${vector.interactionCount}`,
      vector.protectedTopics.length ? `protectedTopics: ${vector.protectedTopics.join(", ")}` : "protectedTopics: none"
    ].join("\n");
  }

  async personalMemory(guildId: string, userId: string, ownerView = false) {
    const [profile, vector, notes] = await Promise.all([
      this.prisma.userProfile.findUnique({
        where: { guildId_userId: { guildId, userId } }
      }),
      this.relationships.getVector(guildId, userId),
      this.prisma.userMemoryNote.findMany({
        where: {
          guildId,
          userId,
          active: true,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
        },
        orderBy: { createdAt: "desc" },
        take: ownerView ? 12 : 6
      })
    ]);

    const lines = [
      profile
        ? `Профиль: ${profile.summaryShort}\nТеги: ${profile.styleTags.join(", ") || "нет"} | ${profile.topicTags.join(", ") || "нет"}\nConfidence: ${profile.confidenceScore}`
        : "Профиль пока не готов.",
      `Отношение: closeness=${formatSignal(vector.closeness)}, trust=${formatSignal(vector.trustLevel)}, familiarity=${formatSignal(vector.familiarity)}, proactivity=${formatSignal(vector.proactivityPreference)}; tone=${vector.toneBias}`,
      notes.length
        ? `Память:\n${notes.map((note) => `- ${note.key}: ${note.value}`).join("\n")}`
        : "Память по человеку пока пустая."
    ];

    return lines.join("\n\n");
  }

  async channelMemoryStatus(guildId: string, channelId: string) {
    const [channelCount, eventCount, recentBuild] = await Promise.all([
      this.prisma.channelMemoryNote.count({ where: { guildId, channelId, active: true } }),
      this.prisma.eventMemory.count({
        where: {
          guildId,
          active: true,
          OR: [{ channelId }, { channelId: null }]
        }
      }),
      this.prisma.memoryBuildRun.findFirst({
        where: { guildId, OR: [{ channelId }, { channelId: null }] },
        orderBy: { createdAt: "desc" }
      })
    ]);

    return [
      `Channel memory: ${channelCount}`,
      `Event memory: ${eventCount}`,
      recentBuild
        ? `Последний memory-build: ${recentBuild.status} (${recentBuild.scope}/${recentBuild.depth}) ${recentBuild.finishedAt?.toISOString() ?? recentBuild.updatedAt.toISOString()}`
        : "Memory-build ещё не запускался."
    ].join("\n");
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

function formatSignal(value: number) {
  return value.toFixed(2);
}

function formatPowerProfileStatus(status: PowerProfileStatus) {
  return [
    `Power profile: ${status.activeProfile}`,
    `Источник: ${status.source}`,
    `Context messages: ${status.effective.llmMaxContextMessages}`,
    `Context chars: ${status.effective.contextMaxChars}`,
    `Reply max tokens: ${status.effective.llmReplyMaxTokens}`,
    `Reply max chars: ${status.effective.defaultReplyMaxChars}`,
    `Ollama keep_alive: ${status.effective.ollamaKeepAlive}`,
    `Ollama num_ctx: ${status.effective.ollamaNumCtx}`,
    `Ollama num_batch: ${status.effective.ollamaNumBatch}`,
    `Auto-media cooldown: ${status.effective.mediaAutoGlobalCooldownSec}s`,
    `Auto-media thresholds: confidence>=${status.effective.mediaAutoMinConfidence}, intensity>=${status.effective.mediaAutoMinIntensity}`,
    status.updatedBy ? `Updated by: ${status.updatedBy}` : null,
    status.updatedAt ? `Updated at: ${status.updatedAt.toISOString()}` : null
  ]
    .filter(Boolean)
    .join("\n");
}

function readTrimmedString(value: unknown, key: string) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const next = (value as Record<string, unknown>)[key];
  return typeof next === "string" && next.trim() ? next.trim() : undefined;
}

function readStringArray(value: unknown, key: string) {
  if (!value || typeof value !== "object") {
    return [];
  }

  const next = (value as Record<string, unknown>)[key];
  return Array.isArray(next) ? next.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()) : [];
}

function readBoolean(value: unknown, key: string) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const next = (value as Record<string, unknown>)[key];
  return typeof next === "boolean" ? next : undefined;
}

function readNumber(value: unknown, key: string) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const next = (value as Record<string, unknown>)[key];
  return typeof next === "number" && Number.isInteger(next) ? next : undefined;
}

function readFloat(value: unknown, key: string) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const next = (value as Record<string, unknown>)[key];
  return typeof next === "number" && Number.isFinite(next) ? next : undefined;
}
