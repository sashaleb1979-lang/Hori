import { describe, expect, it, vi } from "vitest";

import { ToolOrchestrator } from "@hori/llm";

describe("ToolOrchestrator", () => {
  it("keeps assistant tool_calls and tool_call_id in the transcript", async () => {
    const chat = vi
      .fn()
      .mockResolvedValueOnce({
        message: {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              function: {
                name: "web_search",
                arguments: { query: "router contract" }
              }
            }
          ]
        }
      })
      .mockResolvedValueOnce({
        message: {
          role: "assistant",
          content: "done"
        }
      });

    const orchestrator = new ToolOrchestrator(
      { chat } as never,
      {
        warn: vi.fn(),
        info: vi.fn(),
        error: vi.fn(),
        debug: vi.fn()
      } as never
    );

    const result = await orchestrator.runChatWithTools({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: "search" }],
      tools: [
        {
          definition: {
            type: "function",
            function: {
              name: "web_search",
              description: "search",
              parameters: { type: "object" }
            }
          },
          execute: vi.fn().mockResolvedValue({ hits: [{ title: "a" }] })
        }
      ],
      maxToolCalls: 2
    });

    expect(result.text).toBe("done");
    expect(chat).toHaveBeenCalledTimes(2);

    const secondCall = chat.mock.calls[1]?.[0] as {
      messages: Array<{
        role: string;
        content: string;
        tool_call_id?: string;
        tool_calls?: Array<{ id?: string; function: { name: string; arguments: Record<string, unknown> } }>;
      }>;
    };
    const assistantMessage = secondCall.messages[1];
    const toolMessage = secondCall.messages[2];

    expect(assistantMessage?.tool_calls).toHaveLength(1);
    expect(assistantMessage?.tool_calls?.[0]?.function.name).toBe("web_search");
    expect(assistantMessage?.tool_calls?.[0]?.id).toBeTruthy();
    expect(toolMessage).toMatchObject({
      role: "tool",
      tool_call_id: assistantMessage?.tool_calls?.[0]?.id,
      content: JSON.stringify({ hits: [{ title: "a" }] })
    });
  });
});