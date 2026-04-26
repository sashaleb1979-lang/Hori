import { describe, expect, it, vi } from "vitest";

import { defaultRuntimeTuning, type AppEnv } from "@hori/config";
import { ChatOrchestrator } from "@hori/core";
import { ModelRouter, resolveModelRouting } from "@hori/llm";
import type { ContextBundle, FeatureFlags, MessageEnvelope, PersonaSettings } from "@hori/shared";

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
  OPENAI_CHAT_MODEL: "gpt-4o-mini",
  OPENAI_SMART_MODEL: "gpt-4o-mini",
  OPENAI_EMBED_MODEL: "text-embedding-3-small",
  BRAVE_SEARCH_API_KEY: undefined,
  CFG: undefined,
  QUIET_HOURS_ENABLED: true
} as AppEnv;

const featureFlags: FeatureFlags = {
  webSearch: false,
  autoInterject: false,
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
  llmMaxContextMessages: 12,
  contextMaxChars: 1500,
  llmReplyMaxTokens: 240,
  defaultReplyMaxChars: 1000,
  ollamaKeepAlive: "5m",
  ollamaNumCtx: 4096,
  ollamaNumBatch: 256,
  mediaAutoGlobalCooldownSec: 7200,
  mediaAutoMinConfidence: 0.82,
  mediaAutoMinIntensity: 0.62,
  memoryMode: "OFF",
  relationshipGrowthMode: "OFF",
  stylePresetMode: "manual_only",
  maxTimeoutMinutes: 15
} as const;

const emptyContext: ContextBundle = {
  recentMessages: [],
  summaries: [],
  serverMemories: [],
  userProfile: null,
  relationship: null
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
  const chat = vi.fn(async (options: { format?: "json"; messages?: Array<{ role: string; content: string }> }) => {
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
    runtimeConfig: {},
    ...overrides
  };

  return {
    orchestrator: new ChatOrchestrator(deps as unknown as ChatOrchestratorDeps),
    chat
  };
}

describe("chat orchestrator quiet hours", () => {
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
    expect(result.trace.llmCalls?.some((call) => call.purpose === "chat")).toBe(true);
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
    expect(result.trace.llmCalls?.some((call) => call.purpose === "chat")).toBe(true);
  });

  it("assembles V5 chat messages from stable prompt, restored context and real turns", async () => {
    const context = {
      ...emptyContext,
      recentMessages: [
        { id: "other-1", author: "other", userId: "user-2", content: "это чужой диалог", createdAt: new Date("2026-04-19T04:18:00.000Z") },
        { id: "user-1", author: "tester", userId: "user-1", content: "привет", createdAt: new Date("2026-04-19T04:19:00.000Z") },
        { id: "bot-1", author: "hori", userId: "bot-1", isBot: true, content: "привет.", createdAt: new Date("2026-04-19T04:19:30.000Z") },
        { id: "user-2", author: "tester", userId: "user-1", content: "вчера было странно", createdAt: new Date("2026-04-19T04:20:00.000Z") },
        { id: "bot-2", author: "hori", userId: "bot-1", isBot: true, content: "бывает.", createdAt: new Date("2026-04-19T04:20:20.000Z") }
      ]
    } satisfies ContextBundle;

    const restoredContextPrisma = {
      moderatorPreference: { findUnique: vi.fn(async () => null) },
      botEventLog: { create: vi.fn(async () => ({})) },
      horiRestoredContext: {
        findUnique: vi.fn(async () => ({
          id: "restored-1",
          expiresAt: new Date(Date.now() + 60_000),
          consumedAt: null,
          memoryCard: {
            title: "Старый разговор",
            summary: ["Пользователь вчера устал и слился с дел."],
            details: ["Сработало, когда всё дробили на один шаг."],
            openQuestions: ["Осталась ли та же проблема сегодня?"],
            active: true
          }
        })),
        update: vi.fn(async () => ({}))
      }
    };

    const { orchestrator, chat } = createOrchestrator({
      contextService: { buildContext: vi.fn(async () => context) } as never,
      prisma: restoredContextPrisma as never
    });

    await orchestrator.handleMessage(baseMessage({
      content: "и что теперь",
      replyToMessageId: "bot-2",
      triggerSource: "reply",
      mentionsBotByName: false
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

    const llmChatCall = chat.mock.calls.find((call) => !call[0].format)?.[0];
    const messages = llmChatCall?.messages ?? [];

    expect(messages).toHaveLength(8);
    expect(messages[0]).toEqual(expect.objectContaining({ role: "system" }));
    expect(messages[0].content).toContain("Ты Хори. Ты русскоязычный Discord-бот.");
    expect(messages[1]).toEqual(expect.objectContaining({ role: "system" }));
    expect(messages[1].content).toContain("Восстановленный контекст:");
    expect(messages[2]).toEqual({ role: "user", content: "привет" });
    expect(messages[3]).toEqual({ role: "assistant", content: "привет." });
    expect(messages[4]).toEqual({ role: "user", content: "вчера было странно" });
    expect(messages[5]).toEqual({ role: "assistant", content: "бывает." });
    expect(messages[6]).toEqual(expect.objectContaining({ role: "system" }));
    expect(messages[6].content).toContain("Turn instruction:");
    expect(messages[7]).toEqual({ role: "user", content: "и что теперь" });
    expect(messages.some((entry: { content: string }) => entry.content.includes("[BACKGROUND CONTEXT - calibration only]"))).toBe(false);
  });
});
