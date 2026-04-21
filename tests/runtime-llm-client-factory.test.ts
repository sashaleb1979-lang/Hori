import { describe, expect, it, vi } from "vitest";

import { loadEnv } from "@hori/config";
import { createRuntimeLlmClient } from "@hori/core";
import { AiRouterClient, OpenAIClient } from "@hori/llm";

describe("createRuntimeLlmClient", () => {
  it("uses OpenAI only when LLM_PROVIDER=openai", () => {
    const env = loadEnv({
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/hori",
      REDIS_URL: "redis://localhost:6379",
      LLM_PROVIDER: "openai",
      OPENAI_API_KEY: "openai-key"
    });

    const result = createRuntimeLlmClient(env, createLogger(), createRuntimeConfigStub(), "worker");

    expect(result.mode).toBe("openai");
    expect(result.client).toBeInstanceOf(OpenAIClient);
  });

  it("uses the AI router in worker mode even when OPENAI_API_KEY exists", () => {
    const env = loadEnv({
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/hori",
      REDIS_URL: "redis://localhost:6379",
      LLM_PROVIDER: "router",
      OPENAI_API_KEY: "openai-key",
      GOOGLE_API_KEY: "google-key"
    });

    const result = createRuntimeLlmClient(env, createLogger(), createRuntimeConfigStub(), "worker");

    expect(result.mode).toBe("router");
    expect(result.client).toBeInstanceOf(AiRouterClient);
  });

  it("converts legacy ollama runtime to the shared router policy", () => {
    const env = loadEnv({
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/hori",
      REDIS_URL: "redis://localhost:6379",
      LLM_PROVIDER: "ollama",
      OPENAI_API_KEY: "openai-key"
    });

    const result = createRuntimeLlmClient(env, createLogger(), createRuntimeConfigStub(), "bot");

    expect(result.mode).toBe("router");
    expect(result.client).toBeInstanceOf(AiRouterClient);
    expect((env as { LLM_PROVIDER?: string }).LLM_PROVIDER).toBe("router");
  });
});

function createRuntimeConfigStub() {
  return {
    getAiRouterState: vi.fn(),
    setAiRouterState: vi.fn(),
    updateAiRouterState: vi.fn()
  } as never;
}

function createLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  } as never;
}