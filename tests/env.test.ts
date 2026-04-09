import { describe, expect, it } from "vitest";

import { loadEnv } from "@hori/config";

describe("loadEnv", () => {
  it("applies defaults for omitted boolean and numeric env vars", () => {
    const env = loadEnv({
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/hori",
      REDIS_URL: "redis://localhost:6379",
      OLLAMA_BASE_URL: "http://localhost:11434"
    });

    expect(env.FEATURE_WEB_SEARCH).toBe(true);
    expect(env.FEATURE_AUTOINTERJECT).toBe(false);
    expect(env.LLM_MAX_CONTEXT_MESSAGES).toBe(24);
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
          roast: false
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
    expect(env.LLM_MAX_CONTEXT_MESSAGES).toBe(16);
    expect(env.USER_PROFILE_MIN_MESSAGES).toBe(80);
    expect(env.SEARCH_MAX_REQUESTS_PER_RESPONSE).toBe(1);
    expect(env.SEARCH_MAX_PAGES_PER_RESPONSE).toBe(2);
  });

  it("allows API-only config without Ollama URL", () => {
    const env = loadEnv({
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/hori",
      REDIS_URL: "redis://localhost:6379"
    });

    expect(env.OLLAMA_BASE_URL).toBeUndefined();
  });

  it("throws a clearer error for unresolved Railway database references", () => {
    expect(() =>
      loadEnv({
        DATABASE_URL: "${{Postgres.DATABASE_URL}}",
        REDIS_URL: "redis://localhost:6379"
      })
    ).toThrow(/Railway reference/);
  });
});
