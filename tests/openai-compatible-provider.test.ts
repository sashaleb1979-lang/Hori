import { afterEach, describe, expect, it, vi } from "vitest";

import { OpenAICompatibleProvider } from "@hori/llm";

describe("OpenAICompatibleProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("serializes assistant tool calls and tool results with ids", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as {
        messages: Array<Record<string, unknown>>;
      };

      expect(payload.messages).toEqual([
        { role: "user", content: "find" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: {
                name: "web_search",
                arguments: JSON.stringify({ query: "router contract" })
              }
            }
          ]
        },
        {
          role: "tool",
          content: JSON.stringify({ hits: [] }),
          tool_call_id: "call_1"
        }
      ]);

      return new Response(
        JSON.stringify({
          choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenAICompatibleProvider({
      name: "test-provider",
      endpointUrl: "https://example.test/chat/completions",
      apiKey: "test-key",
      logger: createLogger()
    });

    await expect(provider.send({
      model: "gpt-5-mini",
      messages: [
        { role: "user", content: "find" },
        {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "call_1",
              function: {
                name: "web_search",
                arguments: { query: "router contract" }
              }
            }
          ]
        },
        {
          role: "tool",
          content: JSON.stringify({ hits: [] }),
          name: "web_search",
          tool_call_id: "call_1"
        }
      ]
    })).resolves.toMatchObject({ content: "ok" });
  });

  it("parses tool call ids from provider responses", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          choices: [{
            index: 0,
            message: {
              role: "assistant",
              content: null,
              tool_calls: [{
                id: "call_99",
                type: "function",
                function: {
                  name: "web_search",
                  arguments: JSON.stringify({ query: "router contract" })
                }
              }]
            },
            finish_reason: "tool_calls"
          }]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenAICompatibleProvider({
      name: "test-provider",
      endpointUrl: "https://example.test/chat/completions",
      apiKey: "test-key",
      logger: createLogger()
    });

    const result = await provider.send({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: "find" }]
    });

    expect(result.toolCalls).toEqual([
      {
        id: "call_99",
        function: {
          name: "web_search",
          arguments: { query: "router contract" }
        }
      }
    ]);
  });
});

function createLogger() {
  return {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  } as never;
}