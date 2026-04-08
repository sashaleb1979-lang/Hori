import type { AppEnv } from "@hori/config";
import type { AppLogger, LlmChatMessage } from "@hori/shared";
import { asErrorMessage } from "@hori/shared";

interface OllamaToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

interface OllamaChatResponse {
  message: {
    role: "assistant";
    content: string;
    tool_calls?: OllamaToolCall[];
  };
}

export interface OllamaToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export class OllamaClient {
  constructor(
    private readonly env: AppEnv,
    private readonly logger: AppLogger
  ) {}

  async chat(options: {
    model: string;
    messages: LlmChatMessage[];
    tools?: OllamaToolDefinition[];
    format?: "json";
    temperature?: number;
  }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.env.OLLAMA_TIMEOUT_MS);

    try {
      const response = await fetch(new URL("/api/chat", this.env.OLLAMA_BASE_URL!), {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: options.model,
          stream: false,
          format: options.format,
          options: {
            temperature: options.temperature ?? 0.5
          },
          messages: options.messages,
          tools: options.tools
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama chat failed with status ${response.status}`);
      }

      return (await response.json()) as OllamaChatResponse;
    } catch (error) {
      this.logger.error({ error: asErrorMessage(error), model: options.model }, "ollama chat request failed");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async embed(model: string, input: string | string[]) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.env.OLLAMA_TIMEOUT_MS);

    try {
      const response = await fetch(new URL("/api/embed", this.env.OLLAMA_BASE_URL!), {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          input
        })
      });

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
    } finally {
      clearTimeout(timeout);
    }
  }
}
