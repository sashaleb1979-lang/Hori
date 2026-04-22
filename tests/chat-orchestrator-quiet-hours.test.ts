import { describe, expect, it, vi } from "vitest";

import { defaultRuntimeTuning, type AppEnv } from "@hori/config";
import { ChatOrchestrator } from "@hori/core";
import { ModelRouter, resolveModelRouting } from "@hori/llm";
import type { ContextBundle, ContextBundleV2, FeatureFlags, MessageEnvelope, PersonaSettings } from "@hori/shared";

type ChatOrchestratorDeps = ConstructorParameters<typeof ChatOrchestrator>[0];

const env = {
  ...defaultRuntimeTuning,
  NODE_ENV: "test",
  LOG_LEVEL: "info",
  DISCORD_OWNER_IDS: [],
  BOT_NAME: "Хори",
  BOT_DEFAULT_LANGUAGE: "ru",
  API_HOST: "0.0.0.0",
  API_PORT: 3000,
  API_ADMIN_TOKEN: "test",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/hori",
  REDIS_URL: "redis://localhost:6379",
  LLM_PROVIDER: "openai",
  OLLAMA_BASE_URL: undefined,
  OLLAMA_FAST_MODEL: "fast",
  OLLAMA_SMART_MODEL: "smart",
  OLLAMA_EMBED_MODEL: "embed",
  OLLAMA_TIMEOUT_MS: 45000,
  OLLAMA_LOG_TRAFFIC: false,
  OLLAMA_LOG_PROMPTS: false,
  OLLAMA_LOG_RESPONSES: false,
  OLLAMA_LOG_MAX_CHARS: 12000,
  OPENAI_API_KEY: "test",
  OPENAI_CHAT_MODEL: "gpt-5.4-nano",
  OPENAI_SMART_MODEL: "gpt-5.4-nano",
  OPENAI_EMBED_MODEL: "text-embedding-3-small",
  BRAVE_SEARCH_API_KEY: undefined,
  CFG: undefined,
  QUIET_HOURS_ENABLED: true
} as AppEnv;

const featureFlags: FeatureFlags = {
  webSearch: false,
  autoInterject: false,
  emotionalAdviceAnchorsEnabled: true,
  userProfiles: false,
  contextActions: false,
  roast: true,
  contextV2Enabled: false,
  contextConfidenceEnabled: false,
  topicEngineEnabled: false,
  affinitySignalsEnabled: false,
  moodEngineEnabled: false,
  replyQueueEnabled: false,
  mediaReactionsEnabled: false,
  runtimeConfigCacheEnabled: false,
  embeddingCacheEnabled: false,
  channelAwareMode: false,
  messageKindAwareMode: true,
  antiSlopStrictMode: true,
  playfulModeEnabled: true,
  irritatedModeEnabled: true,
  ideologicalFlavourEnabled: false,
  analogyBanEnabled: false,
  slangLayerEnabled: false,
  selfInterjectionConstraintsEnabled: false,
  memoryAlbumEnabled: false,
  interactionRequestsEnabled: false,
  linkUnderstandingEnabled: false,
  naturalMessageSplittingEnabled: false,
  selectiveEngagementEnabled: false,
  selfReflectionLessonsEnabled: false
};

const guildSettings: PersonaSettings = {
  botName: "Хори",
  preferredLanguage: "ru",
  roughnessLevel: 2,
  sarcasmLevel: 2,
  roastLevel: 2,
  interjectTendency: 1,
  replyLength: "short",
  preferredStyle: "коротко, сухо, по делу",
  forbiddenWords: [],
  forbiddenTopics: []
};

const runtimeSettings = {
  powerProfile: "balanced",
  modelRouting: resolveModelRouting(env),
  openaiEmbedDimensions: 768,
  memoryHydeEnabled: true,
  llmMaxContextMessages: 12,
  contextMaxChars: 1500,
  llmReplyMaxTokens: 240,
  defaultReplyMaxChars: 1000,
  ollamaKeepAlive: "5m",
  ollamaNumCtx: 4096,
  ollamaNumBatch: 256,
  mediaAutoGlobalCooldownSec: 7200,
  mediaAutoMinConfidence: 0.82,
  mediaAutoMinIntensity: 0.62
} as const;

const emptyContext: ContextBundle = {
  recentMessages: [],
  summaries: [],
  serverMemories: [],
  userProfile: null,
  relationship: null
};

const emptyContextV2: ContextBundleV2 = {
  version: "v2",
  recentMessages: [],
  summaries: [],
  serverMemories: [],
  userProfile: null,
  relationship: null,
  replyChain: [],
  repliedMessageId: null,
  activeTopic: null,
  topicWindow: [],
  entities: [],
  entityMemories: []
};

function baseMessage(overrides: Partial<MessageEnvelope> = {}): MessageEnvelope {
  return {
    messageId: "message-1",
    guildId: "guild-1",
    channelId: "channel-1",
    userId: "user-1",
    username: "tester",
    displayName: "Tester",
    channelName: "general",
    content: "хори привет",
    createdAt: new Date("2026-04-19T04:22:00.000Z"),
    replyToMessageId: null,
    mentionCount: 0,
    mentionedBot: false,
    mentionsBotByName: true,
    mentionedUserIds: [],
    triggerSource: "name",
    isModerator: false,
    explicitInvocation: true,
    ...overrides
  };
}

function createOrchestrator(overrides: Partial<ChatOrchestratorDeps> = {}) {
  const chat = vi.fn(async (options: { format?: "json" }) => {
    if (options.format === "json") {
      return {
        message: {
          role: "assistant" as const,
          content: JSON.stringify({ intent: "chat", confidence: 0.95, reason: "test classifier" })
        },
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }
      };
    }

    return {
      message: { role: "assistant" as const, content: "нормальный ответ" },
      usage: { promptTokens: 20, completionTokens: 7, totalTokens: 27 }
    };
  });

  const deps = {
    env,
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    },
    prisma: {
      moderatorPreference: { findUnique: vi.fn(async () => null) },
      botEventLog: { create: vi.fn(async () => ({})) }
    },
    analytics: {},
    contextService: { buildContext: vi.fn(async () => emptyContext) },
    retrieval: {},
    llmClient: { chat, embed: vi.fn() },
    modelRouter: new ModelRouter(env),
    toolOrchestrator: {},
    searchClient: {},
    embeddingAdapter: { embedOne: vi.fn(async () => [0.1, 0.2, 0.3]) },
    runtimeConfig: {}
  };

  Object.assign(deps, overrides);

  return {
    orchestrator: new ChatOrchestrator(deps as unknown as ChatOrchestratorDeps),
    chat,
    deps
  };
}

describe("chat orchestrator quiet hours", () => {
  it("keeps the tighter chat profile even when chat escalates to contour C", async () => {
    const { orchestrator, chat } = createOrchestrator();

    const result = await orchestrator.handleMessage(baseMessage({
      content: "хори объясни почему так",
      createdAt: new Date("2026-04-19T09:22:00.000Z")
    }), {
      guildSettings,
      featureFlags,
      channelPolicy: {
        allowBotReplies: true,
        allowInterjections: false,
        isMuted: false,
        topicInterestTags: [],
        responseLengthOverride: null
      },
      runtimeSettings
    });

    expect(result.trace.responseBudget).toBeDefined();
    expect(result.trace.responseBudget?.contour).toBe("C");
    expect(result.trace.modelKind).toBe("fast");
    expect(result.trace.llmCalls?.some((call) => call.purpose === "chat" && call.temperature === 0.38 && call.topP === 0.85)).toBe(true);

    const chatCall = chat.mock.calls
      .map(([options]) => options)
      .find((options) => options.metadata?.purpose === "chat");

    expect(chatCall?.metadata?.complexityHint).toBeUndefined();
  });

  it("routes direct name invocations through chat LLM during quiet hours", async () => {
    const { orchestrator, chat } = createOrchestrator();

    const result = await orchestrator.handleMessage(baseMessage(), {
      guildSettings,
      featureFlags,
      channelPolicy: {
        allowBotReplies: true,
        allowInterjections: false,
        isMuted: false,
        topicInterestTags: [],
        responseLengthOverride: null
      },
      runtimeSettings
    });

    expect(result.reply).toBe("нормальный ответ");
    expect(result.trace.responseBudget).toBeDefined();
    expect(result.trace.responseBudget?.contour).toBe("B");
    expect(result.trace.responseBudget?.reason).not.toBe("quiet_hours:auto_interject");
    expect(result.trace.llmCalls?.some((call) => call.purpose === "chat" && call.model === "gpt-5.4-nano")).toBe(true);
    expect(chat).toHaveBeenCalledTimes(2);
  });

  it("routes replies to Hori through chat LLM during quiet hours", async () => {
    const { orchestrator } = createOrchestrator();

    const result = await orchestrator.handleMessage(baseMessage({
      content: "как дела расскажи",
      replyToMessageId: "bot-message-1",
      mentionsBotByName: false,
      triggerSource: "reply"
    }), {
      guildSettings,
      featureFlags,
      channelPolicy: {
        allowBotReplies: true,
        allowInterjections: false,
        isMuted: false,
        topicInterestTags: [],
        responseLengthOverride: null
      },
      runtimeSettings
    });

    expect(result.reply).toBe("нормальный ответ");
    expect(result.trace.responseBudget).toBeDefined();
    expect(result.trace.responseBudget?.contour).toBe("B");
    expect(result.trace.llmCalls?.some((call) => call.purpose === "chat" && call.model === "gpt-5.4-nano")).toBe(true);
  });

  it("short-circuits hostile meta replies before the normal chat path", async () => {
    const relationships = {
      recordInteraction: vi.fn(async () => undefined),
      recordToxicBehavior: vi.fn(async () => undefined)
    };
    const { orchestrator, chat } = createOrchestrator({ relationships: relationships as never });

    const result = await orchestrator.handleMessage(baseMessage({
      content: "ты галлюцинируешь",
      explicitInvocation: false,
      mentionsBotByName: false,
      mentionedBot: false,
      triggerSource: "reply",
      replyToMessageId: "bot-message-1"
    }), {
      guildSettings,
      featureFlags,
      channelPolicy: {
        allowBotReplies: true,
        allowInterjections: false,
        isMuted: false,
        topicInterestTags: [],
        responseLengthOverride: null
      },
      runtimeSettings
    });

    expect(result.trace.microReaction?.kind).toBe("meta_feedback");
    expect(result.trace.microReaction?.rule).toBe("direct_meta_feedback");
    expect(result.trace.modelKind).toBeUndefined();
    expect(result.trace.llmCalls?.some((call) => call.purpose === "chat")).toBe(false);
    expect(chat.mock.calls.some(([options]) => options.metadata?.purpose === "chat")).toBe(false);
    expect(relationships.recordInteraction.mock.calls.some(([, , sentiment]) => sentiment === 0.22)).toBe(false);
    expect(relationships.recordInteraction.mock.calls.some(([, , sentiment]) => typeof sentiment === "number" && sentiment < 0)).toBe(true);
    expect(relationships.recordToxicBehavior).not.toHaveBeenCalled();
  });

  it("does not pretend contour-A auto-interjects used a chat model", async () => {
    const { orchestrator } = createOrchestrator();

    const result = await orchestrator.handleMessage(baseMessage({
      content: "ну и что думаете?",
      createdAt: new Date("2026-04-19T04:22:00.000Z"),
      explicitInvocation: false,
      mentionsBotByName: false,
      mentionedBot: false,
      triggerSource: "auto_interject"
    }), {
      guildSettings,
      featureFlags,
      channelPolicy: {
        allowBotReplies: true,
        allowInterjections: false,
        isMuted: false,
        topicInterestTags: [],
        responseLengthOverride: null
      },
      runtimeSettings
    });

    expect(result.trace.responseBudget?.contour).toBe("A");
    expect(result.trace.modelKind).toBeUndefined();
    expect(result.trace.llmCalls?.some((call) => call.purpose === "chat")).toBe(false);
  });

  it("caps lightweight direct mentions to a smaller context budget", async () => {
    const contextService = { buildContext: vi.fn(async () => emptyContextV2) };
    const { orchestrator } = createOrchestrator({ contextService });

    const result = await orchestrator.handleMessage(baseMessage({
      content: "хори",
      createdAt: new Date("2026-04-19T10:22:00.000Z")
    }), {
      guildSettings,
      featureFlags: { ...featureFlags, contextV2Enabled: true },
      channelPolicy: {
        allowBotReplies: true,
        allowInterjections: false,
        isMuted: false,
        topicInterestTags: [],
        responseLengthOverride: null
      },
      runtimeSettings
    });

    expect(result.trace.responseBudget?.contour).toBe("B");
    expect(result.trace.context?.truncation?.maxChars).toBe(650);
  });

  it("keeps the full context budget for explicit explanation turns", async () => {
    const contextService = { buildContext: vi.fn(async () => emptyContextV2) };
    const { orchestrator } = createOrchestrator({ contextService });

    const result = await orchestrator.handleMessage(baseMessage({
      content: "хори объясни почему так",
      createdAt: new Date("2026-04-19T10:22:00.000Z")
    }), {
      guildSettings,
      featureFlags: { ...featureFlags, contextV2Enabled: true },
      channelPolicy: {
        allowBotReplies: true,
        allowInterjections: false,
        isMuted: false,
        topicInterestTags: [],
        responseLengthOverride: null
      },
      runtimeSettings
    });

    expect(result.trace.responseBudget?.contour).toBe("C");
    expect(result.trace.context?.truncation?.maxChars).toBe(runtimeSettings.contextMaxChars);
  });

  it("blends HyDE retrieval embedding into context lookup for substantial chat turns", async () => {
    const contextService = { buildContext: vi.fn(async () => emptyContext) };
    const chat = vi.fn(async (options: { format?: "json"; messages?: Array<{ content: string }> }) => {
      if (options.format === "json") {
        return {
          message: {
            role: "assistant" as const,
            content: JSON.stringify({ intent: "chat", confidence: 0.95, reason: "test classifier" })
          },
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }
        };
      }

      const combined = options.messages?.map((message) => message.content).join("\n") ?? "";
      if (combined.includes("memory retrieval")) {
        return {
          message: { role: "assistant" as const, content: "Игнор в переписке, тревога, нужен короткий ясный ответ" },
          usage: { promptTokens: 12, completionTokens: 8, totalTokens: 20 }
        };
      }

      return {
        message: { role: "assistant" as const, content: "нормальный ответ" },
        usage: { promptTokens: 20, completionTokens: 7, totalTokens: 27 }
      };
    });
    const embeddingAdapter = {
      embedOne: vi.fn(async (text: string) => text.includes("Игнор в переписке") ? [3, 3, 3] : [1, 1, 1])
    };
    const { orchestrator, deps } = createOrchestrator({
      contextService,
      llmClient: { chat, embed: vi.fn() } as never,
      embeddingAdapter: embeddingAdapter as never,
    });

    await orchestrator.handleMessage(baseMessage({
      content: "меня игнорят и я не понимаю что ответить человеку",
      createdAt: new Date("2026-04-19T10:22:00.000Z")
    }), {
      guildSettings,
      featureFlags,
      channelPolicy: {
        allowBotReplies: true,
        allowInterjections: false,
        isMuted: false,
        topicInterestTags: [],
        responseLengthOverride: null
      },
      runtimeSettings
    });

    expect(contextService.buildContext).toHaveBeenCalledWith(expect.objectContaining({
      queryEmbedding: [2, 2, 2]
    }));
    expect(deps.llmClient.chat).toHaveBeenCalledTimes(3);
    expect(embeddingAdapter.embedOne).toHaveBeenCalledTimes(2);
  });

  it("skips HyDE expansion when runtime setting disables it", async () => {
    const contextService = { buildContext: vi.fn(async () => emptyContext) };
    const chat = vi.fn(async (options: { format?: "json" }) => {
      if (options.format === "json") {
        return {
          message: {
            role: "assistant" as const,
            content: JSON.stringify({ intent: "chat", confidence: 0.95, reason: "test classifier" })
          },
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }
        };
      }

      return {
        message: { role: "assistant" as const, content: "нормальный ответ" },
        usage: { promptTokens: 20, completionTokens: 7, totalTokens: 27 }
      };
    });
    const embeddingAdapter = {
      embedOne: vi.fn(async () => [1, 1, 1])
    };
    const { orchestrator, deps } = createOrchestrator({
      contextService,
      llmClient: { chat, embed: vi.fn() } as never,
      embeddingAdapter: embeddingAdapter as never,
    });

    await orchestrator.handleMessage(baseMessage({
      content: "меня игнорят и я не понимаю что ответить человеку",
      createdAt: new Date("2026-04-19T10:22:00.000Z")
    }), {
      guildSettings,
      featureFlags,
      channelPolicy: {
        allowBotReplies: true,
        allowInterjections: false,
        isMuted: false,
        topicInterestTags: [],
        responseLengthOverride: null
      },
      runtimeSettings: {
        ...runtimeSettings,
        memoryHydeEnabled: false
      }
    });

    expect(contextService.buildContext).toHaveBeenCalledWith(expect.objectContaining({
      queryEmbedding: [1, 1, 1]
    }));
    expect(deps.llmClient.chat).toHaveBeenCalledTimes(2);
    expect(embeddingAdapter.embedOne).toHaveBeenCalledTimes(1);
  });

  it("skips HyDE expansion for short advice-like messages", async () => {
    const contextService = { buildContext: vi.fn(async () => emptyContext) };
    const chat = vi.fn(async (options: { format?: "json" }) => {
      if (options.format === "json") {
        return {
          message: {
            role: "assistant" as const,
            content: JSON.stringify({ intent: "chat", confidence: 0.95, reason: "test classifier" })
          },
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }
        };
      }

      return {
        message: { role: "assistant" as const, content: "нормальный ответ" },
        usage: { promptTokens: 20, completionTokens: 7, totalTokens: 27 }
      };
    });
    const embeddingAdapter = {
      embedOne: vi.fn(async () => [1, 1, 1])
    };
    const { orchestrator, deps } = createOrchestrator({
      contextService,
      llmClient: { chat, embed: vi.fn() } as never,
      embeddingAdapter: embeddingAdapter as never,
    });

    await orchestrator.handleMessage(baseMessage({
      content: "что делать?",
      createdAt: new Date("2026-04-19T10:22:00.000Z")
    }), {
      guildSettings,
      featureFlags,
      channelPolicy: {
        allowBotReplies: true,
        allowInterjections: false,
        isMuted: false,
        topicInterestTags: [],
        responseLengthOverride: null
      },
      runtimeSettings
    });

    expect(contextService.buildContext).toHaveBeenCalledWith(expect.objectContaining({
      queryEmbedding: [1, 1, 1]
    }));
    expect(deps.llmClient.chat).toHaveBeenCalledTimes(2);
    expect(embeddingAdapter.embedOne).toHaveBeenCalledTimes(1);
  });
});
