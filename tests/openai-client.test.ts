import { afterEach, describe, expect, it, vi } from "vitest";

import { OpenAIClient } from "@hori/llm";

describe("OpenAIClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests 768-dimensional embeddings by default", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as {
        model: string;
        input: string[];
        dimensions?: number;
      };

      expect(payload).toEqual({
        model: "text-embedding-3-small",
        input: ["хори привет"],
        dimensions: 768
      });

      return new Response(
        JSON.stringify({
          data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    const client = new OpenAIClient(
      {
        OPENAI_API_KEY: "test-key",
        OLLAMA_TIMEOUT_MS: 5_000,
        OLLAMA_LOG_TRAFFIC: false,
        OLLAMA_LOG_PROMPTS: false,
        OLLAMA_LOG_RESPONSES: false,
        OLLAMA_LOG_MAX_CHARS: 4000
      } as never,
      {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn()
      } as never
    );

    await expect(client.embed("text-embedding-3-small", "хори привет")).resolves.toEqual([[0.1, 0.2, 0.3]]);
  });
});
