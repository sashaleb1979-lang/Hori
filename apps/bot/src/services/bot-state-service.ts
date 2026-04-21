import type { BotRuntime } from "../bootstrap";
import { getOwnerLockdownState } from "../router/owner-lockdown";
import { MODEL_ROUTING_SLOTS } from "@hori/llm";

export const HORI_STATE_TABS = ["persona", "brain", "memory", "channel", "search", "queue", "media", "features", "trace", "tokens"] as const;
export type HoriStateTab = (typeof HORI_STATE_TABS)[number];

export interface BotStatePanel {
  title: string;
  description: string;
  fields: Array<{ name: string; value: string; inline?: boolean }>;
}

export class BotStateService {
  constructor(private readonly runtime: BotRuntime) {}

  async build(tab: HoriStateTab, guildId: string, channelId: string): Promise<BotStatePanel> {
    switch (tab) {
      case "persona":
        return this.persona(guildId, channelId);
      case "brain":
        return this.brain(guildId, channelId);
      case "memory":
        return this.memory(guildId, channelId);
      case "channel":
        return this.channel(guildId, channelId);
      case "search":
        return this.search(guildId);
      case "queue":
        return this.queue(guildId, channelId);
      case "media":
        return this.media(guildId);
      case "features":
        return this.features(guildId);
      case "trace":
        return this.trace(guildId);
      case "tokens":
        return this.tokens(guildId);
    }
  }

  private async persona(guildId: string, channelId: string): Promise<BotStatePanel> {
    const [routing, mood] = await Promise.all([
      this.runtime.runtimeConfig.getRoutingConfig(guildId, channelId),
      this.runtime.slashAdmin.moodStatus(guildId)
    ]);
    const settings = routing.guildSettings;

    return {
      title: "Состояние: персона",
      description: "Как Хори сейчас держит характер и стиль",
      fields: [
        { name: "Имя и язык", value: `${settings.botName} / ${settings.preferredLanguage}`, inline: true },
        { name: "Короткость", value: `replyLength=${settings.replyLength}, maxChars=${routing.runtimeSettings.defaultReplyMaxChars}`, inline: true },
        { name: "Тон", value: `rough=${settings.roughnessLevel}, sarcasm=${settings.sarcasmLevel}, roast=${settings.roastLevel}`, inline: true },
        { name: "Mood", value: clip(mood) },
        { name: "Style", value: clip(settings.preferredStyle || "нет") }
      ]
    };
  }

  private async brain(guildId: string, channelId: string): Promise<BotStatePanel> {
    const [routing, power, lockdown, modelRouting, hydeStatus, embedStatus] = await Promise.all([
      this.runtime.runtimeConfig.getRoutingConfig(guildId, channelId),
      this.runtime.slashAdmin.powerStatus(),
      getOwnerLockdownState(this.runtime, true),
      this.runtime.runtimeConfig.getModelRoutingStatus(),
      this.runtime.runtimeConfig.getMemoryHydeStatus(),
      this.runtime.runtimeConfig.getOpenAIEmbeddingDimensionsStatus()
    ]);
    const embeddingStatus = modelRouting.embeddingDimensions
      ? `${modelRouting.embeddingModel} @ ${modelRouting.embeddingDimensions} dims`
      : modelRouting.embeddingModel;
    const llm = modelRouting.provider === "openai"
      ? [
          `provider=openai preset=${modelRouting.preset}`,
          ...MODEL_ROUTING_SLOTS.map((slot) => `${slot}=${modelRouting.slots[slot]}`),
          `embed=${embeddingStatus}`
        ].join("\n")
      : `provider=ollama\nurl=${this.runtime.env.OLLAMA_BASE_URL ?? "missing"}\nfast=${this.runtime.env.OLLAMA_FAST_MODEL}\nsmart=${this.runtime.env.OLLAMA_SMART_MODEL}`;

    return {
      title: "Состояние: мозги",
      description: "Модели, лимиты и режимы выполнения",
      fields: [
        { name: "LLM", value: clip(llm) },
        { name: "Power", value: clip(power) },
        {
          name: "Runtime",
          value: clip([
            `ctx=${routing.runtimeSettings.ollamaNumCtx}, batch=${routing.runtimeSettings.ollamaNumBatch}, replyTokens=${routing.runtimeSettings.llmReplyMaxTokens}`,
            `hyde=${hydeStatus.value ? "on" : "off"} (${hydeStatus.source})`,
            embedStatus.source === "unsupported"
              ? "embedDims=native"
              : `embedDims=${embedStatus.value ?? "n/a"} (${embedStatus.source})`
          ].join("\n")),
          inline: true
        },
        { name: "Lockdown", value: lockdown.enabled ? `on, updatedBy=${lockdown.updatedBy ?? "unknown"}` : "off", inline: true }
      ]
    };
  }

  private async memory(guildId: string, channelId: string): Promise<BotStatePanel> {
    const [serverCount, userCount, channelCount, eventCount, latestBuild] = await Promise.all([
      this.runtime.prisma.serverMemory.count({ where: { guildId } }),
      this.runtime.prisma.userMemoryNote.count({ where: { guildId, active: true } }),
      this.runtime.prisma.channelMemoryNote.count({ where: { guildId, active: true } }),
      this.runtime.prisma.eventMemory.count({ where: { guildId, active: true } }),
      this.runtime.prisma.memoryBuildRun.findFirst({ where: { guildId }, orderBy: { createdAt: "desc" } })
    ]);

    return {
      title: "Состояние: память",
      description: "Active Memory и накопленные заметки",
      fields: [
        { name: "Слои", value: `server=${serverCount}, user=${userCount}, channel=${channelCount}, event=${eventCount}` },
        { name: "Текущий канал", value: clip(await this.runtime.slashAdmin.channelMemoryStatus(guildId, channelId)) },
        {
          name: "Последняя сборка",
          value: latestBuild
            ? clip(`${latestBuild.status} / ${latestBuild.scope}:${latestBuild.depth}\n${latestBuild.finishedAt?.toISOString() ?? latestBuild.updatedAt.toISOString()}`)
            : "не запускалась"
        }
      ]
    };
  }

  private async channel(guildId: string, channelId: string): Promise<BotStatePanel> {
    const [policy, queue, interjectionsHour] = await Promise.all([
      this.runtime.runtimeConfig.getChannelPolicy(guildId, channelId),
      this.runtime.slashAdmin.queueStatus(guildId, channelId),
      this.runtime.prisma.interjectionLog.count({
        where: {
          guildId,
          channelId,
          createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) }
        }
      })
    ]);

    return {
      title: "Состояние: канал",
      description: `Канал ${channelId}`,
      fields: [
        { name: "Policy", value: `replies=${policy.allowBotReplies}, interjections=${policy.allowInterjections}, muted=${policy.isMuted}` },
        { name: "Tags", value: policy.topicInterestTags.join(", ") || "none" },
        { name: "Queue", value: clip(queue), inline: true },
        { name: "Interjections 1h", value: String(interjectionsHour), inline: true }
      ]
    };
  }

  private async search(guildId: string): Promise<BotStatePanel> {
    const latestSearch = await this.runtime.prisma.botEventLog.findFirst({
      where: { guildId, usedSearch: true },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, routeReason: true, toolCalls: true, debugTrace: true }
    });

    return {
      title: "Состояние: поиск",
      description: "Brave, fetch и fallback",
      fields: [
        { name: "Env", value: clip(`BRAVE=${this.runtime.env.BRAVE_SEARCH_API_KEY ? "set" : "missing"}\nmaxRequests=${this.runtime.env.SEARCH_MAX_REQUESTS_PER_RESPONSE}\nmaxPages=${this.runtime.env.SEARCH_MAX_PAGES_PER_RESPONSE}\ncooldown=${this.runtime.env.SEARCH_USER_COOLDOWN_SEC}s`) },
        { name: "Denylist", value: this.runtime.env.SEARCH_DOMAIN_DENYLIST.join(", ") || "none" },
        { name: "Latest", value: latestSearch ? clip(`${latestSearch.createdAt.toISOString()}\n${latestSearch.routeReason ?? "no reason"}\n${JSON.stringify(latestSearch.toolCalls ?? [])}`) : "поисковых trace пока нет" }
      ]
    };
  }

  private async queue(guildId: string, channelId: string): Promise<BotStatePanel> {
    const [guildQueue, channelQueue, pending] = await Promise.all([
      this.runtime.slashAdmin.queueStatus(guildId, null),
      this.runtime.slashAdmin.queueStatus(guildId, channelId),
      this.runtime.prisma.replyQueueItem.count({ where: { guildId, status: "queued" } })
    ]);

    return {
      title: "Состояние: очередь",
      description: "Reply queue и ожидание ответов",
      fields: [
        { name: "Сервер", value: clip(guildQueue) },
        { name: "Канал", value: clip(channelQueue) },
        { name: "Pending", value: String(pending), inline: true }
      ]
    };
  }

  private async media(guildId: string): Promise<BotStatePanel> {
    const [enabled, disabled, used24h, latest] = await Promise.all([
      this.runtime.prisma.mediaMetadata.count({ where: { enabled: true } }),
      this.runtime.prisma.mediaMetadata.count({ where: { enabled: false } }),
      this.runtime.prisma.mediaUsageLog.count({
        where: { guildId, usedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }
      }),
      this.runtime.prisma.mediaUsageLog.findFirst({ where: { guildId }, orderBy: { usedAt: "desc" } })
    ]);

    return {
      title: "Состояние: медиа",
      description: "GIF/media registry",
      fields: [
        { name: "Registry", value: `enabled=${enabled}, disabled=${disabled}`, inline: true },
        { name: "Used 24h", value: String(used24h), inline: true },
        { name: "Latest", value: latest ? `${latest.mediaId} / ${latest.reasonKey ?? "no reason"} / ${latest.usedAt.toISOString()}` : "ещё не использовались" }
      ]
    };
  }

  private async features(guildId: string): Promise<BotStatePanel> {
    const flags = await this.runtime.runtimeConfig.getFeatureFlags(guildId);
    const on = Object.entries(flags).filter(([, enabled]) => enabled).map(([key]) => key);
    const off = Object.entries(flags).filter(([, enabled]) => !enabled).map(([key]) => key);

    return {
      title: "Состояние: фичи",
      description: "Runtime feature flags",
      fields: [
        { name: "On", value: clip(on.join(", ") || "none") },
        { name: "Off", value: clip(off.join(", ") || "none") }
      ]
    };
  }

  private async trace(guildId: string): Promise<BotStatePanel> {
    const latest = await this.runtime.prisma.botEventLog.findFirst({
      where: { guildId },
      orderBy: { createdAt: "desc" },
      select: {
        messageId: true,
        eventType: true,
        intent: true,
        routeReason: true,
        modelUsed: true,
        usedSearch: true,
        latencyMs: true,
        promptTokens: true,
        completionTokens: true,
        totalTokens: true,
        tokenSource: true,
        debugTrace: true,
        createdAt: true
      }
    });

    return {
      title: "Состояние: trace",
      description: "Последний bot event",
      fields: [
        {
          name: "Latest",
          value: latest
            ? clip(`${latest.createdAt.toISOString()}\n${latest.eventType}/${latest.intent ?? "none"} model=${latest.modelUsed ?? "none"} latency=${latest.latencyMs ?? "?"}ms\ntokens=${latest.totalTokens ?? "none"} (${latest.tokenSource ?? "n/a"})\n${latest.routeReason ?? "no reason"}`)
            : "trace пока нет"
        },
        { name: "Debug", value: latest ? clip(JSON.stringify(latest.debugTrace, null, 2)) : "none" }
      ]
    };
  }

  private async tokens(guildId: string): Promise<BotStatePanel> {
    const [day, week, searchDay] = await Promise.all([
      this.tokenWindow(guildId, 24 * 60 * 60 * 1000),
      this.tokenWindow(guildId, 7 * 24 * 60 * 60 * 1000),
      this.tokenWindow(guildId, 24 * 60 * 60 * 1000, true)
    ]);

    return {
      title: "Состояние: токены",
      description: "Реальные Ollama usage, если модель прислала счётчики; иначе оценка chars/4",
      fields: [
        { name: "24h", value: day },
        { name: "7d", value: week },
        { name: "Search 24h", value: searchDay },
        { name: "Обычный ответ", value: "Оценка до телеметрии: примерно 2k-4k input и 10-80 output tokens; search часто 4k-8k+ input." }
      ]
    };
  }

  private async tokenWindow(guildId: string, windowMs: number, usedSearch?: boolean) {
    const aggregate = await this.runtime.prisma.botEventLog.aggregate({
      where: {
        guildId,
        createdAt: { gte: new Date(Date.now() - windowMs) },
        totalTokens: { not: null },
        ...(usedSearch === undefined ? {} : { usedSearch })
      },
      _count: { _all: true },
      _sum: { promptTokens: true, completionTokens: true, totalTokens: true },
      _avg: { promptTokens: true, completionTokens: true, totalTokens: true }
    });

    const count = aggregate._count._all;
    if (!count) {
      return "нет данных";
    }

    return [
      `calls=${count}`,
      `avg input=${formatNumber(aggregate._avg.promptTokens)}, output=${formatNumber(aggregate._avg.completionTokens)}, total=${formatNumber(aggregate._avg.totalTokens)}`,
      `sum input=${aggregate._sum.promptTokens ?? 0}, output=${aggregate._sum.completionTokens ?? 0}, total=${aggregate._sum.totalTokens ?? 0}`
    ].join("\n");
  }
}

export function parseHoriStateTab(value: string | null | undefined): HoriStateTab | null {
  return HORI_STATE_TABS.includes(value as HoriStateTab) ? (value as HoriStateTab) : null;
}

export function horiStateTabLabel(tab: HoriStateTab) {
  const labels: Record<HoriStateTab, string> = {
    persona: "Персона",
    brain: "Мозги",
    memory: "Память",
    channel: "Канал",
    search: "Поиск",
    queue: "Очередь",
    media: "Медиа",
    features: "Фичи",
    trace: "Trace",
    tokens: "Токены"
  };
  return labels[tab];
}

function clip(value: string, max = 1000) {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value || "none";
}

function formatNumber(value: number | null) {
  return value === null ? "n/a" : value.toFixed(0);
}
