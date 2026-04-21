import { beforeEach, describe, expect, it, vi } from "vitest";

import { defaultRuntimeTuning, type AppEnv } from "@hori/config";

const { memoryFormationCtor, runFormation } = vi.hoisted(() => {
  const runFormationMock = vi.fn(async () => undefined);
  const ctor = vi.fn().mockImplementation(() => ({ runFormation: runFormationMock }));

  return {
    memoryFormationCtor: ctor,
    runFormation: runFormationMock
  };
});

vi.mock("@hori/memory", () => ({
  MemoryFormationService: memoryFormationCtor
}));

import { createProfileJob } from "../apps/worker/src/jobs/profiles";

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
  OPENAI_EMBED_DIMENSIONS: 768,
  BRAVE_SEARCH_API_KEY: undefined,
  CFG: undefined,
  QUIET_HOURS_ENABLED: true
} as AppEnv;

describe("createProfileJob", () => {
  beforeEach(() => {
    memoryFormationCtor.mockClear();
    runFormation.mockClear();
  });

  it("passes runtime embedding dimensions into memory formation", async () => {
    const runtimeSettings = {
      modelRouting: { slots: { memory: "gpt-5.4-nano" } },
      openaiEmbedDimensions: 512,
    };
    const runtime = {
      env,
      logger: { warn: vi.fn() },
      runtimeConfig: {
        getRuntimeSettings: vi.fn(async () => runtimeSettings)
      },
      analytics: {
        getUserStats: vi.fn(async () => ({ totalMessages: 60, avgMessageLength: 22, totalReplies: 8, totalMentions: 4 }))
      },
      profileService: {
        isEligible: vi.fn(() => true),
        getProfile: vi.fn(async () => null),
        shouldRefreshProfile: vi.fn(() => true),
        getRecentMessagesForProfile: vi.fn(async () => [
          { channelId: "channel-1", content: "меня игнорят и я не понимаю что ответить" },
          { channelId: "channel-1", content: "не спамь мне" }
        ]),
        upsertProfile: vi.fn(async () => undefined)
      },
      llmClient: {
        chat: vi.fn(async () => ({
          message: {
            role: "assistant" as const,
            content: JSON.stringify({ summaryShort: "короткий профиль", styleTags: [], topicTags: [], confidenceScore: 0.91 })
          }
        }))
      },
      modelRouter: {
        pickModel: vi.fn(() => "gpt-5.4-nano"),
        pickModelForSlot: vi.fn(() => "gpt-5.4-nano"),
        pickEmbeddingModel: vi.fn(() => ({ model: "text-embedding-3-small", dimensions: 512 }))
      },
      prisma: {},
      redis: {
        del: vi.fn(async () => 1)
      },
      retrievalService: {},
      summaryService: {
        getRecentSummaries: vi.fn(async () => [])
      }
    } as never;

    const handler = createProfileJob(runtime);
    await handler({ data: { guildId: "guild-1", userId: "user-1" }, id: "job-1" } as never);

    expect(runtime.modelRouter.pickEmbeddingModel).toHaveBeenCalledWith({ dimensions: 512 });
    expect(memoryFormationCtor).toHaveBeenCalledWith(
      runtime.prisma,
      runtime.retrievalService,
      runtime.llmClient,
      expect.objectContaining({
        OLLAMA_FAST_MODEL: "gpt-5.4-nano",
        OLLAMA_SMART_MODEL: "gpt-5.4-nano"
      }),
      "text-embedding-3-small",
      512
    );
    expect(runFormation).toHaveBeenCalledTimes(1);
  });
});import { beforeEach, describe, expect, it, vi } from "vitest";

import { defaultRuntimeTuning, type AppEnv } from "@hori/config";
import { ModelRouter, resolveModelRouting } from "@hori/llm";

const { memoryFormationCtor, runFormation, MockMemoryFormationService } = vi.hoisted(() => {
  const runFormation = vi.fn(async () => ({
    extractedFacts: 0,
    added: 0,
    updated: 0,
    deleted: 0,
    skipped: 0,
    compactedSummary: "",
    facts: [],
    actions: []
  }));
  const memoryFormationCtor = vi.fn();

  class MockMemoryFormationService {
    runFormation = runFormation;

    constructor(...args: unknown[]) {
      memoryFormationCtor(...args);
    }
  }

  return { memoryFormationCtor, runFormation, MockMemoryFormationService };
});

vi.mock("@hori/memory", () => ({
  MemoryFormationService: MockMemoryFormationService
}));

import { createProfileJob } from "../apps/worker/src/jobs/profiles";

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
  OPENAI_EMBED_DIMENSIONS: 768,
  BRAVE_SEARCH_API_KEY: undefined,
  CFG: undefined
} as AppEnv;

describe("profile job", () => {
  beforeEach(() => {
    memoryFormationCtor.mockClear();
    runFormation.mockClear();
  });

  it("passes runtime embedding dimensions into memory formation follow-up", async () => {
    const runtimeSettings = {
      modelRouting: resolveModelRouting(env, undefined, { openaiEmbedDimensions: 1536 }),
      openaiEmbedDimensions: 1536
    };
    const runtime = {
      env,
      analytics: {
        getUserStats: vi.fn(async () => ({
          totalMessages: 120,
          avgMessageLength: 48,
          totalReplies: 30,
          totalMentions: 12
        }))
      },
      profileService: {
        isEligible: vi.fn(() => true),
        getProfile: vi.fn(async () => null),
        shouldRefreshProfile: vi.fn(() => true),
        getRecentMessagesForProfile: vi.fn(async () => [
          {
            channelId: "channel-1",
            content: "меня игнорят и я не понимаю что делать"
          }
        ]),
        upsertProfile: vi.fn(async () => undefined)
      },
      runtimeConfig: {
        getRuntimeSettings: vi.fn(async () => runtimeSettings)
      },
      llmClient: {
        chat: vi.fn(async () => ({
          message: {
            role: "assistant" as const,
            content: JSON.stringify({
              summaryShort: "короткий профиль",
              styleTags: ["dry"],
              topicTags: ["chat"],
              confidenceScore: 0.82
            })
          }
        }))
      },
      modelRouter: new ModelRouter(env),
      redis: {
        del: vi.fn(async () => 1)
      },
      summaryService: {
        getRecentSummaries: vi.fn(async () => [])
      },
      prisma: {},
      retrievalService: {},
      logger: {
        warn: vi.fn()
      }
    } as never;

    const job = createProfileJob(runtime);

    await job({
      id: "profile-job-1",
      data: {
        guildId: "guild-1",
        userId: "user-1"
      }
    } as never);

    expect(memoryFormationCtor).toHaveBeenCalledTimes(1);
    expect(memoryFormationCtor).toHaveBeenCalledWith(
      runtime.prisma,
      runtime.retrievalService,
      runtime.llmClient,
      expect.objectContaining({
        OLLAMA_FAST_MODEL: runtime.modelRouter.pickModelForSlot("memory", runtimeSettings.modelRouting),
        OLLAMA_SMART_MODEL: runtime.modelRouter.pickModelForSlot("memory", runtimeSettings.modelRouting)
      }),
      "text-embedding-3-small",
      1536
    );
    expect(runFormation).toHaveBeenCalledTimes(1);
  });
});