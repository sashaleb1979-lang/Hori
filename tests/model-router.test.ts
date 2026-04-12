import { describe, expect, it } from "vitest";

import { loadEnv } from "@hori/config";
import { ModelRouter } from "@hori/llm";

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
    const smartProfile = router.pickProfile("summary");

    expect(fastProfile.maxTokens).toBeLessThan(smartProfile.maxTokens);
    expect(fastProfile.temperature).toBeLessThan(smartProfile.temperature);
    expect(fastProfile.topP).toBeLessThan(smartProfile.topP ?? 0);
  });
});