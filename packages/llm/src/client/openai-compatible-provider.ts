import type { AppLogger } from "@hori/shared";
import { asErrorMessage } from "@hori/shared";

import type { ChatProvider, ChatProviderRequest, NormalizedProviderResponse } from "../router/chat-provider";
import { calculateCostUsd } from "../router/model-pricing";
import { classifyProviderError, ProviderRequestError, type ProviderErrorInfo } from "../router/provider-error";
import type { LlmToolCall } from "./llm-client";

const DEFAULT_TIMEOUT_MS = 60_000;

interface OpenAICompatibleChoice {
  index: number;
  message: {
    role: "assistant";
    content: string | null;
    tool_calls?: Array<{
      id: string;
      type: "function";
      function: {
        name: string;
        arguments: string;
      };
    }>;
  };
  finish_reason: string | null;
}

interface OpenAICompatibleResponse {
  id?: string;
  choices?: OpenAICompatibleChoice[];
  usage?: Record<string, unknown> & {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    prompt_tokens_details?: {
      cached_tokens?: number;
    };
  };
}

export interface OpenAICompatibleProviderOptions {
  name: string;
  endpointUrl: string;
  apiKey: string;
  logger: AppLogger;
  timeoutMs?: number;
  supportsTools?: boolean;
  defaultHeaders?: Record<string, string>;
  logTraffic?: boolean;
  logMaxChars?: number;
  extraBody?: Record<string, unknown> | ((request: ChatProviderRequest) => Record<string, unknown>);
}

export class OpenAICompatibleProvider implements ChatProvider {
  readonly name: string;
  readonly supportsTools: boolean;

  private readonly endpointUrl: string;
  private readonly apiKey: string;
  private readonly logger: AppLogger;
  private readonly timeoutMs: number;
  private readonly defaultHeaders: Record<string, string>;
  private readonly logTraffic: boolean;
  private readonly logMaxChars: number;
  private readonly extraBody?: OpenAICompatibleProviderOptions["extraBody"];

  constructor(options: OpenAICompatibleProviderOptions) {
    this.name = options.name;
    this.supportsTools = options.supportsTools ?? true;
    this.endpointUrl = options.endpointUrl;
    this.apiKey = options.apiKey;
    this.logger = options.logger;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.defaultHeaders = options.defaultHeaders ?? {};
    this.logTraffic = options.logTraffic ?? false;
    this.logMaxChars = options.logMaxChars ?? 4000;
    this.extraBody = options.extraBody;
  }

  isAvailable() {
    return Boolean(this.apiKey && this.endpointUrl);
  }

  classifyError(error: unknown): ProviderErrorInfo {
    return classifyProviderError(error);
  }

  async send(request: ChatProviderRequest): Promise<NormalizedProviderResponse> {
    const body = buildRequestBody(request, this.extraBody);

    if (this.logTraffic) {
      this.logger.debug(
        { provider: this.name, model: request.model, messageCount: request.messages.length },
        `${this.name} request`
      );
    }

    const startedAt = Date.now();

    let response: Response;
    try {
      response = await fetch(this.endpointUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          ...this.defaultHeaders
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    } catch (error) {
      throw new ProviderRequestError({
        provider: this.name,
        message: `${this.name} request failed: ${asErrorMessage(error)}`,
        cause: error
      });
    }

    if (!response.ok) {
      const bodyText = await response.text().catch(() => "unknown error");
      throw new ProviderRequestError({
        provider: this.name,
        status: response.status,
        bodyText,
        retryAfterMs: parseRetryAfterMs(response.headers.get("retry-after")),
        message: `${this.name} API error ${response.status}: ${bodyText}`
      });
    }

    let data: OpenAICompatibleResponse;
    try {
      data = (await response.json()) as OpenAICompatibleResponse;
    } catch (error) {
      throw new ProviderRequestError({
        provider: this.name,
        message: `${this.name} returned malformed response: ${asErrorMessage(error)}`,
        cause: error
      });
    }

    const choice = data.choices?.[0];
    if (!choice) {
      throw new ProviderRequestError({
        provider: this.name,
        message: `${this.name} returned empty choices`
      });
    }

    const toolCalls: LlmToolCall[] | undefined = choice.message.tool_calls?.map((call) => {
      let parsedArgs: Record<string, unknown> = {};

      try {
        parsedArgs = JSON.parse(call.function.arguments) as Record<string, unknown>;
      } catch {
        parsedArgs = {};
      }

      return {
        id: call.id,
        function: {
          name: call.function.name,
          arguments: parsedArgs
        }
      };
    });

    const latencyMs = Date.now() - startedAt;
    const content = stripReasoningArtifacts(choice.message.content ?? "");

    if (this.logTraffic) {
      const preview = content.length > this.logMaxChars ? `${content.slice(0, this.logMaxChars)}...` : content;
      this.logger.debug(
        {
          provider: this.name,
          model: request.model,
          latencyMs,
          promptTokens: data.usage?.prompt_tokens,
          completionTokens: data.usage?.completion_tokens
        },
        `${this.name} response: ${preview}`
      );
    }

    return {
      content,
      provider: this.name,
      model: request.model,
      latencyMs,
      finishReason: choice.finish_reason ?? undefined,
      rawUsage: data.usage,
      toolCalls,
      raw: data
    };
  }

  estimateCost(request: ChatProviderRequest, response: NormalizedProviderResponse) {
    const promptTokens = typeof response.rawUsage?.prompt_tokens === "number" ? response.rawUsage.prompt_tokens : undefined;
    const completionTokens = typeof response.rawUsage?.completion_tokens === "number" ? response.rawUsage.completion_tokens : undefined;
    const cachedTokens = typeof response.rawUsage?.prompt_tokens_details === "object" && response.rawUsage.prompt_tokens_details && typeof (response.rawUsage.prompt_tokens_details as { cached_tokens?: unknown }).cached_tokens === "number"
      ? (response.rawUsage.prompt_tokens_details as { cached_tokens: number }).cached_tokens
      : 0;

    if (promptTokens === undefined || completionTokens === undefined) {
      return undefined;
    }

    return calculateCostUsd(stripModelNamespace(request.model), promptTokens, completionTokens, cachedTokens);
  }
}

function buildRequestBody(
  request: ChatProviderRequest,
  extraBody?: Record<string, unknown> | ((request: ChatProviderRequest) => Record<string, unknown>)
) {
  const body: Record<string, unknown> = {
    model: request.model,
    messages: request.messages.map((message) => serializeOpenAiCompatibleMessage(message))
  };

  if (usesMaxCompletionTokens(request.model)) {
    if (request.maxTokens !== undefined) {
      body.max_completion_tokens = request.maxTokens;
    }
    body.reasoning_effort = "low";
  } else if (request.maxTokens !== undefined) {
    body.max_tokens = request.maxTokens;
  }

  if (request.temperature !== undefined && supportsCustomSampling(request.model)) {
    body.temperature = request.temperature;
  }

  if (request.topP !== undefined && supportsCustomSampling(request.model)) {
    body.top_p = request.topP;
  }

  if (request.format === "json") {
    body.response_format = { type: "json_object" };
  }

  if (request.tools?.length) {
    body.tools = request.tools.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters
      }
    }));
  }

  const extra = typeof extraBody === "function" ? extraBody(request) : extraBody;
  if (extra) {
    Object.assign(body, extra);
  }

  return body;
}

function serializeOpenAiCompatibleMessage(message: ChatProviderRequest["messages"][number]) {
  const isAssistantToolCall = message.role === "assistant" && Boolean(message.tool_calls?.length);

  return {
    role: message.role,
    content: isAssistantToolCall && !message.content ? null : message.content,
    ...(message.name && message.role !== "tool" ? { name: message.name } : {}),
    ...(message.role === "tool" && message.tool_call_id ? { tool_call_id: message.tool_call_id } : {}),
    ...(isAssistantToolCall
      ? {
          tool_calls: message.tool_calls?.map((call, index) => ({
            id: call.id ?? `tool-call-${index + 1}`,
            type: "function" as const,
            function: {
              name: call.function.name,
              arguments: JSON.stringify(call.function.arguments ?? {})
            }
          }))
        }
      : {})
  };
}

function stripModelNamespace(model: string) {
  const parts = model.split("/");
  return parts[parts.length - 1] ?? model;
}

function usesMaxCompletionTokens(model: string) {
  return /^gpt-5(?:[.-]|$)/i.test(stripModelNamespace(model));
}

function supportsCustomSampling(model: string) {
  return !usesMaxCompletionTokens(model);
}

function parseRetryAfterMs(value: string | null) {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }

  return parsed * 1000;
}
/**
 * Defensive stripping of reasoning artifacts emitted by some self-hosted /
 * third-party OpenAI-compatible models (DeepSeek-R1, Qwen QwQ, glm-thinking,
 * yandex-flash 4B reasoning) even when thinking-mode is disabled. We never
 * want raw chain-of-thought to leak into Discord messages.
 */
function stripReasoningArtifacts(content: string): string {
  if (!content) return content;
  let out = content;
  // <think>...</think>, <thinking>...</thinking>, <reasoning>...</reasoning>
  out = out.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, "");
  out = out.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, "");
  // Unclosed leading tag: <think>...\n\n
  out = out.replace(/^\s*<think(?:ing)?>[\s\S]*?(?:\n\n|<\/think(?:ing)?>)/i, "");
  // Markdown thought scaffolding sometimes seen in mini-reasoners
  out = out.replace(/^\s*\[(?:thought|reasoning|thinking)\][\s\S]*?\[\/(?:thought|reasoning|thinking)\]\s*/i, "");
  return out.trimStart();
}
