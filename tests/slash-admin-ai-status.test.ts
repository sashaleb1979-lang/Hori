import { describe, expect, it, vi } from "vitest";

import { loadEnv } from "@hori/config";
import {
  AiRouterClient,
  InMemoryAiRouterStateStore,
  ProviderRequestError,
  type ChatProvider,
  type ChatProviderRequest,
  type NormalizedProviderResponse
} from "@hori/llm";
import type { AppPrismaClient } from "@hori/shared";

import { SlashAdminService } from "../packages/core/src/services/slash-admin-service";

describe("SlashAdminService aiStatus", () => {
  it("formats provider status, cooldowns and recent routes for the owner surface", async () => {
    const gemini = createMockProvider("gemini", async () => {
      throw new ProviderRequestError({
        provider: "gemini",
        status: 429,
        bodyText: "quota exceeded",
        message: "Gemini rate limited"
      });
    });
    const cloudflare = createMockProvider("cloudflare", async (request) => successResponse("cloudflare", request.model, "cf ok"));
    const github = createMockProvider("github", async (request) => successResponse("github", request.model, "gh ok"));
    const openai = createMockProvider("openai", async (request) => successResponse("openai", request.model, "oa ok"));

    const client = createRouter({ gemini, cloudflare, github, openai });
    await client.chat({
      model: "ignored",
      messages: [{ role: "user", content: "коротко ответь" }],
      metadata: { requestId: "req-ai-status", userKey: "u:123", complexityHint: "complex" }
    });

    const service = new SlashAdminService(
      {} as AppPrismaClient,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      client
    );

    const result = await service.aiStatus();

    expect(result).toContain("AI router status");
    expect(result).toContain("Order:");
    expect(result).toContain("deepseek:off(missing:DEEPSEEK_API_KEY)");
    expect(result).toContain("gemini:on");
    expect(result).toContain("cloudflare:on");
    expect(result).toContain("Embeddings: openai:on text-embedding-3-small dim=768");
    expect(result).toContain("Cooldowns: ");
    expect(result).toContain("gemini:gemini-2.5-flash");
    expect(result).toContain("Gemini: flash 0/250, pro 0/100");
    expect(result).toContain("Fallbacks: gemini=0 | cloudflare=1");
    expect(result).toContain("Recent routes:");
    expect(result).toContain("ok cloudflare/@cf/zai-org/glm-4.7-flash");
  });

  it("does not report skipped providers as real fallback in the owner status", async () => {
    const cloudflare = createMockProvider("cloudflare", async (request) => successResponse("cloudflare", request.model, "cf ok"));
    const github = createMockProvider("github", async (request) => successResponse("github", request.model, "gh ok"));
    const openai = createMockProvider("openai", async (request) => successResponse("openai", request.model, "oa ok"));

    const client = createRouterWithEnv({
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/hori",
      REDIS_URL: "redis://localhost:6379",
      AI_PROVIDER: "router",
      CF_ACCOUNT_ID: "cf-account",
      CF_API_TOKEN: "cf-token",
      GITHUB_TOKEN: "gh-token",
      OPENAI_API_KEY: "openai-key"
    }, { cloudflare, github, openai });

    await client.chat({
      model: "ignored",
      messages: [{ role: "user", content: "коротко ответь" }],
      metadata: { requestId: "req-ai-status-skip", userKey: "u:123", complexityHint: "simple" }
    });

    const service = new SlashAdminService(
      {} as AppPrismaClient,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      client
    );

    const result = await service.aiStatus();

    expect(result).toContain("deepseek:off(missing:DEEPSEEK_API_KEY)");
    expect(result).toContain("gemini:off(missing:GOOGLE_API_KEY)");
    expect(result).toContain("Fallbacks: cloudflare=0");
    expect(result).toContain("ok openai/gpt-5-nano d0");
  });
});

function createRouter(providers: Record<string, ChatProvider>) {
  return createRouterWithEnv({
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/hori",
    REDIS_URL: "redis://localhost:6379",
    AI_PROVIDER: "router",
    GOOGLE_API_KEY: "google-key",
    AI_ROUTER_GEMINI_FLASH_DAILY_LIMIT: "250",
    AI_ROUTER_GEMINI_PRO_DAILY_LIMIT: "100",
    CF_ACCOUNT_ID: "cf-account",
    CF_API_TOKEN: "cf-token",
    GITHUB_TOKEN: "gh-token",
    OPENAI_API_KEY: "openai-key"
  }, providers);
}

function createRouterWithEnv(envInput: Record<string, string>, providers: Record<string, ChatProvider>) {
  const env = loadEnv({
    ...envInput
  });

  return new AiRouterClient(env, createLogger(), {
    stateStore: new InMemoryAiRouterStateStore(),
    providers: providers as never,
    embedClient: { embed: vi.fn(), chat: vi.fn() } as never
  });
}

function createMockProvider(name: string, impl: (request: ChatProviderRequest) => Promise<NormalizedProviderResponse>): ChatProvider & { send: ReturnType<typeof vi.fn> } {
  return {
    name,
    supportsTools: true,
    isAvailable: vi.fn().mockResolvedValue(true),
    send: vi.fn(impl),
    classifyError: (error: unknown) => {
      if (error instanceof ProviderRequestError) {
        const body = `${error.message}\n${error.bodyText ?? ""}`.toLowerCase();
        if (error.status === 429 && body.includes("quota")) {
          return {
            class: "quota_exhausted" as const,
            message: error.message,
            status: error.status,
            provider: error.provider,
            retryAfterMs: error.retryAfterMs,
            fallbackImmediately: true,
            retryOnce: false,
            setCooldown: true,
            alertInLogs: true
          };
        }
      }

      return {
        class: "unknown" as const,
        message: error instanceof Error ? error.message : String(error),
        fallbackImmediately: true,
        retryOnce: false,
        setCooldown: false,
        alertInLogs: true
      };
    }
  };
}

function successResponse(provider: string, model: string, content: string): NormalizedProviderResponse {
  return {
    provider,
    model,
    content,
    latencyMs: 25,
    finishReason: "stop",
    rawUsage: {
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15
    }
  };
}

function createLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  } as never;
}
