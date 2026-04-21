import { describe, expect, it, vi } from "vitest";

import { loadEnv } from "@hori/config";
import {
  AiRouterClient,
  classifyProviderError,
  InMemoryAiRouterStateStore,
  ProviderRequestError,
  type ChatProvider,
  type ChatProviderRequest,
  type NormalizedProviderResponse
} from "@hori/llm";

describe("AiRouterClient", () => {
  it("routes complex requests to Gemini Pro first", async () => {
    const gemini = createMockProvider("gemini", async (request) => successResponse("gemini", request.model, "pro ok"));
    const cloudflare = createMockProvider("cloudflare", async (request) => successResponse("cloudflare", request.model, "cf ok"));
    const github = createMockProvider("github", async (request) => successResponse("github", request.model, "gh ok"));
    const openai = createMockProvider("openai", async (request) => successResponse("openai", request.model, "oa ok"));

    const client = createRouter({ gemini, cloudflare, github, openai });
    const response = await client.chat({
      model: "ignored",
      messages: [{ role: "user", content: "Сравни три архитектурных варианта, распиши trade-offs и предложи лучший с аргументами" }],
      metadata: { requestId: "req-pro-1", userKey: "u:123", complexityHint: "complex" }
    });

    expect(response.routing?.provider).toBe("gemini");
    expect(response.routing?.model).toBe("gemini-2.5-pro");
    expect(gemini.send).toHaveBeenCalledTimes(1);
    expect(gemini.send).toHaveBeenCalledWith(expect.objectContaining({ model: "gemini-2.5-pro" }));
    expect(cloudflare.send).not.toHaveBeenCalled();
    expect(github.send).not.toHaveBeenCalled();
    expect(openai.send).not.toHaveBeenCalled();
  });

  it("falls back from Gemini Pro to Gemini Flash before Cloudflare", async () => {
    const gemini = createMockProvider("gemini", async (request) => {
      if (request.model === "gemini-2.5-pro") {
        throw new ProviderRequestError({
          provider: "gemini",
          status: 429,
          bodyText: "quota exceeded",
          message: "Gemini Pro quota exhausted"
        });
      }

      return successResponse("gemini", request.model, "flash ok");
    });
    const cloudflare = createMockProvider("cloudflare", async (request) => successResponse("cloudflare", request.model, "cf ok"));
    const github = createMockProvider("github", async (request) => successResponse("github", request.model, "gh ok"));
    const openai = createMockProvider("openai", async (request) => successResponse("openai", request.model, "oa ok"));

    const client = createRouter({ gemini, cloudflare, github, openai });
    const response = await client.chat({
      model: "ignored",
      messages: [{ role: "user", content: "Разбери большой спорный кейс и сравни подходы" }],
      metadata: { requestId: "req-pro-2", userKey: "u:123", complexityHint: "complex" }
    });

    expect(response.routing?.provider).toBe("gemini");
    expect(response.routing?.model).toBe("gemini-2.5-flash");
    expect(response.routing?.fallbackDepth).toBe(1);
    expect(response.routing?.routedFrom).toEqual(["gemini:gemini-2.5-pro"]);
    expect(gemini.send).toHaveBeenCalledTimes(2);
    expect(gemini.send).toHaveBeenNthCalledWith(1, expect.objectContaining({ model: "gemini-2.5-pro" }));
    expect(gemini.send).toHaveBeenNthCalledWith(2, expect.objectContaining({ model: "gemini-2.5-flash" }));
    expect(cloudflare.send).not.toHaveBeenCalled();
  });

  it("falls back from Gemini 429 to Cloudflare", async () => {
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
    const response = await client.chat({
      model: "ignored",
      messages: [{ role: "user", content: "коротко ответь" }],
      metadata: { requestId: "req-1", userKey: "u:123", complexityHint: "simple" }
    });

    expect(response.routing?.provider).toBe("cloudflare");
    expect(gemini.send).toHaveBeenCalledTimes(1);
    expect(cloudflare.send).toHaveBeenCalledTimes(1);
    expect(github.send).not.toHaveBeenCalled();
    expect(openai.send).not.toHaveBeenCalled();
  });

  it("falls back from Cloudflare network error to GitHub", async () => {
    const gemini = createMockProvider("gemini", async () => {
      throw new ProviderRequestError({
        provider: "gemini",
        status: 429,
        bodyText: "quota exceeded",
        message: "Gemini quota exhausted"
      });
    });
    const cloudflare = createMockProvider("cloudflare", async () => {
      throw new ProviderRequestError({
        provider: "cloudflare",
        message: "fetch failed"
      });
    });
    const github = createMockProvider("github", async (request) => successResponse("github", request.model, "gh ok"));
    const openai = createMockProvider("openai", async (request) => successResponse("openai", request.model, "oa ok"));

    const client = createRouter({ gemini, cloudflare, github, openai });
    const response = await client.chat({
      model: "ignored",
      messages: [{ role: "user", content: "коротко ответь" }],
      metadata: { requestId: "req-2", userKey: "u:123", complexityHint: "simple" }
    });

    expect(response.routing?.provider).toBe("github");
    expect(github.send).toHaveBeenCalledTimes(1);
    expect(openai.send).not.toHaveBeenCalled();
  });

  it("falls back on plain 500 responses instead of aborting the chain", async () => {
    const gemini = createFailingProvider("gemini", "quota_exhausted");
    const cloudflare = createMockProvider("cloudflare", async () => {
      throw new ProviderRequestError({
        provider: "cloudflare",
        status: 500,
        bodyText: "internal error",
        message: "cloudflare internal error"
      });
    });
    const github = createMockProvider("github", async (request) => successResponse("github", request.model, "gh ok"));
    const openai = createMockProvider("openai", async (request) => successResponse("openai", request.model, "oa ok"));

    const client = createRouter({ gemini, cloudflare, github, openai });
    const response = await client.chat({
      model: "ignored",
      messages: [{ role: "user", content: "коротко ответь" }],
      metadata: { requestId: "req-500", userKey: "u:123", complexityHint: "simple" }
    });

    expect(response.routing?.provider).toBe("github");
    expect(cloudflare.send).toHaveBeenCalledTimes(2);
    expect(github.send).toHaveBeenCalledTimes(1);
  });

  it("falls back on unknown provider errors instead of aborting the chain", async () => {
    const gemini = createFailingProvider("gemini", "quota_exhausted");
    const cloudflare = createMockProvider("cloudflare", async () => {
      throw new Error("unexpected serialization blowup");
    });
    const github = createMockProvider("github", async (request) => successResponse("github", request.model, "gh ok"));
    const openai = createMockProvider("openai", async (request) => successResponse("openai", request.model, "oa ok"));

    const client = createRouter({ gemini, cloudflare, github, openai });
    const response = await client.chat({
      model: "ignored",
      messages: [{ role: "user", content: "коротко ответь" }],
      metadata: { requestId: "req-unknown", userKey: "u:123", complexityHint: "simple" }
    });

    expect(response.routing?.provider).toBe("github");
    expect(cloudflare.send).toHaveBeenCalledTimes(1);
    expect(github.send).toHaveBeenCalledTimes(1);
  });

  it("uses OpenAI when all free providers fail", async () => {
    const gemini = createFailingProvider("gemini", "quota_exhausted");
    const cloudflare = createFailingProvider("cloudflare", "provider_unavailable");
    const github = createFailingProvider("github", "rate_limited");
    const openai = createMockProvider("openai", async (request) => successResponse("openai", request.model, "oa ok"));

    const client = createRouter({ gemini, cloudflare, github, openai });
    const response = await client.chat({
      model: "ignored",
      messages: [{ role: "user", content: "коротко ответь" }],
      metadata: { requestId: "req-3", userKey: "u:123", complexityHint: "simple" }
    });

    expect(response.routing?.provider).toBe("openai");
    expect(openai.send).toHaveBeenCalledTimes(1);
  });

  it("does not crash when GitHub auth is invalid and OpenAI fallback is available", async () => {
    const gemini = createFailingProvider("gemini", "quota_exhausted");
    const cloudflare = createFailingProvider("cloudflare", "network_error");
    const github = createMockProvider("github", async () => {
      throw new ProviderRequestError({
        provider: "github",
        status: 401,
        bodyText: "bad credentials",
        message: "Invalid GitHub token"
      });
    });
    const openai = createMockProvider("openai", async (request) => successResponse("openai", request.model, "oa ok"));

    const client = createRouter({ gemini, cloudflare, github, openai });
    const response = await client.chat({
      model: "ignored",
      messages: [{ role: "user", content: "коротко ответь" }],
      metadata: { requestId: "req-4", userKey: "u:123", complexityHint: "simple" }
    });

    expect(response.routing?.provider).toBe("openai");
    expect(github.send).toHaveBeenCalledTimes(3);
    expect(openai.send).toHaveBeenCalledTimes(1);
  });

  it("reports recent routes and fallback counts in status snapshot", async () => {
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
      metadata: { requestId: "req-status-1", userKey: "u:123", complexityHint: "simple" }
    });

    const snapshot = await client.getStatusSnapshot();

    expect(snapshot.activeOrder[0]).toContain("gemini:gemini-2.5-pro");
    expect(snapshot.recentRoutes.some((entry) => entry.requestId === "req-status-1" && entry.provider === "cloudflare" && entry.success)).toBe(true);
    expect(snapshot.fallbackCounts.cloudflare).toBe(1);
    expect(snapshot.enabledProviders.find((entry) => entry.provider === "gemini")?.enabled).toBe(true);
  });
});

function createRouter(providers: Record<string, ChatProvider>) {
  return createRouterWithEnv({
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/hori",
    REDIS_URL: "redis://localhost:6379",
    AI_PROVIDER: "router",
    GOOGLE_API_KEY: "google-key",
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

describe("AiRouterClient skipped providers", () => {
  it("does not count disabled providers as real fallback depth or fallback totals", async () => {
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
    }, {
      cloudflare,
      github,
      openai
    });

    const response = await client.chat({
      model: "ignored",
      messages: [{ role: "user", content: "коротко ответь" }],
      metadata: { requestId: "req-skip-1", userKey: "u:123", complexityHint: "simple" }
    });

    const snapshot = await client.getStatusSnapshot();

    expect(response.routing?.provider).toBe("cloudflare");
    expect(response.routing?.fallbackDepth).toBe(0);
    expect(response.routing?.routedFrom).toEqual(["gemini:gemini-2.5-flash"]);
    expect(snapshot.fallbackCounts.cloudflare).toBe(0);
    expect(snapshot.recentRoutes.find((entry) => entry.requestId === "req-skip-1" && entry.success)?.fallbackDepth).toBe(0);
  });
});

function createMockProvider(name: string, impl: (request: ChatProviderRequest) => Promise<NormalizedProviderResponse>): ChatProvider & { send: ReturnType<typeof vi.fn> } {
  return {
    name,
    supportsTools: true,
    isAvailable: vi.fn().mockResolvedValue(true),
    send: vi.fn(impl),
    classifyError: (error: unknown) => classifyProviderError(error)
  };
}

function createFailingProvider(name: string, kind: "quota_exhausted" | "provider_unavailable" | "network_error" | "rate_limited") {
  return createMockProvider(name, async () => {
    if (kind === "quota_exhausted") {
      throw new ProviderRequestError({ provider: name, status: 429, bodyText: "quota exceeded", message: `${name} quota exhausted` });
    }
    if (kind === "rate_limited") {
      throw new ProviderRequestError({ provider: name, status: 429, bodyText: "slow down", message: `${name} rate limited` });
    }
    if (kind === "network_error") {
      throw new ProviderRequestError({ provider: name, message: "fetch failed" });
    }
    throw new ProviderRequestError({ provider: name, status: 503, bodyText: "unavailable", message: `${name} unavailable` });
  });
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