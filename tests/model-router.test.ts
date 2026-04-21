import { describe, expect, it, vi } from "vitest";

import { loadEnv } from "@hori/config";
import { EmbeddingAdapter, ModelRouter, parseStoredModelRouting, resolveModelRouting, serializeModelRouting } from "@hori/llm";

describe("ModelRouter", () => {
  it("defaults both fast and smart tiers to qwen3.5:9b", () => {
    const env = loadEnv({
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/hori",
      REDIS_URL: "redis://localhost:6379",
      OLLAMA_BASE_URL: "http://localhost:11434"
    });
    const router = new ModelRouter(env);

    expect(router.pickModel("chat")).toBe("qwen3.5:9b");
    expect(router.pickModel("summary")).toBe("qwen3.5:9b");
  });

  it("keeps fast and smart tiers distinct through profile caps", () => {
    const env = loadEnv({
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/hori",
      REDIS_URL: "redis://localhost:6379",
      OLLAMA_BASE_URL: "http://localhost:11434"
    });
    const router = new ModelRouter(env);
    const fastProfile = router.pickProfile("chat");
    const utilityFastProfile = router.pickProfile("help");
    const smartProfile = router.pickProfile("summary");

    expect(fastProfile.maxTokens).toBeLessThan(utilityFastProfile.maxTokens);
    expect(fastProfile.temperature).toBeLessThan(utilityFastProfile.temperature);
    expect(fastProfile.topP).toBeLessThan(utilityFastProfile.topP ?? 0);
    expect(fastProfile.maxTokens).toBeLessThan(smartProfile.maxTokens);
    expect(fastProfile.temperature).toBeLessThan(smartProfile.temperature);
    expect(fastProfile.topP).toBeLessThan(smartProfile.topP ?? 0);
  });

  it("uses balanced OpenAI routing by default", () => {
    const env = loadEnv({
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/hori",
      REDIS_URL: "redis://localhost:6379",
      LLM_PROVIDER: "openai"
    });
    const router = new ModelRouter(env);
    const routing = resolveModelRouting(env);

    expect(routing.preset).toBe("balanced_openai");
    expect(router.pickModelForSlot("classifier", routing)).toBe("gpt-5-nano");
  expect(router.pickModel("chat", routing)).toBe("gpt-5.4-nano");
    expect(router.pickModel("summary", routing)).toBe("gpt-5.4-nano");
    expect(router.pickModel("rewrite", routing)).toBe("gpt-5.4-nano");
    expect(router.pickModel("profile", routing)).toBe("gpt-5.4-nano");
    expect(router.pickModel("memory_write", routing)).toBe("gpt-5.4-nano");
    expect(router.pickModel("search", routing)).toBe("gpt-5.4-nano");
    expect(router.pickModel("analytics", routing)).toBe("gpt-5.4-nano");
  });

  it("keeps legacy OpenAI env routing available", () => {
    const env = loadEnv({
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/hori",
      REDIS_URL: "redis://localhost:6379",
      LLM_PROVIDER: "openai",
      OPENAI_CHAT_MODEL: "gpt-4o-mini",
      OPENAI_SMART_MODEL: "gpt-5-mini"
    });
    const routing = resolveModelRouting(env, serializeModelRouting("legacy_env"));
    const router = new ModelRouter(env);

    expect(routing.preset).toBe("legacy_env");
    expect(router.pickModel("chat", routing)).toBe("gpt-4o-mini");
    expect(router.pickModel("summary", routing)).toBe("gpt-5-mini");
  });

  it("lets slot overrides beat the active preset", () => {
    const env = loadEnv({
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/hori",
      REDIS_URL: "redis://localhost:6379",
      LLM_PROVIDER: "openai"
    });
    const routing = resolveModelRouting(env, serializeModelRouting("balanced_openai", { chat: "gpt-5.4-mini" }));

    expect(routing.slots.chat).toBe("gpt-5.4-mini");
    expect(routing.slots.summary).toBe("gpt-5-mini");
  });

  it("drops unknown slot override model ids", () => {
    const parsed = parseStoredModelRouting(JSON.stringify({
      preset: "balanced_openai",
      overrides: {
        chat: "definitely-not-a-real-model",
        search: "gpt-5.4-mini"
      }
    }));

    expect(parsed.value?.overrides?.chat).toBeUndefined();
    expect(parsed.value?.overrides?.search).toBe("gpt-5.4-mini");
  });

  it("defaults OpenAI embeddings to text-embedding-3-small at 768 dimensions", async () => {
    const env = loadEnv({
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/hori",
      REDIS_URL: "redis://localhost:6379",
      LLM_PROVIDER: "openai",
      OPENAI_EMBED_MODEL: "text-embedding-3-large"
    });
    const router = new ModelRouter(env);
    const embed = vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]);
    const adapter = new EmbeddingAdapter({ embed } as never, router);

    await expect(adapter.embedOne("хори привет")).resolves.toEqual([0.1, 0.2, 0.3]);
    expect(router.pickEmbeddingModel()).toEqual({
      model: "text-embedding-3-small",
      dimensions: 768
    });
    expect(embed).toHaveBeenCalledWith("text-embedding-3-small", "хори привет", { dimensions: 768 });
  });

  it("allows lower OpenAI embedding dimensions for cheaper retrieval", async () => {
    const env = loadEnv({
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/hori",
      REDIS_URL: "redis://localhost:6379",
      LLM_PROVIDER: "openai",
      OPENAI_EMBED_DIMENSIONS: "512"
    });
    const router = new ModelRouter(env);
    const embed = vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]);
    const adapter = new EmbeddingAdapter({ embed } as never, router);

    await expect(adapter.embedOne("хори привет")).resolves.toEqual([0.1, 0.2, 0.3]);
    expect(router.pickEmbeddingModel()).toEqual({
      model: "text-embedding-3-small",
      dimensions: 512
    });
    expect(embed).toHaveBeenCalledWith("text-embedding-3-small", "хори привет", { dimensions: 512 });
  });
});
