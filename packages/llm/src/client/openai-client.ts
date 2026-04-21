import type { AppEnv } from "@hori/config";
import type { AppLogger } from "@hori/shared";
import { asErrorMessage, llmRetriesCounter } from "@hori/shared";

import { resolveOpenAIEmbeddingDimensions } from "../router/model-routing";
import type { LlmChatOptions, LlmChatResponse, LlmClient, LlmToolCall, LlmEmbedOptions } from "./llm-client";

/* ------------------------------------------------------------------ */
/*  OpenAI-compatible LlmClient                                       */
/*  Поддерживает chat completions + embeddings через api.openai.com   */
/* ------------------------------------------------------------------ */

const OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OPENAI_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 500;
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

interface OpenAIChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

interface OpenAIToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

interface OpenAIChatChoice {
  index: number;
  message: {
    role: "assistant";
    content: string | null;
    tool_calls?: OpenAIToolCall[];
  };
  finish_reason: string | null;
}

interface OpenAIChatResponse {
  id: string;
  choices: OpenAIChatChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    prompt_tokens_details?: {
      cached_tokens?: number;
      audio_tokens?: number;
    };
  };
}

interface OpenAIEmbeddingResponse {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
  usage?: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

type OpenAIClientEnv = AppEnv & {
  OPENAI_API_KEY?: string;
  OPENAI_EMBED_DIMENSIONS?: number;
};

export class OpenAIClient implements LlmClient {
  private readonly apiKey: string;
  private readonly defaultEmbeddingDimensions: number;
  private readonly timeoutMs: number;
  private readonly logger: AppLogger;
  private readonly logTraffic: boolean;
  private readonly logPrompts: boolean;
  private readonly logResponses: boolean;
  private readonly logMaxChars: number;

  constructor(env: AppEnv, logger: AppLogger) {
    const key = (env as OpenAIClientEnv).OPENAI_API_KEY;

    if (!key) {
      throw new Error("OPENAI_API_KEY is required when LLM_PROVIDER=openai");
    }

    this.apiKey = key;
    this.defaultEmbeddingDimensions = resolveOpenAIEmbeddingDimensions(env as OpenAIClientEnv);
    this.timeoutMs = env.OLLAMA_TIMEOUT_MS ?? DEFAULT_OPENAI_TIMEOUT_MS;
    this.logger = logger;
    this.logTraffic = env.OLLAMA_LOG_TRAFFIC;
    this.logPrompts = env.OLLAMA_LOG_PROMPTS;
    this.logResponses = env.OLLAMA_LOG_RESPONSES;
    this.logMaxChars = env.OLLAMA_LOG_MAX_CHARS;
  }

  async chat(options: LlmChatOptions): Promise<LlmChatResponse> {
    const messages: OpenAIChatMessage[] = options.messages.map((m) => ({
      role: m.role as "system" | "user" | "assistant",
      content: m.content
    }));

    const body: Record<string, unknown> = {
      model: options.model,
      messages
    };

    if (usesMaxCompletionTokens(options.model)) {
      if (options.maxTokens !== undefined) {
        body.max_completion_tokens = options.maxTokens;
      }
      body.reasoning_effort = "low";
    } else if (options.maxTokens !== undefined) {
      body.max_tokens = options.maxTokens;
    }

    if (options.temperature !== undefined && supportsCustomSampling(options.model)) {
      body.temperature = options.temperature;
    }

    if (options.topP !== undefined && supportsCustomSampling(options.model)) {
      body.top_p = options.topP;
    }

    if (options.format === "json") {
      body.response_format = { type: "json_object" };
    }

    if (options.tools?.length) {
      body.tools = options.tools.map((t) => ({
        type: "function" as const,
        function: {
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters
        }
      }));
    }

    if (this.logTraffic || this.logPrompts) {
      this.logger.debug(
        { model: options.model, messageCount: messages.length },
        `openai chat request: model=${options.model} messages=${messages.length}`
      );
    }

    const startMs = Date.now();

    const response = await this.fetchWithRetry(`${OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "unknown error");
      throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as OpenAIChatResponse;
    const choice = data.choices[0];
    const durationMs = Date.now() - startMs;

    if (!choice) {
      throw new Error("OpenAI returned empty choices");
    }

    const toolCalls: LlmToolCall[] | undefined = choice.message.tool_calls?.map((tc) => {
      let parsedArgs: Record<string, unknown> = {};

      try {
        parsedArgs = JSON.parse(tc.function.arguments) as Record<string, unknown>;
      } catch {
        /* keep empty object */
      }

      return {
        function: {
          name: tc.function.name,
          arguments: parsedArgs
        }
      };
    });

    if (this.logTraffic || this.logResponses) {
      const content = choice.message.content ?? "";
      const truncated = content.length > this.logMaxChars
        ? `${content.slice(0, this.logMaxChars)}...`
        : content;
      const cachedTokens = data.usage?.prompt_tokens_details?.cached_tokens ?? 0;
      const cacheHitPct = data.usage?.prompt_tokens && cachedTokens
        ? Math.round((cachedTokens / data.usage.prompt_tokens) * 100)
        : 0;

      this.logger.debug(
        {
          model: options.model,
          durationMs,
          promptTokens: data.usage?.prompt_tokens,
          completionTokens: data.usage?.completion_tokens,
          ...(cachedTokens > 0 ? { cachedTokens, cacheHitPct } : {})
        },
        `openai chat response: ${truncated}`
      );
    }

    return {
      message: {
        role: "assistant",
        content: choice.message.content ?? "",
        tool_calls: toolCalls
      },
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
            totalDurationMs: durationMs,
            cachedTokens: data.usage.prompt_tokens_details?.cached_tokens
          }
        : undefined
    };
  }

  private async fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    let response: Response | undefined;
    let lastError: Error | undefined;
    let lastErrorBody: string | undefined;
    const { signal: _origSignal, ...initWithoutSignal } = init;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        response = await fetch(url, {
          ...initWithoutSignal,
          signal: AbortSignal.timeout(this.timeoutMs)
        });

        if (response.ok || !RETRYABLE_STATUS_CODES.has(response.status)) {
          return response;
        }

        // Drain body to free the socket before retrying
        lastErrorBody = await response.text().catch(() => "unknown error");

        const retryAfterHeader = response.headers.get("retry-after");
        const parsedRetryAfter = retryAfterHeader ? Number(retryAfterHeader) : NaN;
        const delayMs = Number.isFinite(parsedRetryAfter)
          ? Math.min(parsedRetryAfter * 1000, 10_000)
          : RETRY_BASE_DELAY_MS * Math.pow(2, attempt);

        if (attempt < MAX_RETRIES) {
          llmRetriesCounter.inc({ reason: String(response.status) });
          this.logger.warn(
            { status: response.status, attempt: attempt + 1, delayMs, url },
            `openai retryable error ${response.status}, retrying in ${delayMs}ms`
          );
          await sleep(delayMs);
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < MAX_RETRIES && isTransientError(lastError)) {
          const delayMs = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
          llmRetriesCounter.inc({ reason: "transient" });
          this.logger.warn(
            { error: lastError.message, attempt: attempt + 1, delayMs, url },
            `openai transient error, retrying in ${delayMs}ms`
          );
          await sleep(delayMs);
          continue;
        }
        throw lastError;
      }
    }

    // All retries exhausted — throw with saved error context
    if (response && !response.ok) {
      throw new Error(`OpenAI API error ${response.status} after ${MAX_RETRIES + 1} attempts: ${lastErrorBody ?? "unknown error"}`);
    }

    throw lastError ?? new Error("OpenAI request failed after retries");
  }

  async embed(model: string, input: string | string[], options: LlmEmbedOptions = {}): Promise<number[][]> {
    const inputArray = Array.isArray(input) ? input : [input];

    const body = {
      model,
      input: inputArray,
      dimensions: options.dimensions ?? this.defaultEmbeddingDimensions
    };

    const response = await this.fetchWithRetry(`${OPENAI_BASE_URL}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "unknown error");
      throw new Error(`OpenAI embeddings error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as OpenAIEmbeddingResponse;

    return data.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
  }
}

function usesMaxCompletionTokens(model: string) {
  return /^gpt-5(?:[.-]|$)/i.test(model);
}

function supportsCustomSampling(model: string) {
  return !/^gpt-5(?:[.-]|$)/i.test(model);
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function isTransientError(error: Error) {
  const msg = error.message.toLowerCase();
  return msg.includes("timeout") || msg.includes("econnreset") || msg.includes("socket hang up") || msg.includes("fetch failed");
}
