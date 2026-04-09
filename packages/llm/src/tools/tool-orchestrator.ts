import type { AppLogger, ChatRunResult, LlmChatMessage, ToolExecutionResult } from "@hori/shared";

import type { LlmClient, LlmToolDefinition } from "../client/llm-client";

export interface ExecutableTool {
  definition: LlmToolDefinition;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

export class ToolOrchestrator {
  constructor(
    private readonly client: LlmClient,
    private readonly logger: AppLogger
  ) {}

  async runChatWithTools(options: {
    model: string;
    messages: LlmChatMessage[];
    tools: ExecutableTool[];
    maxToolCalls: number;
  }): Promise<ChatRunResult> {
    const transcript = [...options.messages];
    const toolMap = new Map(options.tools.map((tool) => [tool.definition.function.name, tool]));
    const executed: ToolExecutionResult[] = [];

    for (let iteration = 0; executed.length < options.maxToolCalls; iteration += 1) {
      const response = await this.client.chat({
        model: options.model,
        messages: transcript,
        tools: options.tools.map((tool) => tool.definition)
      });

      transcript.push({
        role: "assistant",
        content: response.message.content ?? ""
      });

      const toolCalls = response.message.tool_calls ?? [];

      if (!toolCalls.length) {
        return {
          text: response.message.content,
          toolCalls: executed
        };
      }

      for (const call of toolCalls) {
        if (executed.length >= options.maxToolCalls) {
          this.logger.warn({ toolCalls: executed.length }, "tool orchestrator reached tool call cap");
          break;
        }

        const tool = toolMap.get(call.function.name);

        if (!tool) {
          throw new Error(`Unknown tool requested by model: ${call.function.name}`);
        }

        const output = await tool.execute(call.function.arguments);
        executed.push({
          toolName: call.function.name,
          args: call.function.arguments,
          output
        });

        transcript.push({
          role: "tool",
          name: call.function.name,
          content: JSON.stringify(output)
        });
      }
    }

    this.logger.warn({ toolCalls: executed.length }, "tool orchestrator hit max iterations");

    const finalResponse = await this.client.chat({
      model: options.model,
      messages: transcript
    });

    return {
      text: finalResponse.message.content,
      toolCalls: executed
    };
  }
}
