import type { AppEnv } from "@hori/config";
import type { AppLogger } from "@hori/shared";
import { asErrorMessage } from "@hori/shared";

import type { LlmChatOptions, LlmChatResponse, LlmClient, LlmToolCall } from "./llm-client";

/* ------------------------------------------------------------------ */
/*  OpenAI-compatible LlmClient                                       */
/*  Поддерживает chat completions + embeddings через api.openai.com   */
/* ------------------------------------------------------------------ */

const OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OPENAI_TIMEOUT_MS = 60_000;

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
};

export class OpenAIClient implements LlmClient {
  private readonly apiKey: string;
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
      messages,
      max_tokens: options.maxTokens
    };

    if (options.temperature !== undefined) {
      body.temperature = options.temperature;
    }

    if (options.topP !== undefined) {
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

    const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs)
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

      this.logger.debug(
        {
          model: options.model,
          durationMs,
          promptTokens: data.usage?.prompt_tokens,
          completionTokens: data.usage?.completion_tokens
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
            totalDurationMs: durationMs
          }
        : undefined
    };
  }

  async embed(model: string, input: string | string[]): Promise<number[][]> {
    const inputArray = Array.isArray(input) ? input : [input];

    const body = {
      model,
      input: inputArray
    };

    const response = await fetch(`${OPENAI_BASE_URL}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs)
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
