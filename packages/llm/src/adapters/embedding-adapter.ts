import type { LlmClient } from "../client/llm-client";
import type { ModelRouter } from "../router/model-router";

export class EmbeddingAdapter {
  constructor(
    private readonly client: LlmClient,
    private readonly modelRouter: ModelRouter
  ) {}

  async embedOne(text: string): Promise<number[]> {
    const [vector] = await this.client.embed(this.modelRouter.pickEmbedModel(), text);
    return vector ?? [];
  }
}

