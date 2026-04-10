import { describe, expect, it } from "vitest";

import { parseOllamaChatResponseBody, pickClosestInstalledModel } from "@hori/llm";

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
});
