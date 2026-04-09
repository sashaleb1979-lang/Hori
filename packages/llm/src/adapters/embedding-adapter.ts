import type { AppEnv } from "@hori/config";

import type { LlmClient } from "../client/llm-client";

export class EmbeddingAdapter {
  constructor(
    private readonly client: LlmClient,
    private readonly env: AppEnv
  ) {}

  async embedOne(text: string): Promise<number[]> {
    const [vector] = await this.client.embed(this.env.OLLAMA_EMBED_MODEL, text);
    return vector ?? [];
  }
}

