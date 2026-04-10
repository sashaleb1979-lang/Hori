import { describe, expect, it } from "vitest";

import { pickClosestInstalledModel } from "@hori/llm";

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
