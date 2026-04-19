import type { LlmClient } from "../client/llm-client";
import type { ModelRouter } from "../router/model-router";

export class EmbeddingAdapter {
  constructor(
    private readonly client: LlmClient,
    private readonly modelRouter: ModelRouter
  ) {}

  async embedOne(text: string): Promise<number[]> {
    const embedding = this.modelRouter.pickEmbeddingModel();
    const [vector] = await this.client.embed(embedding.model, text, {
      dimensions: embedding.dimensions
    });
    return vector ?? [];
  }
}

