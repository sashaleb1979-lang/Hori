import { afterEach, describe, expect, it, vi } from "vitest";

import { OpenAIClient } from "@hori/llm";

describe("OpenAIClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses GPT-5 chat-completions parameters without custom sampling", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as Record<string, unknown>;

      expect(payload).toMatchObject({
        model: "gpt-5-mini",
        max_completion_tokens: 200
      });
      expect(payload).not.toHaveProperty("max_tokens");
      expect(payload).not.toHaveProperty("temperature");
      expect(payload).not.toHaveProperty("top_p");

      return new Response(
        JSON.stringify({
          choices: [{ index: 0, message: { role: "assistant", content: "pong" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    const client = createClient();

    await expect(client.chat({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: "ping" }],
      maxTokens: 200,
      temperature: 0.55,
      topP: 0.9
    })).resolves.toMatchObject({
      message: { content: "pong" },
      usage: { promptTokens: 3, completionTokens: 4, totalTokens: 7 }
    });
  });

  it("keeps legacy chat-completions parameters for non GPT-5 models", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as Record<string, unknown>;

      expect(payload).toMatchObject({
        model: "gpt-4o-mini",
        max_tokens: 200,
        temperature: 0.55,
        top_p: 0.9
      });
      expect(payload).not.toHaveProperty("max_completion_tokens");

      return new Response(
        JSON.stringify({
          choices: [{ index: 0, message: { role: "assistant", content: "pong" }, finish_reason: "stop" }]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    const client = createClient();

    await expect(client.chat({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "ping" }],
      maxTokens: 200,
      temperature: 0.55,
      topP: 0.9
    })).resolves.toMatchObject({
      message: { content: "pong" }
    });
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

    const client = createClient();

    await expect(client.embed("text-embedding-3-small", "хори привет")).resolves.toEqual([[0.1, 0.2, 0.3]]);
  });
});

function createClient() {
  return new OpenAIClient(
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
}
