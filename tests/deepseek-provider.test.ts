import { afterEach, describe, expect, it, vi } from "vitest";

import { DeepSeekProvider } from "@hori/llm";

describe("DeepSeekProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forces non-thinking mode for deepseek-v4-flash requests", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as Record<string, unknown>;

      expect(payload).toMatchObject({
        model: "deepseek-v4-flash",
        thinking: {
          type: "disabled"
        },
        max_tokens: 180,
        temperature: 0.4,
        top_p: 0.9
      });

      return new Response(
        JSON.stringify({
          choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    const provider = new DeepSeekProvider("deepseek-key", "https://api.deepseek.com", createLogger());
    const result = await provider.send({
      model: "deepseek-v4-flash",
      messages: [{ role: "user", content: "ping" }],
      maxTokens: 180,
      temperature: 0.4,
      topP: 0.9
    });

    expect(result.content).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(1);
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