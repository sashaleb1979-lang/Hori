import { afterEach, describe, expect, it, vi } from "vitest";

import { assertEnvForRole, getEnabledAiRouterProviders, loadEnv, resolveAiRouterEnvState } from "@hori/config";

describe("loadEnv", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("applies defaults for omitted boolean and numeric env vars", () => {
    const env = loadEnv({
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/hori",
      REDIS_URL: "redis://localhost:6379",
      OLLAMA_BASE_URL: "http://localhost:11434"
    });

    expect(env.FEATURE_WEB_SEARCH).toBe(true);
    expect(env.FEATURE_AUTOINTERJECT).toBe(false);
    expect(env.FEATURE_EMOTIONAL_ADVICE_ANCHORS_ENABLED).toBe(true);
    expect(env.OLLAMA_FAST_MODEL).toBe("qwen3.5:9b");
    expect(env.OLLAMA_SMART_MODEL).toBe("qwen3.5:9b");
    expect(env.LLM_MAX_CONTEXT_MESSAGES).toBe(12);
    expect(env.USER_PROFILE_MIN_MESSAGES).toBe(50);
  });

  it("parses boolish and intish values explicitly", () => {
    const env = loadEnv({
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/hori",
      REDIS_URL: "redis://localhost:6379",
      OLLAMA_BASE_URL: "http://localhost:11434",
      FEATURE_WEB_SEARCH: "false",
      FEATURE_AUTOINTERJECT: "1",
      LLM_MAX_CONTEXT_MESSAGES: "12"
    });

    expect(env.FEATURE_WEB_SEARCH).toBe(false);
    expect(env.FEATURE_AUTOINTERJECT).toBe(true);
    expect(env.LLM_MAX_CONTEXT_MESSAGES).toBe(12);
  });

  it("supports short Railway aliases and compact CFG overrides", () => {
    const env = loadEnv({
      BOT_TOKEN: "discord-token",
      BOT_ID: "discord-client-id",
      DB_URL: "postgresql://postgres:postgres@localhost:5432/hori",
      KV_URL: "redis://localhost:6379",
      AI_URL: "http://localhost:11434",
      BRAVE_KEY: "brave-key",
      CFG: JSON.stringify({
        features: {
          webSearch: false,
          roast: false,
          emotionalAdviceAnchorsEnabled: false
        },
        llm: {
          contextMessages: 16
        },
        profiles: {
          minMessages: 80
        },
        search: {
          maxRequests: 1,
          maxPages: 2
        }
      })
    });

    expect(env.DISCORD_TOKEN).toBe("discord-token");
    expect(env.DISCORD_CLIENT_ID).toBe("discord-client-id");
    expect(env.DATABASE_URL).toBe("postgresql://postgres:postgres@localhost:5432/hori");
    expect(env.REDIS_URL).toBe("redis://localhost:6379");
    expect(env.OLLAMA_BASE_URL).toBe("http://localhost:11434");
    expect(env.BRAVE_SEARCH_API_KEY).toBe("brave-key");
    expect(env.FEATURE_WEB_SEARCH).toBe(false);
    expect(env.FEATURE_ROAST).toBe(false);
    expect(env.FEATURE_EMOTIONAL_ADVICE_ANCHORS_ENABLED).toBe(false);
    expect(env.LLM_MAX_CONTEXT_MESSAGES).toBe(16);
    expect(env.USER_PROFILE_MIN_MESSAGES).toBe(80);
    expect(env.SEARCH_MAX_REQUESTS_PER_RESPONSE).toBe(1);
    expect(env.SEARCH_MAX_PAGES_PER_RESPONSE).toBe(2);
  });

  it("normalizes quoted URL env values", () => {
    const env = loadEnv({
      DATABASE_URL: "\"postgresql://postgres:postgres@localhost:5432/hori\"",
      REDIS_URL: "'redis://localhost:6379'",
      OLLAMA_BASE_URL: "  \"http://localhost:11434\"  "
    });

    expect(env.DATABASE_URL).toBe("postgresql://postgres:postgres@localhost:5432/hori");
    expect(env.REDIS_URL).toBe("redis://localhost:6379");
    expect(env.OLLAMA_BASE_URL).toBe("http://localhost:11434");
  });

  it("allows API-only config without Ollama URL", () => {
    const env = loadEnv({
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/hori",
      REDIS_URL: "redis://localhost:6379"
    });

    expect(env.OLLAMA_BASE_URL).toBeUndefined();
  });

  it("maps router provider env and OPENAI_MODEL alias for multi-provider routing", () => {
    const env = loadEnv({
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/hori",
      REDIS_URL: "redis://localhost:6379",
      AI_PROVIDER: "router",
      GOOGLE_API_KEY: "google-key",
      CF_ACCOUNT_ID: "cf-account",
      CF_API_TOKEN: "cf-token",
      GITHUB_TOKEN: "gh-token",
      OPENAI_API_KEY: "openai-key",
      OPENAI_MODEL: "gpt-5-nano"
    });

    expect(env.LLM_PROVIDER).toBe("router");
    expect(env.OPENAI_MODEL).toBe("gpt-5-nano");
    expect(env.OPENAI_CHAT_MODEL).toBe("gpt-5-nano");
    expect(env.OPENAI_SMART_MODEL).toBe("gpt-5-nano");
    expect(env.GEMINI_FLASH_MODEL).toBe("gemini-2.5-flash");
    expect(env.GEMINI_PRO_MODEL).toBe("gemini-2.5-pro");
    expect(env.CF_MODEL).toBe("@cf/zai-org/glm-4.7-flash");
    expect(env.GITHUB_MODELS_URL).toBe("https://models.github.ai/inference/chat/completions");
    expect(getEnabledAiRouterProviders(env)).toEqual(["gemini", "cloudflare", "github", "openai"]);
  });

  it("enables DeepSeek in router mode when a key is provided", () => {
    const env = loadEnv({
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/hori",
      REDIS_URL: "redis://localhost:6379",
      AI_PROVIDER: "router",
      DEEPSEEK_API_KEY: "deepseek-key"
    });

    const state = resolveAiRouterEnvState(env);

    expect(env.DEEPSEEK_BASE_URL).toBe("https://api.deepseek.com");
    expect(env.DEEPSEEK_MODEL).toBe("deepseek-v4-flash");
    expect(state.deepseek.enabled).toBe(true);
    expect(state.deepseek.missing).toEqual([]);
    expect(getEnabledAiRouterProviders(env)).toEqual(["deepseek"]);
  });

  it("disables only missing router providers instead of crashing startup", () => {
    const env = loadEnv({
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/hori",
      REDIS_URL: "redis://localhost:6379",
      AI_PROVIDER: "router",
      OPENAI_API_KEY: "openai-key",
      AI_ROUTER_ENABLE_GITHUB: "false"
    });

    const state = resolveAiRouterEnvState(env);

    expect(state.gemini.enabled).toBe(false);
    expect(state.gemini.missing).toEqual(["GOOGLE_API_KEY"]);
    expect(state.cloudflare.enabled).toBe(false);
    expect(state.cloudflare.missing).toEqual(["CF_ACCOUNT_ID", "CF_API_TOKEN"]);
    expect(state.github.enabledByFlag).toBe(false);
    expect(state.github.enabled).toBe(false);
    expect(state.openai.enabled).toBe(true);
    expect(() => assertEnvForRole(env, "bot")).toThrow(/DISCORD_TOKEN/);
    expect(() => assertEnvForRole({ ...env, DISCORD_TOKEN: "token", DISCORD_CLIENT_ID: "client" }, "bot")).not.toThrow();
  });

  it("warns when router mode is running without OpenAI embeddings", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const env = loadEnv({
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/hori",
      REDIS_URL: "redis://localhost:6379",
      AI_PROVIDER: "router",
      GOOGLE_API_KEY: "google-key"
    });

    assertEnvForRole({ ...env, DISCORD_TOKEN: "token", DISCORD_CLIENT_ID: "client" }, "bot");

    expect(warnSpy).toHaveBeenCalledWith("[config] AI router embeddings disabled: missing OPENAI_API_KEY");
  });

  it("throws a clearer error for unresolved Railway database references", () => {
    expect(() =>
      loadEnv({
        DATABASE_URL: "${{Postgres.DATABASE_URL}}",
        REDIS_URL: "redis://localhost:6379"
      })
    ).toThrow(/Railway reference/);
  });

  it("throws a clearer error when database env is missing entirely", () => {
    expect(() =>
      loadEnv({
        REDIS_URL: "redis://localhost:6379"
      })
    ).toThrow(/Set one of: DATABASE_URL, DB_URL/);
  });
});
