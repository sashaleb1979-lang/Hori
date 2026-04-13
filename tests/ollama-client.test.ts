import { afterEach, describe, expect, it, vi } from "vitest";

import { OllamaClient, parseOllamaChatResponseBody, pickClosestInstalledModel } from "@hori/llm";

describe("pickClosestInstalledModel", () => {
  it("prefers the nearest qwen replacement when the requested model is missing", () => {
    expect(
      pickClosestInstalledModel("qwen3:4b", ["nomic-embed-text:latest", "qwen3.5:4b", "qwen3.5:9b", "gpt-oss:20b"])
    ).toBe("qwen3.5:4b");
  });

  it("keeps embedding requests on embedding models", () => {
    expect(
      pickClosestInstalledModel("nomic-embed-text", ["qwen3.5:4b", "nomic-embed-text:latest", "gpt-oss:20b"])
    ).toBe("nomic-embed-text:latest");
  });

  it("falls back to the closest non-embedding text model when family changed", () => {
    expect(
      pickClosestInstalledModel("gemma3:12b", ["qwen3.5:4b", "qwen3.5:9b", "gpt-oss:20b", "nomic-embed-text:latest"])
    ).toBe("qwen3.5:9b");
  });
});

describe("parseOllamaChatResponseBody", () => {
  it("merges streamed ndjson chat chunks into a single assistant message", () => {
    const response = parseOllamaChatResponseBody(
      [
        '{"message":{"role":"assistant","content":"При"}}',
        '{"message":{"role":"assistant","content":"вет"}}',
        '{"done":true}'
      ].join("\n")
    );

    expect(response).toEqual({
      message: {
        role: "assistant",
        content: "Привет"
      }
    });
  });

  it("preserves tool calls from streamed chunks", () => {
    const response = parseOllamaChatResponseBody(
      [
        '{"message":{"role":"assistant","content":"","tool_calls":[{"function":{"name":"web_search","arguments":{"q":"hori"}}}]}}',
        '{"done":true}'
      ].join("\n")
    );

    expect(response.message.tool_calls).toEqual([
      {
        function: {
          name: "web_search",
          arguments: { q: "hori" }
        }
      }
    ]);
  });

  it("extracts Ollama usage counters from the final chunk", () => {
    const response = parseOllamaChatResponseBody(
      [
        '{"message":{"role":"assistant","content":"При"}}',
        '{"message":{"role":"assistant","content":"вет"}}',
        '{"done":true,"prompt_eval_count":3210,"eval_count":44,"total_duration":2500000000,"prompt_eval_duration":1800000000,"eval_duration":320000000}'
      ].join("\n")
    );

    expect(response.message.content).toBe("Привет");
    expect(response.usage).toEqual({
      promptTokens: 3210,
      completionTokens: 44,
      totalTokens: 3254,
      totalDurationMs: 2500,
      promptEvalDurationMs: 1800,
      evalDurationMs: 320
    });
  });
});

describe("OllamaClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("disables thinking and caps reply length for qwen chat models", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith("/api/tags")) {
        return new Response(
          JSON.stringify({
            models: [{ name: "qwen3.5:9b" }]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      expect(url.endsWith("/api/chat")).toBe(true);
      const payload = JSON.parse(String(init?.body)) as {
        think?: boolean;
        keep_alive?: string;
        options?: { num_predict?: number; temperature?: number; top_p?: number };
      };

      expect(payload.think).toBe(false);
      expect(payload.keep_alive).toBe("10m");
      expect(payload.options?.num_predict).toBe(96);
      expect(payload.options?.temperature).toBe(0.2);
      expect(payload.options?.top_p).toBe(0.9);

      return new Response(
        ['{"message":{"role":"assistant","content":"Привет"}}', '{"done":true}'].join("\n"),
        { status: 200, headers: { "Content-Type": "application/x-ndjson" } }
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    const client = new OllamaClient(
      {
        OLLAMA_BASE_URL: "http://localhost:11434",
        OLLAMA_TIMEOUT_MS: 5_000,
        OLLAMA_FAST_MODEL: "qwen3.5:9b",
        OLLAMA_SMART_MODEL: "qwen3.5:9b",
        OLLAMA_EMBED_MODEL: "nomic-embed-text",
        LLM_REPLY_MAX_TOKENS: 96,
        OLLAMA_KEEP_ALIVE: "10m"
      } as never,
      {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn()
      } as never
    );

    const response = await client.chat({
      model: "qwen3.5:9b",
      temperature: 0.2,
      topP: 0.9,
      messages: [{ role: "user", content: "Привет" }]
    });

    expect(response.message.content).toBe("Привет");
  });

  it("logs tunnel traffic, prompts and raw responses when enabled", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);

      if (url.endsWith("/api/tags")) {
        return new Response(
          JSON.stringify({ models: [{ name: "qwen3.5:9b" }] }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(
        ['{"message":{"role":"assistant","content":"ready"}}', '{"done":true}'].join("\n"),
        { status: 200, headers: { "Content-Type": "application/x-ndjson" } }
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    const info = vi.fn();
    const client = new OllamaClient(
      {
        OLLAMA_BASE_URL: "https://desktop-2kc8pml.tail4148fa.ts.net",
        OLLAMA_TIMEOUT_MS: 5_000,
        OLLAMA_FAST_MODEL: "qwen3.5:9b",
        OLLAMA_SMART_MODEL: "qwen3.5:9b",
        OLLAMA_EMBED_MODEL: "nomic-embed-text",
        LLM_REPLY_MAX_TOKENS: 96,
        OLLAMA_KEEP_ALIVE: "10m",
        OLLAMA_LOG_TRAFFIC: true,
        OLLAMA_LOG_PROMPTS: true,
        OLLAMA_LOG_RESPONSES: true,
        OLLAMA_LOG_MAX_CHARS: 4000
      } as never,
      {
        error: vi.fn(),
        warn: vi.fn(),
        info,
        debug: vi.fn()
      } as never
    );

    await client.chat({
      model: "qwen3.5:9b",
      messages: [
        { role: "system", content: "system prompt" },
        { role: "user", content: "prompt-text" }
      ]
    });

    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "chat",
        path: "/api/chat",
        tunnelLikeHost: true,
        requestBodyPreview: expect.stringContaining("prompt-text")
      }),
      "ollama outbound request"
    );

    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "chat",
        path: "/api/chat",
        status: 200,
        responseBodyPreview: expect.stringContaining("ready")
      }),
      "ollama inbound response"
    );
  });
});
