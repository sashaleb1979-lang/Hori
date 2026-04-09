import type { AppEnv } from "@hori/config";
import type { AppLogger } from "@hori/shared";
import { asErrorMessage } from "@hori/shared";

import type { LlmChatOptions, LlmChatResponse, LlmClient } from "./llm-client";

export class OllamaClient implements LlmClient {
  constructor(
    private readonly env: AppEnv,
    private readonly logger: AppLogger
  ) {}

  async chat(options: LlmChatOptions): Promise<LlmChatResponse> {
    const baseUrl = this.env.OLLAMA_BASE_URL!;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.env.OLLAMA_TIMEOUT_MS);

    try {
      const response = await fetch(new URL("/api/chat", baseUrl), {
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

      return (await response.json()) as LlmChatResponse;
    } catch (error) {
      this.logger.error({ error: asErrorMessage(error), model: options.model, url: baseUrl }, "ollama chat request failed");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async embed(model: string, input: string | string[]): Promise<number[][]> {
    const baseUrl = this.env.OLLAMA_BASE_URL!;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.env.OLLAMA_TIMEOUT_MS);

    try {
      const response = await fetch(new URL("/api/embed", baseUrl), {
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
    } catch (error) {
      this.logger.error({ error: asErrorMessage(error), model, url: baseUrl }, "ollama embed request failed");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
