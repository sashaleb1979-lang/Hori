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

export interface LlmRequestMetadata {
  requestId?: string;
  userKey?: string;
  intent?: string;
  slot?: string;
  purpose?: string;
  complexityHint?: "simple" | "complex";
  allowPaidFallback?: boolean;
}

export interface LlmRoutingMetadata {
  provider: string;
  model: string;
  latencyMs: number;
  finishReason?: string;
  routedFrom?: string[];
  fallbackDepth?: number;
  requestId?: string;
  errorClass?: string;
}

export interface LlmChatResponse {
  message: {
    role: "assistant";
    content: string;
    tool_calls?: LlmToolCall[];
  };
  routing?: LlmRoutingMetadata;
  rawUsage?: Record<string, unknown>;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    totalDurationMs?: number;
    promptEvalDurationMs?: number;
    evalDurationMs?: number;
    /** Tokens served from OpenAI's prompt cache (50% cost discount). */
    cachedTokens?: number;
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
  metadata?: LlmRequestMetadata;
}

export interface LlmEmbedOptions {
  dimensions?: number;
}

export interface LlmClient {
  chat(options: LlmChatOptions): Promise<LlmChatResponse>;
  embed(model: string, input: string | string[], options?: LlmEmbedOptions): Promise<number[][]>;
}
