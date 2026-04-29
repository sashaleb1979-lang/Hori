import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { AppPrismaClient, MemoryMode, PersonaMode, RelationshipGrowthMode, RelationshipState, StylePresetMode } from "@hori/shared";
import { parseCsv, toVectorLiteral } from "@hori/shared";

import { defaultPersonaSettings, type PowerProfileName } from "@hori/config";
import { AnalyticsQueryService, formatAnalyticsOverview } from "@hori/analytics";
import { isAiRouterClient, type EmbeddingAdapter, type LlmClient } from "@hori/llm";
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
    private readonly reflection?: ReflectionService,
    private readonly embeddingAdapter?: EmbeddingAdapter,
    private readonly llmClient?: LlmClient
  ) {}

  async handleHelp() {
    return [
      "Owner master panel: `/hori panel`.",
      "Частые ветки: `/hori profile`, `/hori search`, `/hori memory`, `/hori channel`, `/hori mood`, `/hori queue`, `/hori album`.",
      "Owner: `/hori state`, `/hori ai-status`, `/hori relationship`, `/hori power`, `/hori lockdown`, `/hori ai-url`, `/hori import`.",
      "Owner: `/hori state`, `/hori ai-status`, `/hori relationship`, `/hori runtime`, `/hori aggression`, `/hori power`, `/hori lockdown`, `/hori ai-url`, `/hori import`.",
      "Admin: `/hori memory-cards` для просмотра и удаления user memory cards.",
      "Legacy `/bot-*` команды скрыты из регистрации по умолчанию; их можно вернуть флагом `DISCORD_REGISTER_LEGACY_COMMANDS=true`."
    ].join("\n");
  }

  async updateStyle(
    guildId: string,
    input: {
      roughnessLevel?: number | null;
      sarcasmLevel?: number | null;
      roastLevel?: number | null;
      preferredLanguage?: string | null;
      interjectTendency?: number | null;
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
        botName: resettableString(input.botName, defaultPersonaSettings.botName),
        preferredLanguage: resettableString(input.preferredLanguage, defaultPersonaSettings.preferredLanguage),
        roughnessLevel: input.roughnessLevel ?? undefined,
        sarcasmLevel: input.sarcasmLevel ?? undefined,
        roastLevel: input.roastLevel ?? undefined,
        interjectTendency: input.interjectTendency ?? undefined,
        replyLength: input.replyLength ?? undefined,
        preferredStyle: resettableString(input.preferredStyle, defaultPersonaSettings.preferredStyle),
        forbiddenWords: resettableStringArray(input.forbiddenWords),
        forbiddenTopics: resettableStringArray(input.forbiddenTopics)
      },
      create: {
        id: guildId,
        botName: input.botName ?? defaultPersonaSettings.botName,
        preferredLanguage: input.preferredLanguage ?? defaultPersonaSettings.preferredLanguage,
        roughnessLevel: input.roughnessLevel ?? defaultPersonaSettings.roughnessLevel,
        sarcasmLevel: input.sarcasmLevel ?? defaultPersonaSettings.sarcasmLevel,
        roastLevel: input.roastLevel ?? defaultPersonaSettings.roastLevel,
        interjectTendency: input.interjectTendency ?? defaultPersonaSettings.interjectTendency,
        replyLength: input.replyLength ?? defaultPersonaSettings.replyLength,
        preferredStyle: input.preferredStyle ?? defaultPersonaSettings.preferredStyle,
        forbiddenWords: input.forbiddenWords ? parseCsv(input.forbiddenWords) : defaultPersonaSettings.forbiddenWords,
        forbiddenTopics: input.forbiddenTopics ? parseCsv(input.forbiddenTopics) : defaultPersonaSettings.forbiddenTopics
      }
    });

    return [
      "Стиль обновлён.",
      `Имя=${guild.botName}, lang=${guild.preferredLanguage}, rough=${guild.roughnessLevel}, sarcasm=${guild.sarcasmLevel}, roast=${guild.roastLevel}`,
      `interject=${guild.interjectTendency}, length=${guild.replyLength}`,
      `style=${guild.preferredStyle}`,
      `forbiddenWords=${guild.forbiddenWords.join(", ") || "none"}`,
      `forbiddenTopics=${guild.forbiddenTopics.join(", ") || "none"}`
    ].join("\n");
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

    return `${formatPowerProfileStatus(await this.runtimeConfig.getPowerProfileStatus())}\n\nВыбери пресет кнопками ниже или через /hori power action:apply.`;
  }

  async aiStatus() {
    if (!this.llmClient || !isAiRouterClient(this.llmClient)) {
      return "AI router status недоступен в текущем LLM режиме.";
    }

    const snapshot = await this.llmClient.getStatusSnapshot();
    const embeddingDimensionsStatus = this.runtimeConfig
      ? await this.runtimeConfig.getOpenAIEmbeddingDimensionsStatus()
      : undefined;
    const embeddingDimensions = embeddingDimensionsStatus?.source !== "unsupported"
      ? embeddingDimensionsStatus?.value ?? snapshot.embeddings.dimensions
      : snapshot.embeddings.dimensions;
    const enabled = snapshot.enabledProviders
      .map((entry) => `${entry.provider}:${entry.enabled ? "on" : entry.enabledByFlag ? `off(missing:${entry.missing.join(",") || "none"})` : "off(flag)"}`)
      .join(" | ");
    const cooldowns = snapshot.cooldowns.length
      ? snapshot.cooldowns.slice(0, 4).map((entry) => `${entry.provider}/${entry.model}→${compactIso(entry.cooldownUntil)}`).join(" | ")
      : "none";
    const recent = snapshot.recentRoutes.length
      ? snapshot.recentRoutes
        .slice(-8)
        .map((entry) => `${compactIso(entry.timestamp)} ${entry.success ? "ok" : "fail"} ${entry.provider}/${entry.model} d${entry.fallbackDepth}${entry.errorClass ? ` ${entry.errorClass}` : ""}`)
        .join("\n")
      : "none";
    const fallbackCounts = Object.entries(snapshot.fallbackCounts)
      .map(([provider, count]) => `${provider}=${count}`)
      .join(" | ") || "none";

    return [
      "AI router status",
      `Order: ${snapshot.activeOrder.join(" -> ")}`,
      `Providers: ${enabled}`,
      `Embeddings: ${snapshot.embeddings.provider}:${snapshot.embeddings.available ? "on" : `off(missing:${snapshot.embeddings.missing.join(",") || "none"})`} ${snapshot.embeddings.model} dim=${embeddingDimensions ?? "?"}`,
      `Cooldowns: ${cooldowns}`,
      `Gemini: flash ${snapshot.geminiUsage.flash.used}/${snapshot.geminiUsage.flash.limit ?? "?"}, pro ${snapshot.geminiUsage.pro.used}/${snapshot.geminiUsage.pro.limit ?? "?"}`,
      `Fallbacks: ${fallbackCounts}`,
      `Recent routes:\n${recent}`
    ].join("\n\n");
  }

  async powerApply(profile: PowerProfileName, updatedBy?: string) {
    if (!this.runtimeConfig) {
      return "Power panel недоступна.";
    }

    const status = await this.runtimeConfig.setPowerProfile(profile, updatedBy);
    return `${formatPowerProfileStatus(status)}\n\nПресет применён.`;
  }

  async runtimeModesStatus() {
    if (!this.runtimeConfig) {
      return "Runtime settings недоступны.";
    }

    const runtime = await this.runtimeConfig.getRuntimeSettings();
    return [
      `memoryMode=${runtime.memoryMode}`,
      `relationshipGrowthMode=${runtime.relationshipGrowthMode}`,
      `stylePresetMode=${runtime.stylePresetMode}`,
      `maxTimeoutMinutes=${runtime.maxTimeoutMinutes}`
    ].join("\n");
  }

  async setMemoryMode(mode: MemoryMode, updatedBy?: string) {
    if (!this.runtimeConfig) {
      return "Runtime settings недоступны.";
    }

    const runtime = await this.runtimeConfig.setRuntimeOverride("runtime.memory.mode", mode, updatedBy);
    return `memoryMode=${runtime.memoryMode}`;
  }

  async setRelationshipGrowthMode(mode: RelationshipGrowthMode, updatedBy?: string) {
    if (!this.runtimeConfig) {
      return "Runtime settings недоступны.";
    }

    const runtime = await this.runtimeConfig.setRuntimeOverride("runtime.relationship.growth_mode", mode, updatedBy);
    return `relationshipGrowthMode=${runtime.relationshipGrowthMode}`;
  }

  async setStylePresetMode(mode: StylePresetMode, updatedBy?: string) {
    if (!this.runtimeConfig) {
      return "Runtime settings недоступны.";
    }

    const runtime = await this.runtimeConfig.setRuntimeOverride("runtime.style.preset_mode", mode, updatedBy);
    return `stylePresetMode=${runtime.stylePresetMode}`;
  }

  async setMaxTimeoutMinutes(minutes: number, updatedBy?: string) {
    if (!this.runtimeConfig) {
      return "Runtime settings недоступны.";
    }

    const runtime = await this.runtimeConfig.setRuntimeOverride("runtime.moderation.max_timeout_minutes", String(minutes), updatedBy);
    return `maxTimeoutMinutes=${runtime.maxTimeoutMinutes}`;
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
      relationshipState?: RelationshipState;
      relationshipScore?: number;
      closeness?: number;
      trustLevel?: number;
      familiarity?: number;
      proactivityPreference?: number;
      /** V6 Item 20: ручная установка постоянной характеристики. `null` = очистить. */
      characteristic?: string | null;
      /** V6 Item 20: ручная установка last-change. `null` = очистить. */
      lastChange?: string | null;
    }
  ) {
    const existing = await this.prisma.relationshipProfile.findUnique({
      where: { guildId_userId: { guildId, userId } }
    });
    const current = existing ? await this.relationships.getVector(guildId, userId) : null;
    const nextCharacteristic = input.characteristic === undefined
      ? current?.characteristic ?? null
      : (input.characteristic && input.characteristic.trim().length > 0 ? input.characteristic.trim() : null);
    const nextLastChange = input.lastChange === undefined
      ? current?.lastChange ?? null
      : (input.lastChange && input.lastChange.trim().length > 0 ? input.lastChange.trim() : null);
    const characteristicChanged = nextCharacteristic !== (current?.characteristic ?? null);

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
      relationshipState: input.relationshipState ?? current?.relationshipState ?? "base",
      relationshipScore: input.relationshipScore ?? current?.relationshipScore ?? 0,
      positiveMarks: current?.positiveMarks ?? 0,
      escalationStage: current?.escalationStage ?? 0,
      escalationUpdatedAt: current?.escalationUpdatedAt ?? null,
      coldUntil: current?.coldUntil ?? null,
      coldPermanent: current?.coldPermanent ?? false,
      closeness: input.closeness ?? current?.closeness ?? 0.5,
      trustLevel: input.trustLevel ?? current?.trustLevel ?? 0.5,
      familiarity: input.familiarity ?? current?.familiarity ?? 0.5,
      interactionCount: current?.interactionCount ?? 0,
      proactivityPreference: input.proactivityPreference ?? current?.proactivityPreference ?? 0.5,
      topicBoundaries: current?.topicBoundaries ?? {},
      characteristic: nextCharacteristic,
      lastChange: nextLastChange,
      characteristicUpdatedAt: characteristicChanged ? new Date() : current?.characteristicUpdatedAt ?? null
    });

    return `Relationship для ${userId} обновлён.`;
  }

  async remember(guildId: string, createdBy: string, key: string, value: string) {
    const memory = await this.retrieval.rememberServerFact({
      guildId,
      key,
      value,
      type: "note",
      createdBy,
      source: "slash"
    });

    if (this.embeddingAdapter) {
      try {
        const runtimeSettings = await this.runtimeConfig?.getRuntimeSettings();
        const vector = await this.embeddingAdapter.embedOne(value, {
          dimensions: runtimeSettings?.openaiEmbedDimensions
        });

        if (vector.length) {
          await this.retrieval.setEmbedding("server_memory", memory.id, toVectorLiteral(vector), vector.length);
        }
      } catch {
        // Memory was already stored; semantic embedding can be retried later.
      }
    }

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
      responseLengthOverride?: string | null;
    }
  ) {
    const responseLengthOverride = normalizeResponseLengthOverride(input.responseLengthOverride);

    await this.prisma.channelConfig.upsert({
      where: {
        guildId_channelId: { guildId, channelId }
      },
      update: {
        allowBotReplies: input.allowBotReplies ?? undefined,
        allowInterjections: input.allowInterjections ?? undefined,
        isMuted: input.isMuted ?? undefined,
        topicInterestTags: input.topicInterestTags ? parseCsv(input.topicInterestTags) : undefined,
        responseLengthOverride: input.responseLengthOverride === undefined ? undefined : responseLengthOverride
      },
      create: {
        guildId,
        channelId,
        allowBotReplies: input.allowBotReplies ?? true,
        allowInterjections: input.allowInterjections ?? false,
        isMuted: input.isMuted ?? false,
        topicInterestTags: input.topicInterestTags ? parseCsv(input.topicInterestTags) : [],
        responseLengthOverride
      }
    });

    this.runtimeConfig?.invalidate(guildId, channelId);
    return [
      `Настройки канала ${channelId} обновлены.`,
      `allowBotReplies=${formatOptionalBoolean(input.allowBotReplies)}`,
      `allowInterjections=${formatOptionalBoolean(input.allowInterjections)}`,
      `isMuted=${formatOptionalBoolean(input.isMuted)}`,
      `topicInterestTags=${input.topicInterestTags ? parseCsv(input.topicInterestTags).join(", ") : "unchanged"}`,
      `responseLengthOverride=${responseLengthOverride ?? (input.responseLengthOverride === undefined ? "unchanged" : "inherit")}`
    ].join("\n");
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
      `state=${vector.relationshipState}, score=${vector.relationshipScore}, positiveMarks=${vector.positiveMarks}`,
      `escalationStage=${vector.escalationStage}, coldPermanent=${vector.coldPermanent}, coldUntil=${vector.coldUntil?.toISOString() ?? "none"}`,
      `toneBias=${vector.toneBias}, roast=${vector.roastLevel}, praise=${vector.praiseBias}, interrupt=${vector.interruptPriority}`,
      `doNotMock=${vector.doNotMock}, doNotInitiate=${vector.doNotInitiate}`,
      `closeness=${formatSignal(vector.closeness)}, trust=${formatSignal(vector.trustLevel)}, familiarity=${formatSignal(vector.familiarity)}, proactivity=${formatSignal(vector.proactivityPreference)}`,
      `interactionCount=${vector.interactionCount}`,
      vector.protectedTopics.length ? `protectedTopics: ${vector.protectedTopics.join(", ")}` : "protectedTopics: none",
      `characteristic: ${vector.characteristic ? vector.characteristic : "—"}`,
      `lastChange: ${vector.lastChange ? vector.lastChange : "—"}`
    ].join("\n");
  }

  async resetRelationshipEscalation(guildId: string, userId: string) {
    const vector = await this.relationships.clearEscalation(guildId, userId);
    return `Escalation reset: stage=${vector.escalationStage}`;
  }

  async resetRelationshipCold(guildId: string, userId: string, updatedBy?: string) {
    const vector = await this.relationships.resetColdState(guildId, userId, updatedBy);
    return `Cold reset: state=${vector.relationshipState}, score=${vector.relationshipScore}`;
  }

  async setRelationshipState(guildId: string, userId: string, relationshipState: RelationshipState, updatedBy?: string) {
    const vector = await this.relationships.setRelationshipState(guildId, userId, relationshipState, updatedBy);
    return `Relationship state=${vector.relationshipState}, score=${vector.relationshipScore}`;
  }

  async aggressionEvents(guildId: string, userId: string, limit = 8) {
    const events = await this.prisma.botEventLog.findMany({
      where: {
        guildId,
        userId,
        OR: [
          { eventType: "reply" },
          { eventType: "relationship_session_eval" }
        ]
      },
      orderBy: { createdAt: "desc" },
      take: limit
    });

    const relevant = events.filter((event) => {
      const trace = event.debugTrace as { aggression?: { markerDetected?: boolean; checkerVerdict?: string } } | null;
      return trace?.aggression?.markerDetected || event.eventType === "relationship_session_eval";
    });

    if (!relevant.length) {
      return "Aggression events пока нет.";
    }

    return relevant
      .map((event) => {
        const trace = event.debugTrace as {
          aggression?: {
            stageAfter?: number;
            checkerVerdict?: string;
            replacementText?: string | null;
          };
          relationshipVerdict?: string;
        } | null;
        return `- ${event.createdAt.toISOString()} ${event.eventType} ${trace?.aggression?.checkerVerdict ?? trace?.relationshipVerdict ?? "n/a"} stage=${trace?.aggression?.stageAfter ?? "n/a"} ${trace?.aggression?.replacementText ?? ""}`.trim();
      })
      .join("\n");
  }

  async listMemoryCards(guildId: string, userId: string, limit = 8) {
    const cards = await this.prisma.horiUserMemoryCard.findMany({
      where: {
        guildId,
        userId,
        active: true
      },
      orderBy: { createdAt: "desc" },
      take: limit
    });

    if (!cards.length) {
      return "Memory cards пусты.";
    }

    return cards
      .map((card) => `- ${card.id}: ${card.title} [${card.importance}] ${card.createdAt.toISOString()}`)
      .join("\n");
  }

  async removeMemoryCard(guildId: string, userId: string, cardId: string) {
    const card = await this.prisma.horiUserMemoryCard.findFirst({
      where: {
        id: cardId,
        guildId,
        userId
      }
    });

    if (!card) {
      return "Такую memory card не нашла.";
    }

    await this.prisma.horiUserMemoryCard.update({
      where: { id: card.id },
      data: { active: false }
    });
    await this.prisma.horiRestoredContext.updateMany({
      where: {
        guildId,
        userId,
        memoryCardId: card.id
      },
      data: {
        consumedAt: new Date()
      }
    });

    return `Удалила memory card: ${card.title}`;
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

  async personDossier(guildId: string, userId: string) {
    const [user, profile, vector, notes, stats, albumEntries] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId }
      }),
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
        take: 12
      }),
      this.prisma.userStats.findUnique({
        where: { guildId_userId: { guildId, userId } }
      }),
      this.memoryAlbum?.listMoments(guildId, userId, 4) ?? []
    ]);

    const displayName = user?.globalName ?? user?.username ?? userId;
    const profileLine = profile
      ? [
          profile.summaryShort,
          `styleTags=${profile.styleTags.join(", ") || "none"}`,
          `topicTags=${profile.topicTags.join(", ") || "none"}`,
          `confidence=${profile.confidenceScore.toFixed(2)}, sourceWindow=${profile.sourceWindowSize}`,
          `lastProfiledAt=${profile.lastProfiledAt?.toISOString() ?? "never"}`
        ].join("\n")
      : "Профиль пока не готов.";

    const statsLine = stats
      ? [
          `messages=${stats.totalMessages}, replies=${stats.totalReplies}, mentions=${stats.totalMentions}`,
          `avgMessageLength=${stats.avgMessageLength.toFixed(1)}, conversationStarts=${stats.conversationStarterCount}`,
          `topChannels=${formatJsonSummary(stats.topChannelsSnapshot)}`,
          `activeHours=${formatJsonSummary(stats.activeHoursHistogram)}`
        ].join("\n")
      : "Статистика ещё не собрана.";

    const notesLine = notes.length
      ? notes.map((note) => `- ${note.key}: ${note.value}`).join("\n")
      : "Нет активных user memory notes.";

    const albumLine = albumEntries.length
      ? albumEntries.map((entry) => {
          const excerpt = entry.content.length > 120 ? `${entry.content.slice(0, 117)}...` : entry.content;
          return `- ${entry.id}: ${excerpt}${entry.tags.length ? ` [${entry.tags.join(", ")}]` : ""}`;
        }).join("\n")
      : "В memory album пока пусто.";

    return [
      `Owner dossier: ${displayName}`,
      `userId=${userId}`,
      "",
      "Профиль",
      profileLine,
      "",
      "Отношение",
      [
        `toneBias=${vector.toneBias}`,
        `roast=${vector.roastLevel}, praise=${vector.praiseBias}, interrupt=${vector.interruptPriority}`,
        `closeness=${formatSignal(vector.closeness)}, trust=${formatSignal(vector.trustLevel)}, familiarity=${formatSignal(vector.familiarity)}, proactivity=${formatSignal(vector.proactivityPreference)}`,
        `doNotMock=${vector.doNotMock}, doNotInitiate=${vector.doNotInitiate}`,
        `protectedTopics=${vector.protectedTopics.join(", ") || "none"}`,
        `interactionCount=${vector.interactionCount}`
      ].join("\n"),
      "",
      "Статистика",
      statsLine,
      "",
      "Память",
      notesLine,
      "",
      "Альбом",
      albumLine
    ].join("\n");
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

function formatJsonSummary(value: unknown) {
  if (!value) {
    return "none";
  }

  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  return serialized.length > 180 ? `${serialized.slice(0, 177)}...` : serialized;
}

function resettableString(value: string | null | undefined, fallback: string) {
  if (value === undefined) {
    return undefined;
  }

  return value === null ? fallback : value;
}

function compactIso(value: string) {
  return value.length >= 16 ? `${value.slice(5, 16)}Z` : value;
}

function resettableStringArray(value: string | null | undefined) {
  if (value === undefined) {
    return undefined;
  }

  return value === null ? [] : parseCsv(value);
}

function normalizeResponseLengthOverride(value: string | null | undefined) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  return value === "short" || value === "medium" || value === "long" ? value : null;
}

function formatOptionalBoolean(value: boolean | null | undefined) {
  if (value === undefined || value === null) {
    return "unchanged";
  }

  return value ? "true" : "false";
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
