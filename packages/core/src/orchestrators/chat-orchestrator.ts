import type { AppEnv } from "@hori/config";
import type { AppLogger, AppPrismaClient, BotReplyPayload, BotTrace, MessageEnvelope, SearchHit } from "@hori/shared";
import { botLatencyHistogram, botRepliesCounter, buildMemoryKey, clamp, normalizeWhitespace } from "@hori/shared";

import { buildAnalyticsNarrationPrompt, buildIntentClassifierPrompt, buildRewritePrompt, buildSearchPrompt, buildSummaryPrompt, EmbeddingAdapter, ModelRouter, ToolOrchestrator, defaultToolSet } from "@hori/llm";
import type { LlmClient } from "@hori/llm";
import { AnalyticsQueryService, formatAnalyticsOverview } from "@hori/analytics";
import { ContextService, RetrievalService } from "@hori/memory";
import { BraveSearchClient, buildSourceDigest, fetchWebPage } from "@hori/search";
import { IntentRouter } from "../intents/intent-router";
import { detectMessageKind } from "../persona/messageKinds";
import { PersonaService } from "../persona/persona-service";
import { HELP_TEXT } from "../prompts/system-prompts";
import { ResponseGuard } from "../safety/response-guard";
import { RoastPolicy } from "../safety/roast-policy";
import { ContextBuilderService } from "../services/context-builder";
import { ContextScoringService } from "../services/context-scoring-service";
import type { AffinityService } from "../services/affinity-service";
import type { MediaReactionService } from "../services/media-reaction-service";
import type { MoodService } from "../services/mood-service";
import type { EffectiveRoutingConfig } from "../services/runtime-config-service";
import { RuntimeConfigService } from "../services/runtime-config-service";

interface OrchestratorDeps {
  env: AppEnv;
  logger: AppLogger;
  prisma: AppPrismaClient;
  analytics: AnalyticsQueryService;
  contextService: ContextService;
  retrieval: RetrievalService;
  llmClient: LlmClient;
  modelRouter: ModelRouter;
  toolOrchestrator: ToolOrchestrator;
  searchClient: BraveSearchClient;
  embeddingAdapter: EmbeddingAdapter;
  runtimeConfig: RuntimeConfigService;
  affinity?: AffinityService;
  mood?: MoodService;
  media?: MediaReactionService;
}

export interface DebugTraceRecord {
  id: string;
  messageId: string | null;
  eventType: string;
  intent: string | null;
  routeReason: string | null;
  modelUsed: string | null;
  usedSearch: boolean;
  toolCalls: unknown;
  contextMessages: number | null;
  memoryLayers: unknown;
  latencyMs: number | null;
  relationshipApplied: boolean;
  debugTrace: unknown;
  createdAt: Date;
}

export class ChatOrchestrator {
  private readonly router = new IntentRouter();
  private readonly persona = new PersonaService();
  private readonly roastPolicy = new RoastPolicy();
  private readonly responseGuard = new ResponseGuard();
  private readonly contextBuilder = new ContextBuilderService();
  private readonly contextScoring = new ContextScoringService();
  private readonly embeddingCache = new Map<string, { expiresAt: number; value: number[] }>();

  constructor(private readonly deps: OrchestratorDeps) {}

  private getLlmSettings(intent: Parameters<ModelRouter["pickModel"]>[0], maxTokens?: number, overrides: { temperature?: number; topP?: number } = {}) {
    const profile = this.deps.modelRouter.pickProfile(intent);

    return {
      model: this.deps.modelRouter.pickModel(intent),
      temperature: overrides.temperature ?? profile.temperature,
      topP: overrides.topP ?? profile.topP,
      maxTokens: maxTokens ? Math.min(maxTokens, profile.maxTokens) : profile.maxTokens
    };
  }

  async handleMessage(message: MessageEnvelope, prefetchedConfig?: EffectiveRoutingConfig, queueTrace?: BotTrace["queue"]) {
    const startedAt = Date.now();
    const runtimeConfig = prefetchedConfig ?? (await this.deps.runtimeConfig.getRoutingConfig(message.guildId, message.channelId));
    const guildSettings = runtimeConfig.guildSettings;
    const initialIntent = this.router.route(message, guildSettings.botName);

    if (initialIntent.intent === "ignore") {
      return this.finish(
        {
          triggerSource: message.triggerSource,
          explicitInvocation: message.explicitInvocation,
          intent: "ignore",
          routeReason: initialIntent.reason,
          usedSearch: false,
          toolNames: [],
          contextMessages: 0,
          memoryLayers: [],
          relationshipApplied: false,
          responded: false,
          queue: queueTrace
        },
        startedAt
      );
    }

    const intent = initialIntent.confidence < 0.7 ? await this.classifyWithLlm(initialIntent.cleanedContent, initialIntent) : initialIntent;
    const queryEmbedding = intent.intent !== "help" ? await this.safeEmbed(intent.cleanedContent) : undefined;
    const contextBundle = await this.deps.contextService.buildContext({
      guildId: message.guildId,
      channelId: message.channelId,
      userId: message.userId,
      limit: this.deps.env.LLM_MAX_CONTEXT_MESSAGES,
      queryEmbedding,
      message,
      intent: intent.intent
    });
    const messageKind = runtimeConfig.featureFlags.messageKindAwareMode
      ? detectMessageKind({
          content: intent.cleanedContent,
          intent: intent.intent,
          message,
          context: contextBundle
        })
      : /\?/.test(intent.cleanedContent)
        ? "info_question"
        : "casual_address";
    const affinityRelationship = runtimeConfig.featureFlags.affinitySignalsEnabled
      ? await this.deps.affinity?.applyRecentOverlay(message.guildId, message.userId, contextBundle.relationship)
      : contextBundle.relationship;
    const contextScores = runtimeConfig.featureFlags.contextConfidenceEnabled
      ? this.contextScoring.score({
          bundle: contextBundle,
          message,
          messageKind,
          relationship: affinityRelationship
        })
      : undefined;
    const { contextText, memoryLayers, trace: contextTrace } = this.contextBuilder.buildPromptContext(contextBundle, {
      message,
      intent: intent.intent,
      maxChars: this.deps.env.CONTEXT_V2_MAX_CHARS,
      contextV2Enabled: runtimeConfig.featureFlags.contextV2Enabled
    });
    const moderatorOverlay = await this.deps.prisma.moderatorPreference.findUnique({
      where: {
        guildId_moderatorUserId: {
          guildId: message.guildId,
          moderatorUserId: message.userId
        }
      }
    });

    const effectiveRoast = runtimeConfig.featureFlags.roast
      ? this.roastPolicy.resolveRoastLevel(guildSettings.roastLevel, affinityRelationship)
      : 0;
    const activeMood = runtimeConfig.featureFlags.moodEngineEnabled ? await this.deps.mood?.getActiveMode(message.guildId) : null;

    if (
      runtimeConfig.featureFlags.contextConfidenceEnabled &&
      (message.triggerSource === "auto_interject" || !message.explicitInvocation) &&
      contextScores &&
      contextScores.mockeryConfidence < this.deps.env.AUTOINTERJECT_MIN_CONFIDENCE
    ) {
      return this.finish(
        {
          triggerSource: message.triggerSource,
          explicitInvocation: message.explicitInvocation,
          intent: "ignore",
          routeReason: "self_interject_low_context_confidence",
          modelKind: this.deps.modelRouter.pickKind(intent.intent),
          usedSearch: false,
          toolNames: [],
          contextMessages: contextBundle.recentMessages.length,
          memoryLayers,
          relationshipApplied: Boolean(affinityRelationship),
          responded: false,
          queue: queueTrace,
          context: {
            ...contextTrace,
            contextConfidence: contextScores.contextConfidence,
            mockeryConfidence: contextScores.mockeryConfidence
          }
        },
        startedAt,
        undefined,
        message
      );
    }

    const behavior = this.persona.composeBehavior({
      guildSettings: {
        ...guildSettings,
        roastLevel: effectiveRoast
      },
      featureFlags: runtimeConfig.featureFlags,
      channelPolicy: runtimeConfig.channelPolicy,
      message,
      intent: intent.intent,
      cleanedContent: intent.cleanedContent,
      context: contextBundle,
      moderatorOverlay,
      relationship: affinityRelationship,
      activeMode: activeMood ?? undefined,
      messageKind,
      contextScores,
      contextTrace,
      userLanguage: guildSettings.preferredLanguage,
      isMention: message.mentionedBot || message.mentionsBotByName,
      isReplyToBot: message.triggerSource === "reply",
      isSelfInitiated: message.triggerSource === "auto_interject"
    });
    const systemPrompt = behavior.prompt;

    const trace: BotTrace = {
      triggerSource: message.triggerSource,
      explicitInvocation: message.explicitInvocation,
      intent: intent.intent,
      routeReason: intent.reason,
      modelKind: this.deps.modelRouter.pickKind(intent.intent),
      usedSearch: false,
      toolNames: [],
      contextMessages: contextBundle.recentMessages.length,
      memoryLayers,
      relationshipApplied: Boolean(affinityRelationship),
      responded: true,
      behavior: behavior.trace,
      queue: queueTrace,
      context: {
        ...contextTrace,
        contextConfidence: contextScores?.contextConfidence,
        mockeryConfidence: contextScores?.mockeryConfidence
      }
    };

    let reply = "";

    try {
      switch (intent.intent) {
        case "help":
          reply = HELP_TEXT;
          break;
        case "analytics":
          reply = await this.handleAnalytics(message.guildId, intent.cleanedContent, systemPrompt, behavior.limits.maxTokens);
          break;
        case "summary":
          reply = await this.handleSummary(intent.cleanedContent, systemPrompt, contextText, behavior.limits.maxTokens);
          break;
        case "search": {
          const result = runtimeConfig.featureFlags.webSearch
            ? await this.handleSearch(message, intent.cleanedContent, systemPrompt, behavior.limits.maxTokens)
            : { text: "Поиск сейчас выключен.", toolNames: [], usedSearch: false };
          reply = result.text;
          trace.usedSearch = result.usedSearch;
          trace.toolNames = result.toolNames;
          break;
        }
        case "memory_write":
          reply = await this.handleMemoryWrite(message, intent.cleanedContent);
          break;
        case "memory_forget":
          reply = await this.handleMemoryForget(message, intent.cleanedContent);
          break;
        case "rewrite":
          reply = await this.handleRewrite(message, intent.cleanedContent, systemPrompt, behavior.limits.maxTokens);
          break;
        case "profile":
          reply = runtimeConfig.featureFlags.userProfiles ? await this.handleProfile(message) : "Профили сейчас выключены.";
          break;
        case "moderation_style_request":
          reply = message.isModerator ? "Для такого лучше slash-команду. Так чище." : "Это только для модеров.";
          break;
        case "chat":
        default:
          reply = await this.handleChat(intent.cleanedContent, systemPrompt, contextText, behavior.limits.maxTokens);
          break;
      }
    } catch (error) {
      this.deps.logger.error({ error, intent: intent.intent, model: this.deps.modelRouter.pickModel(intent.intent) }, "llm call failed, sending fallback");
      reply = "Сейчас не могу ответить — мозги перегрелись. Попробуй чуть позже.";
      trace.routeReason = "llm_unavailable";
    }

    const behaviorLimitedIntents = new Set(["analytics", "summary", "search", "rewrite", "chat"]);
    const maxReplyChars = behaviorLimitedIntents.has(intent.intent)
      ? Math.min(this.deps.env.DEFAULT_REPLY_MAX_CHARS, behavior.limits.maxChars)
      : this.deps.env.DEFAULT_REPLY_MAX_CHARS;

    reply = this.responseGuard.enforce(reply, {
      maxChars: maxReplyChars,
      forbiddenWords: guildSettings.forbiddenWords
    });

    await this.recordAffinitySignal(runtimeConfig.featureFlags.affinitySignalsEnabled, {
      guildId: message.guildId,
      userId: message.userId,
      messageId: message.messageId,
      messageKind
    });

    let replyPayload: string | BotReplyPayload = reply;

    if (runtimeConfig.featureFlags.mediaReactionsEnabled && this.deps.media && behavior.trace.mediaReactionEligible) {
      const mediaResult = await this.deps.media.maybeAttachMedia({
        enabled: true,
        replyText: reply,
        channelKind: behavior.trace.channelKind,
        mode: behavior.trace.activeMode,
        stylePreset: behavior.trace.stylePreset,
        triggerTags: [
          behavior.trace.messageKind,
          behavior.trace.channelKind,
          behavior.trace.activeMode,
          ...(behavior.trace.staleTakeDetected ? ["stale_take"] : [])
        ]
      });
      replyPayload = mediaResult.payload;
      trace.media = mediaResult.trace;
    }

    botRepliesCounter.inc({ intent: intent.intent });

    return this.finish(trace, startedAt, replyPayload, message);
  }

  async handleContextAction(input: {
    guildId: string;
    channelId: string;
    requesterId: string;
    requesterIsModerator: boolean;
    action: "explain" | "summarize" | "tone";
    sourceMessageId: string;
  }) {
    const sourceMessage = await this.deps.prisma.message.findUnique({
      where: { id: input.sourceMessageId }
    });

    if (!sourceMessage) {
      return "Сообщение не нашла.";
    }

    const requestText = input.action === "explain" ? "объясни, что имелось в виду" : input.action === "summarize" ? "кратко перескажи" : "оцени тон";

    const envelope: MessageEnvelope = {
      messageId: `context:${input.sourceMessageId}`,
      guildId: input.guildId,
      channelId: input.channelId,
      userId: input.requesterId,
      username: "context-action",
      content: `Хори ${requestText}\n\n${sourceMessage.content}`,
      createdAt: new Date(),
      replyToMessageId: input.sourceMessageId,
      mentionCount: 0,
      mentionedBot: true,
      mentionsBotByName: true,
      mentionedUserIds: [sourceMessage.userId],
      triggerSource: "context_action",
      isModerator: input.requesterIsModerator,
      explicitInvocation: true
    };

    const featureFlags = await this.deps.runtimeConfig.getFeatureFlags(input.guildId);

    if (!featureFlags.contextActions) {
      return "Контекстные действия сейчас выключены.";
    }

    const result = await this.handleMessage(envelope);
    return typeof result.reply === "string" ? result.reply : (result.reply?.text ?? "Нечего сказать.");
  }

  async explainTrace(messageId: string): Promise<DebugTraceRecord | null> {
    return this.deps.prisma.botEventLog.findFirst({
      where: { messageId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        messageId: true,
        eventType: true,
        intent: true,
        routeReason: true,
        modelUsed: true,
        usedSearch: true,
        toolCalls: true,
        contextMessages: true,
        memoryLayers: true,
        latencyMs: true,
        relationshipApplied: true,
        debugTrace: true,
        createdAt: true
      }
    });
  }

  private async classifyWithLlm(cleanedContent: string, fallback: ReturnType<IntentRouter["route"]>) {
    try {
      const llm = this.getLlmSettings("chat", 96, { temperature: 0 });
      const response = await this.deps.llmClient.chat({
        model: llm.model,
        messages: buildIntentClassifierPrompt(cleanedContent),
        format: "json",
        temperature: llm.temperature,
        topP: llm.topP,
        maxTokens: llm.maxTokens
      });

      const parsed = JSON.parse(response.message.content) as { intent?: string; confidence?: number; reason?: string };

      if (parsed.intent) {
        return {
          intent: parsed.intent as ReturnType<IntentRouter["route"]>["intent"],
          confidence: clamp(Number(parsed.confidence ?? 0.5), 0, 1),
          reason: parsed.reason ?? "llm classifier",
          cleanedContent,
          requiresSearch: parsed.intent === "search"
        };
      }
    } catch (error) {
      this.deps.logger.warn({ error }, "llm intent classification failed");
    }

    return fallback;
  }

  private async handleChat(content: string, systemPrompt: string, contextText: string, maxTokens?: number) {
    const llm = this.getLlmSettings("chat", maxTokens);
    const messages: Array<{ role: "system" | "user"; content: string }> = [{ role: "system", content: systemPrompt }];

    if (contextText.trim()) {
      messages.push({
        role: "system",
        content: `[BACKGROUND CONTEXT - calibration only]\nUse this only for continuity, tone and relevance. Never answer this block directly and do not recap it unless the user explicitly asks.\n${contextText}`
      });
    }

    messages.push({ role: "user", content });

    const response = await this.deps.llmClient.chat({
      model: llm.model,
      messages,
      temperature: llm.temperature,
      topP: llm.topP,
      maxTokens: llm.maxTokens
    });

    return response.message.content;
  }

  private async handleSummary(content: string, systemPrompt: string, contextText: string, maxTokens?: number) {
    const llm = this.getLlmSettings("summary", maxTokens);
    const messages = buildSummaryPrompt(contextText || "Контекста почти нет.", content);
    messages.unshift({ role: "system", content: systemPrompt });

    const response = await this.deps.llmClient.chat({
      model: llm.model,
      messages,
      temperature: llm.temperature,
      topP: llm.topP,
      maxTokens: llm.maxTokens
    });

    return response.message.content;
  }

  private async handleAnalytics(guildId: string, request: string, systemPrompt: string, maxTokens?: number) {
    const llm = this.getLlmSettings("analytics", maxTokens);
    const window = /за день|сегодня/i.test(request) ? "day" : /за месяц|месяц/i.test(request) ? "month" : "week";
    const overview = await this.deps.analytics.getOverview(guildId, window);
    const analyticsText = formatAnalyticsOverview(overview);

    const response = await this.deps.llmClient.chat({
      model: llm.model,
      messages: [{ role: "system", content: systemPrompt }, ...buildAnalyticsNarrationPrompt(analyticsText, request)],
      temperature: llm.temperature,
      topP: llm.topP,
      maxTokens: llm.maxTokens
    });

    return response.message.content || analyticsText;
  }

  private async handleSearch(message: MessageEnvelope, request: string, systemPrompt: string, maxTokens?: number) {
    const llm = this.getLlmSettings("search", maxTokens);
    const fetchedPages: Array<{ url: string; title: string; content: string }> = [];
    let searchRequests = 0;
    const tools = [
      {
        definition: defaultToolSet[0],
        execute: async (args: Record<string, unknown>) => {
          if (searchRequests >= this.deps.env.SEARCH_MAX_REQUESTS_PER_RESPONSE) {
            throw new Error("Search request limit reached for this response");
          }

          const response = await this.deps.searchClient.search(
            String(args.query ?? request),
            {
              userId: message.userId,
              freshness: typeof args.freshness === "string" ? args.freshness : undefined,
              maxResults: typeof args.maxResults === "number" ? args.maxResults : this.deps.env.SEARCH_MAX_PAGES_PER_RESPONSE,
              applyCooldown: searchRequests === 0
            }
          );

          searchRequests += 1;
          return response;
        }
      },
      {
        definition: defaultToolSet[1],
        execute: async (args: Record<string, unknown>) => {
          if (fetchedPages.length >= this.deps.env.SEARCH_MAX_PAGES_PER_RESPONSE) {
            throw new Error("Page fetch limit reached for this response");
          }

          const page = await fetchWebPage(String(args.url), this.deps.env);
          fetchedPages.push(page);
          return page;
        }
      },
      {
        definition: defaultToolSet[2],
        execute: async (args: Record<string, unknown>) => args
      }
    ];

    const run = await this.deps.toolOrchestrator.runChatWithTools({
      model: llm.model,
      messages: [
        { role: "system", content: `${systemPrompt}\nЕсли нужен интернет, сначала вызывай инструменты.` },
        { role: "user", content: request }
      ],
      tools,
      maxToolCalls: this.deps.env.LLM_MAX_TOOL_CALLS,
      temperature: llm.temperature,
      topP: llm.topP,
      maxTokens: llm.maxTokens
    });

    if (run.toolCalls.length === 0) {
      return { text: run.text, toolNames: [], usedSearch: false };
    }

    const searchCalls = run.toolCalls.filter((call) => call.toolName === "web_search");
    const searchHits = searchCalls.flatMap((call) => call.output as SearchHit[]);
    const finalPrompt = buildSearchPrompt(request, buildSourceDigest(request, searchHits, fetchedPages));
    finalPrompt.unshift({ role: "system", content: systemPrompt });

    const response = await this.deps.llmClient.chat({
      model: llm.model,
      messages: finalPrompt,
      temperature: llm.temperature,
      topP: llm.topP,
      maxTokens: llm.maxTokens
    });

    return {
      text: response.message.content || run.text,
      toolNames: run.toolCalls.map((call) => call.toolName),
      usedSearch: true
    };
  }

  private async handleMemoryWrite(message: MessageEnvelope, cleanedContent: string) {
    if (!message.isModerator) {
      return "Не. Это только для модератора.";
    }

    const fact = normalizeWhitespace(cleanedContent.replace(/^запомни\b/i, ""));

    if (!fact) {
      return "Скажи что именно запомнить.";
    }

    const key = buildMemoryKey(fact);
    const memory = await this.deps.retrieval.rememberServerFact({
      guildId: message.guildId,
      key,
      value: fact,
      type: "manual_note",
      createdBy: message.userId,
      source: "message"
    });

    const embedding = await this.safeEmbed(memory.value);
    if (embedding?.length) {
      await this.deps.retrieval.setEmbedding("server_memory", memory.id, `[${embedding.join(",")}]`);
    }

    return `Ладно. Запомнила: ${fact}`;
  }

  private async handleMemoryForget(message: MessageEnvelope, cleanedContent: string) {
    if (!message.isModerator) {
      return "Не. Это только для модератора.";
    }

    const factKey = buildMemoryKey(normalizeWhitespace(cleanedContent.replace(/^забудь\b/i, "")));

    if (!factKey) {
      return "Скажи что забыть.";
    }

    await this.deps.retrieval.forgetServerFact(message.guildId, factKey);
    return `Удалила память по ${factKey}.`;
  }

  private async handleRewrite(message: MessageEnvelope, cleanedContent: string, systemPrompt: string, maxTokens?: number) {
    const llm = this.getLlmSettings("rewrite", maxTokens);
    const source = message.replyToMessageId ? await this.deps.prisma.message.findUnique({ where: { id: message.replyToMessageId } }) : null;

    if (!source) {
      return "Если хочешь переписать текст, ответь реплаем на него.";
    }

    const prompt = buildRewritePrompt(source.content, cleanedContent);
    prompt.unshift({ role: "system", content: systemPrompt });

    const response = await this.deps.llmClient.chat({
      model: llm.model,
      messages: prompt,
      temperature: llm.temperature,
      topP: llm.topP,
      maxTokens: llm.maxTokens
    });

    return response.message.content;
  }

  private async handleProfile(message: MessageEnvelope) {
    const targetUserId = message.mentionedUserIds[0] ?? message.userId;
    const profile = await this.deps.prisma.userProfile.findUnique({
      where: {
        guildId_userId: {
          guildId: message.guildId,
          userId: targetUserId
        }
      }
    });

    if (!profile || !profile.isEligible || profile.confidenceScore < 0.45) {
      return "Нормального профиля нет. Либо данных мало, либо он слишком слабый.";
    }

    return `${profile.summaryShort}\nТеги: ${profile.styleTags.join(", ")} | ${profile.topicTags.join(", ")}`;
  }

  private async safeEmbed(text: string) {
    const key = normalizeWhitespace(text).toLowerCase();

    if (!key) {
      return undefined;
    }

    const cached = this.embeddingCache.get(key);

    if (this.deps.env.FEATURE_EMBEDDING_CACHE_ENABLED && cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    try {
      const value = await this.deps.embeddingAdapter.embedOne(text);
      if (this.deps.env.FEATURE_EMBEDDING_CACHE_ENABLED && value.length) {
        this.embeddingCache.set(key, {
          value,
          expiresAt: Date.now() + this.deps.env.EMBEDDING_CACHE_TTL_SEC * 1000
        });
      }

      return value;
    } catch (error) {
      this.deps.logger.warn({ error }, "failed to build embedding");
      return undefined;
    }
  }

  private async recordAffinitySignal(
    enabled: boolean,
    input: Parameters<AffinityService["recordMessageSignal"]>[0]
  ) {
    if (!enabled || !this.deps.affinity) {
      return;
    }

    try {
      await this.deps.affinity.recordMessageSignal(input);
    } catch (error) {
      this.deps.logger.warn({ error }, "failed to record affinity signal");
    }
  }

  private async finish(trace: BotTrace, startedAt: number, reply?: string | BotReplyPayload, message?: MessageEnvelope) {
    trace.latencyMs = Date.now() - startedAt;

    if (trace.responded) {
      botLatencyHistogram.observe({ intent: trace.intent }, trace.latencyMs);
    }

    if (message) {
      await this.deps.prisma.botEventLog.create({
        data: {
          guildId: message.guildId,
          channelId: message.channelId,
          messageId: message.messageId,
          userId: message.userId,
          eventType: trace.responded ? "reply" : "ignore",
          intent: trace.intent,
          routeReason: trace.routeReason,
          modelUsed: trace.modelKind,
          usedSearch: trace.usedSearch,
          toolCalls: trace.toolNames,
          contextMessages: trace.contextMessages,
          memoryLayers: trace.memoryLayers,
          latencyMs: trace.latencyMs,
          relationshipApplied: trace.relationshipApplied,
          debugTrace: trace as never
        }
      });
    }

    return { reply, trace };
  }
}

export function createChatOrchestrator(deps: OrchestratorDeps) {
  return new ChatOrchestrator(deps);
}
