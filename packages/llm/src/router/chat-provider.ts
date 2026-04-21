import type { LlmChatMessage } from "@hori/shared";

import type {
  LlmRequestMetadata,
  LlmToolCall,
  LlmToolDefinition
} from "../client/llm-client";
import type { ProviderErrorInfo } from "./provider-error";

export interface ChatProviderRequest {
  model: string;
  messages: LlmChatMessage[];
  tools?: LlmToolDefinition[];
  format?: "json";
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  metadata?: LlmRequestMetadata;
}

export interface NormalizedProviderResponse {
  content: string;
  provider: string;
  model: string;
  latencyMs: number;
  finishReason?: string;
  rawUsage?: Record<string, unknown>;
  toolCalls?: LlmToolCall[];
  raw?: unknown;
}

export interface ProviderQuotaState {
  limit?: number;
  used?: number;
  remaining?: number;
  resetAt?: string;
  cooldownUntil?: string;
  recentFailureCount?: number;
  lastSuccessfulRequestAt?: string;
  lastRateLimitAt?: string;
}

export interface ChatProvider {
  readonly name: string;
  readonly supportsTools?: boolean;
  isAvailable(): boolean | Promise<boolean>;
  send(request: ChatProviderRequest): Promise<NormalizedProviderResponse>;
  classifyError(error: unknown): ProviderErrorInfo;
  estimateCost?(request: ChatProviderRequest, response: NormalizedProviderResponse): number | undefined;
  getQuotaState?(): ProviderQuotaState | Promise<ProviderQuotaState | undefined>;
}