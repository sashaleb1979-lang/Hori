import type { LlmChatMessage } from "@hori/shared";

/* ------------------------------------------------------------------ */
/*  Provider-agnostic types                                           */
/*  Когда меняешь провайдер — реализуй LlmClient, остальное не трогай */
/* ------------------------------------------------------------------ */

export interface LlmToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface LlmToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

export interface LlmChatResponse {
  message: {
    role: "assistant";
    content: string;
    tool_calls?: LlmToolCall[];
  };
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    totalDurationMs?: number;
    promptEvalDurationMs?: number;
    evalDurationMs?: number;
  };
}

export interface LlmChatOptions {
  model: string;
  messages: LlmChatMessage[];
  tools?: LlmToolDefinition[];
  format?: "json";
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  keepAlive?: string;
  numCtx?: number;
  numBatch?: number;
}

export interface LlmEmbedOptions {
  dimensions?: number;
}

export interface LlmClient {
  chat(options: LlmChatOptions): Promise<LlmChatResponse>;
  embed(model: string, input: string | string[], options?: LlmEmbedOptions): Promise<number[][]>;
}
