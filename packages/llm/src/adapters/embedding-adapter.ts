import type { AppEnv } from "@hori/config";

import { OllamaClient } from "../client/ollama-client";

export class EmbeddingAdapter {
  constructor(
    private readonly client: OllamaClient,
    private readonly env: AppEnv
  ) {}

  async embedOne(text: string): Promise<number[]> {
    const [vector] = await this.client.embed(this.env.OLLAMA_EMBED_MODEL, text);
    return vector ?? [];
  }
}

