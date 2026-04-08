import type { AppEnv } from "@hori/config";
import type { AppLogger, AppPrismaClient, BotTrace, MessageEnvelope, SearchHit } from "@hori/shared";
import { botLatencyHistogram, botRepliesCounter, buildMemoryKey, clamp, normalizeWhitespace } from "@hori/shared";

import { buildAnalyticsNarrationPrompt, buildIntentClassifierPrompt, buildRewritePrompt, buildSearchPrompt, buildSummaryPrompt, EmbeddingAdapter, ModelRouter, OllamaClient, ToolOrchestrator, defaultToolSet } from "@hori/llm";
import { AnalyticsQueryService, formatAnalyticsOverview } from "@hori/analytics";
import { ContextService, RetrievalService } from "@hori/memory";
import { BraveSearchClient, buildSourceDigest, fetchWebPage } from "@hori/search";
import { IntentRouter } from "../intents/intent-router";
import { PersonaService } from "../persona/persona-service";
import { HELP_TEXT } from "../prompts/system-prompts";
import { ResponseGuard } from "../safety/response-guard";
import { RoastPolicy } from "../safety/roast-policy";
import { ContextBuilderService } from "../services/context-builder";
import type { EffectiveRoutingConfig } from "../services/runtime-config-service";
import { RuntimeConfigService } from "../services/runtime-config-service";

interface OrchestratorDeps {
  env: AppEnv;
  logger: AppLogger;
  prisma: AppPrismaClient;
  analytics: AnalyticsQueryService;
  contextService: ContextService;
  retrieval: RetrievalService;
  llmClient: OllamaClient;
  modelRouter: ModelRouter;
  toolOrchestrator: ToolOrchestrator;
  searchClient: BraveSearchClient;
  embeddingAdapter: EmbeddingAdapter;
  runtimeConfig: RuntimeConfigService;
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

  constructor(private readonly deps: OrchestratorDeps) {}

  async handleMessage(message: MessageEnvelope, prefetchedConfig?: EffectiveRoutingConfig) {
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
          responded: false
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
      queryEmbedding
    });
    const { contextText, memoryLayers } = this.contextBuilder.buildPromptContext(contextBundle);
    const moderatorOverlay = await this.deps.prisma.moderatorPreference.findUnique({
      where: {
        guildId_moderatorUserId: {
          guildId: message.guildId,
          moderatorUserId: message.userId
        }
      }
    });

    const effectiveRoast = runtimeConfig.featureFlags.roast
      ? this.roastPolicy.resolveRoastLevel(guildSettings.roastLevel, contextBundle.relationship)
      : 0;
    const systemPrompt = this.persona.composePrompt({
      guildSettings: {
        ...guildSettings,
        roastLevel: effectiveRoast
      },
      moderatorOverlay,
      relationship: contextBundle.relationship
    });

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
      relationshipApplied: Boolean(contextBundle.relationship),
      responded: true
    };

    let reply = "";

    switch (intent.intent) {
      case "help":
        reply = HELP_TEXT;
        break;
      case "analytics":
        reply = await this.handleAnalytics(message.guildId, intent.cleanedContent, systemPrompt);
        break;
      case "summary":
        reply = await this.handleSummary(intent.cleanedContent, systemPrompt, contextText);
        break;
      case "search": {
        const result = runtimeConfig.featureFlags.webSearch
          ? await this.handleSearch(message, intent.cleanedContent, systemPrompt)
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
        reply = await this.handleRewrite(message, intent.cleanedContent, systemPrompt);
        break;
      case "profile":
        reply = runtimeConfig.featureFlags.userProfiles ? await this.handleProfile(message) : "Профили сейчас выключены.";
        break;
      case "moderation_style_request":
        reply = message.isModerator ? "Для такого лучше slash-команду. Так чище." : "Это только для модеров.";
        break;
      case "chat":
      default:
        reply = await this.handleChat(intent.cleanedContent, systemPrompt, contextText);
        break;
    }

    reply = this.responseGuard.enforce(reply, {
      maxChars: this.deps.env.DEFAULT_REPLY_MAX_CHARS,
      forbiddenWords: guildSettings.forbiddenWords
    });

    botRepliesCounter.inc({ intent: intent.intent });

    return this.finish(trace, startedAt, reply, message);
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
    return result.reply ?? "Нечего сказать.";
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
      const response = await this.deps.llmClient.chat({
        model: this.deps.env.OLLAMA_FAST_MODEL,
        messages: buildIntentClassifierPrompt(cleanedContent),
        format: "json",
        temperature: 0
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

  private async handleChat(content: string, systemPrompt: string, contextText: string) {
    const response = await this.deps.llmClient.chat({
      model: this.deps.modelRouter.pickModel("chat"),
      messages: [
        { role: "system", content: `${systemPrompt}\n\n${contextText}` },
        { role: "user", content }
      ]
    });

    return response.message.content;
  }

  private async handleSummary(content: string, systemPrompt: string, contextText: string) {
    const messages = buildSummaryPrompt(contextText || "Контекста почти нет.", content);
    messages[0].content = `${systemPrompt}\n\n${messages[0].content}`;

    const response = await this.deps.llmClient.chat({
      model: this.deps.modelRouter.pickModel("summary"),
      messages
    });

    return response.message.content;
  }

  private async handleAnalytics(guildId: string, request: string, systemPrompt: string) {
    const window = /за день|сегодня/i.test(request) ? "day" : /за месяц|месяц/i.test(request) ? "month" : "week";
    const overview = await this.deps.analytics.getOverview(guildId, window);
    const analyticsText = formatAnalyticsOverview(overview);

    const response = await this.deps.llmClient.chat({
      model: this.deps.modelRouter.pickModel("analytics"),
      messages: [{ role: "system", content: systemPrompt }, ...buildAnalyticsNarrationPrompt(analyticsText, request)]
    });

    return response.message.content || analyticsText;
  }

  private async handleSearch(message: MessageEnvelope, request: string, systemPrompt: string) {
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
      model: this.deps.modelRouter.pickModel("search"),
      messages: [
        { role: "system", content: `${systemPrompt}\n\nЕсли нужен интернет, сначала вызывай инструменты.` },
        { role: "user", content: request }
      ],
      tools,
      maxToolCalls: this.deps.env.LLM_MAX_TOOL_CALLS
    });

    if (run.toolCalls.length === 0) {
      return { text: run.text, toolNames: [], usedSearch: false };
    }

    const searchCalls = run.toolCalls.filter((call) => call.toolName === "web_search");
    const searchHits = searchCalls.flatMap((call) => call.output as SearchHit[]);
    const finalPrompt = buildSearchPrompt(request, buildSourceDigest(request, searchHits, fetchedPages));
    finalPrompt[0].content = `${systemPrompt}\n\n${finalPrompt[0].content}`;

    const response = await this.deps.llmClient.chat({
      model: this.deps.modelRouter.pickModel("search"),
      messages: finalPrompt
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

  private async handleRewrite(message: MessageEnvelope, cleanedContent: string, systemPrompt: string) {
    const source = message.replyToMessageId ? await this.deps.prisma.message.findUnique({ where: { id: message.replyToMessageId } }) : null;

    if (!source) {
      return "Если хочешь переписать текст, ответь реплаем на него.";
    }

    const prompt = buildRewritePrompt(source.content, cleanedContent);
    prompt[0].content = `${systemPrompt}\n\n${prompt[0].content}`;

    const response = await this.deps.llmClient.chat({
      model: this.deps.modelRouter.pickModel("rewrite"),
      messages: prompt
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
    try {
      return await this.deps.embeddingAdapter.embedOne(text);
    } catch (error) {
      this.deps.logger.warn({ error }, "failed to build embedding");
      return undefined;
    }
  }

  private async finish(trace: BotTrace, startedAt: number, reply?: string, message?: MessageEnvelope) {
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
