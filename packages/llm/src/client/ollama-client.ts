import type { AppEnv } from "@hori/config";
import type { AppLogger } from "@hori/shared";
import { asErrorMessage } from "@hori/shared";

import type { LlmChatOptions, LlmChatResponse, LlmClient, LlmToolCall } from "./llm-client";

interface OllamaTagsResponse {
  models?: Array<{ name?: string }>;
}

interface ModelDescriptor {
  name: string;
  normalized: string;
  family: string;
  familyNormalized: string;
  sizeLabel?: string;
  sizeValue?: number;
  isEmbedding: boolean;
}

interface OllamaChatChunk {
  error?: string;
  done?: boolean;
  message?: {
    role?: "assistant";
    content?: string;
    tool_calls?: LlmToolCall[];
  };
}

const MIN_OLLAMA_CHAT_TIMEOUT_MS = 240_000;
const MIN_OLLAMA_EMBED_TIMEOUT_MS = 180_000;

function normalizeModelPart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function shouldDisableThinking(model: string) {
  const normalized = normalizeModelPart(model);
  return normalized.startsWith("qwen3") || normalized.startsWith("qwen35");
}

function parseModelSize(sizeLabel?: string) {
  if (!sizeLabel) {
    return undefined;
  }

  const match = sizeLabel.toLowerCase().match(/(\d+(?:\.\d+)?)/);
  if (!match) {
    return undefined;
  }

  return Number(match[1]);
}

function describeModel(name: string): ModelDescriptor {
  const [family, sizeLabel] = name.split(":", 2);
  const lowerName = name.toLowerCase();

  return {
    name,
    normalized: normalizeModelPart(name),
    family,
    familyNormalized: normalizeModelPart(family),
    sizeLabel,
    sizeValue: parseModelSize(sizeLabel),
    isEmbedding: lowerName.includes("embed") || lowerName.includes("embedding")
  };
}

function sharedPrefixLength(left: string, right: string) {
  const limit = Math.min(left.length, right.length);
  let index = 0;

  while (index < limit && left[index] === right[index]) {
    index += 1;
  }

  return index;
}

export function pickClosestInstalledModel(requestedModel: string, availableModels: string[]) {
  if (!availableModels.length) {
    return null;
  }

  const requested = describeModel(requestedModel);
  const candidates = availableModels.map(describeModel);
  const typedCandidates = requested.isEmbedding ? candidates.filter((model) => model.isEmbedding) : candidates.filter((model) => !model.isEmbedding);
  const pool = typedCandidates.length ? typedCandidates : candidates;

  let best: { model: ModelDescriptor; score: number } | null = null;

  for (const candidate of pool) {
    let score = 0;

    if (candidate.name === requested.name) {
      score += 1000;
    }

    if (candidate.normalized === requested.normalized) {
      score += 500;
    }

    if (candidate.familyNormalized === requested.familyNormalized) {
      score += 250;
    }

    if (
      candidate.familyNormalized.startsWith(requested.familyNormalized) ||
      requested.familyNormalized.startsWith(candidate.familyNormalized)
    ) {
      score += 180;
    }

    score += sharedPrefixLength(candidate.familyNormalized, requested.familyNormalized) * 10;

    if (requested.sizeLabel && candidate.sizeLabel) {
      if (requested.sizeLabel.toLowerCase() === candidate.sizeLabel.toLowerCase()) {
        score += 120;
      } else if (requested.sizeValue !== undefined && candidate.sizeValue !== undefined) {
        score += Math.max(0, 60 - Math.abs(requested.sizeValue - candidate.sizeValue) * 8);
      }
    }

    if (!candidate.isEmbedding) {
      score += 20;
    }

    if (!requested.isEmbedding && candidate.isEmbedding) {
      score -= 300;
    }

    if (requested.isEmbedding && !candidate.isEmbedding) {
      score -= 300;
    }

    if (!best || score > best.score) {
      best = { model: candidate, score };
    }
  }

  if (!best || best.score < 25) {
    return null;
  }

  return best.model.name;
}

function buildChatPayload(options: LlmChatOptions, model: string, maxTokens: number) {
  return {
    model,
    stream: true,
    ...(shouldDisableThinking(model) ? { think: false } : {}),
    format: options.format,
    options: {
      temperature: options.temperature ?? 0.5,
      num_predict: maxTokens
    },
    messages: options.messages,
    tools: options.tools
  };
}

export function parseOllamaChatResponseBody(bodyText: string): LlmChatResponse {
  const trimmedBody = bodyText.trim();
  if (!trimmedBody) {
    return {
      message: {
        role: "assistant",
        content: ""
      }
    };
  }

  const lines = trimmedBody
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const payloads = lines.map((line) => JSON.parse(line) as OllamaChatChunk);

  if (payloads.length === 1 && payloads[0]?.message?.content !== undefined && !trimmedBody.includes("\n")) {
    const message = payloads[0].message;

    return {
      message: {
        role: message?.role ?? "assistant",
        content: message?.content ?? "",
        ...(message?.tool_calls ? { tool_calls: message.tool_calls } : {})
      }
    };
  }

  let role: "assistant" = "assistant";
  let content = "";
  let toolCalls: LlmToolCall[] | undefined;

  for (const payload of payloads) {
    if (payload.error) {
      throw new Error(`Ollama chat failed: ${payload.error}`);
    }

    if (payload.message?.role) {
      role = payload.message.role;
    }

    if (payload.message?.content) {
      content += payload.message.content;
    }

    if (payload.message?.tool_calls?.length) {
      toolCalls = payload.message.tool_calls;
    }
  }

  return {
    message: {
      role,
      content,
      ...(toolCalls ? { tool_calls: toolCalls } : {})
    }
  };
}

export class OllamaClient implements LlmClient {
  private readonly resolvedModelAliases = new Map<string, string>();

  constructor(
    private readonly env: AppEnv,
    private readonly logger: AppLogger
  ) {}

  async chat(options: LlmChatOptions): Promise<LlmChatResponse> {
    const baseUrl = this.env.OLLAMA_BASE_URL;
    if (!baseUrl) {
      throw new Error("OLLAMA_BASE_URL not configured \u2014 use /bot-ai-url to set it");
    }
    const requestedModel = options.model;
    const maxTokens = Math.max(32, this.env.LLM_REPLY_MAX_TOKENS);

    try {
      const resolvedModel = await this.resolveModelAlias(baseUrl, requestedModel);
      let response = await this.postJson(
        new URL("/api/chat", baseUrl),
        buildChatPayload(options, resolvedModel, maxTokens),
        Math.max(this.env.OLLAMA_TIMEOUT_MS, MIN_OLLAMA_CHAT_TIMEOUT_MS)
      );

      if (response.ok) {
        return await this.readChatResponse(response);
      }

      const fallbackModel = await this.tryResolveMissingModel(baseUrl, requestedModel, response, "chat");
      if (fallbackModel) {
        response = await this.postJson(
          new URL("/api/chat", baseUrl),
          buildChatPayload(options, fallbackModel, maxTokens),
          Math.max(this.env.OLLAMA_TIMEOUT_MS, MIN_OLLAMA_CHAT_TIMEOUT_MS)
        );

        if (response.ok) {
          return await this.readChatResponse(response);
        }
      }

      throw new Error(`Ollama chat failed with status ${response.status}`);
    } catch (error) {
      const errorText = asErrorMessage(error);
      this.logger.error({ error: errorText, model: requestedModel, url: baseUrl }, `ollama chat request failed: url=${baseUrl} model=${requestedModel} error=${errorText}`);
      throw error;
    }
  }

  async embed(model: string, input: string | string[]): Promise<number[][]> {
    const baseUrl = this.env.OLLAMA_BASE_URL;
    if (!baseUrl) {
      throw new Error("OLLAMA_BASE_URL not configured \u2014 use /bot-ai-url to set it");
    }
    const requestedModel = model;

    try {
      const resolvedModel = await this.resolveModelAlias(baseUrl, requestedModel);
      let response = await this.postJson(new URL("/api/embed", baseUrl), {
        model: resolvedModel,
        input
      }, Math.max(this.env.OLLAMA_TIMEOUT_MS, MIN_OLLAMA_EMBED_TIMEOUT_MS));

      if (!response.ok) {
        const fallbackModel = await this.tryResolveMissingModel(baseUrl, requestedModel, response, "embed");
        if (fallbackModel) {
          response = await this.postJson(new URL("/api/embed", baseUrl), {
            model: fallbackModel,
            input
          }, Math.max(this.env.OLLAMA_TIMEOUT_MS, MIN_OLLAMA_EMBED_TIMEOUT_MS));
        }
      }

      if (!response.ok) {
        throw new Error(`Ollama embed failed with status ${response.status}`);
      }

      const payload = (await response.json()) as { embeddings?: number[][]; embedding?: number[] };

      if (payload.embeddings?.length) {
        return payload.embeddings;
      }

      if (payload.embedding) {
        return [payload.embedding];
      }

      return [];
    } catch (error) {
      const errorText = asErrorMessage(error);
      this.logger.error({ error: errorText, model: requestedModel, url: baseUrl }, `ollama embed request failed: url=${baseUrl} model=${requestedModel} error=${errorText}`);
      throw error;
    }
  }

  private async readChatResponse(response: Response) {
    return parseOllamaChatResponseBody(await response.text());
  }

  private async postJson(url: URL, payload: unknown, timeoutMs = this.env.OLLAMA_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchInstalledModels(baseUrl: string) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(this.env.OLLAMA_TIMEOUT_MS, 10000));

    try {
      const response = await fetch(new URL("/api/tags", baseUrl), {
        signal: controller.signal
      });

      if (!response.ok) {
        return [];
      }

      const payload = (await response.json()) as OllamaTagsResponse;
      return (payload.models ?? []).map((model) => model.name?.trim()).filter((model): model is string => Boolean(model));
    } catch {
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }

  private async resolveModelAlias(baseUrl: string, requestedModel: string) {
    const cached = this.resolvedModelAliases.get(requestedModel);
    if (cached) {
      return cached;
    }

    const availableModels = await this.fetchInstalledModels(baseUrl);
    if (!availableModels.length || availableModels.includes(requestedModel)) {
      return requestedModel;
    }

    const fallbackModel = pickClosestInstalledModel(requestedModel, availableModels);
    if (!fallbackModel || fallbackModel === requestedModel) {
      return requestedModel;
    }

    this.rememberResolvedModel(requestedModel, fallbackModel, availableModels, "preflight");
    return fallbackModel;
  }

  private async tryResolveMissingModel(baseUrl: string, requestedModel: string, response: Response, operation: "chat" | "embed") {
    if (response.status !== 404) {
      return null;
    }

    const errorText = await response.text();
    if (!/model .* not found/i.test(errorText)) {
      return null;
    }

    const availableModels = await this.fetchInstalledModels(baseUrl);
    const fallbackModel = pickClosestInstalledModel(requestedModel, availableModels);
    if (!fallbackModel || fallbackModel === requestedModel) {
      return null;
    }

    this.rememberResolvedModel(requestedModel, fallbackModel, availableModels, operation);
    return fallbackModel;
  }

  private rememberResolvedModel(
    requestedModel: string,
    fallbackModel: string,
    availableModels: string[],
    operation: "chat" | "embed" | "preflight"
  ) {
    this.resolvedModelAliases.set(requestedModel, fallbackModel);

    if (this.env.OLLAMA_FAST_MODEL === requestedModel) {
      this.env.OLLAMA_FAST_MODEL = fallbackModel;
    }

    if (this.env.OLLAMA_SMART_MODEL === requestedModel) {
      this.env.OLLAMA_SMART_MODEL = fallbackModel;
    }

    if (this.env.OLLAMA_EMBED_MODEL === requestedModel) {
      this.env.OLLAMA_EMBED_MODEL = fallbackModel;
    }

    this.logger.warn(
      {
        requestedModel,
        fallbackModel,
        availableModels,
        operation
      },
      "requested ollama model is missing, using closest installed model instead"
    );
  }
}
