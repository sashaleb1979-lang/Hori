import { describe, it, expect } from "vitest";
import { OpenAICompatibleProvider } from "@hori/llm";
import type { AppLogger } from "@hori/shared";

const noopLogger: AppLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
  trace: () => {},
  child: () => noopLogger
} as unknown as AppLogger;

function makeFetch(content: string): typeof fetch {
  const json = {
    id: "x",
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: { role: "assistant", content }
      }
    ],
    usage: { prompt_tokens: 1, completion_tokens: 1 }
  };
  return (async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    headers: { get: () => null },
    text: async () => JSON.stringify(json),
    json: async () => json
  })) as unknown as typeof fetch;
}

const ORIGINAL_FETCH = globalThis.fetch;

function makeProvider(): OpenAICompatibleProvider {
  return new OpenAICompatibleProvider({
    name: "test",
    endpointUrl: "https://example.invalid/v1/chat/completions",
    apiKey: "k",
    logger: noopLogger
  });
}

async function runOnce(content: string): Promise<string> {
  globalThis.fetch = makeFetch(content);
  try {
    const provider = makeProvider();
    const res = await provider.send({
      model: "m",
      messages: [{ role: "user", content: "x" }]
    });
    return res.content;
  } finally {
    globalThis.fetch = ORIGINAL_FETCH;
  }
}

describe("V6 / DeepSeek 4B Flash: reasoning artifact stripping", () => {
  it("removes <think>...</think> blocks", async () => {
    expect(await runOnce("<think>internal cot</think>Привет!")).toBe("Привет!");
  });

  it("removes <thinking>...</thinking> blocks (case-insensitive)", async () => {
    expect(await runOnce("<Thinking>step 1\nstep 2</Thinking>\nответ")).toBe("ответ");
  });

  it("removes leading <think> without closing tag (terminated by blank line)", async () => {
    expect(await runOnce("<think>thinking out loud\n\nфинальный ответ")).toBe("финальный ответ");
  });

  it("removes <reasoning>...</reasoning> blocks", async () => {
    expect(await runOnce("<reasoning>план</reasoning>Сделано.")).toBe("Сделано.");
  });

  it("keeps clean answers untouched", async () => {
    expect(await runOnce("просто ответ без артефактов")).toBe("просто ответ без артефактов");
  });

  it("strips multiple think blocks in same response", async () => {
    expect(await runOnce("<think>a</think>часть1<think>b</think>часть2")).toBe("часть1часть2");
  });
});
