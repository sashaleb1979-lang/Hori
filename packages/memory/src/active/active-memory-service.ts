import type { ActiveMemoryContext } from "@hori/shared";

import { RetrievalService } from "../retrieval/retrieval-service";

export class ActiveMemoryService {
  constructor(private readonly retrieval: RetrievalService) {}

  async buildActiveMemory(input: {
    guildId: string;
    channelId: string;
    userId: string;
    query: string;
    queryEmbedding?: number[];
    limit?: number;
  }): Promise<ActiveMemoryContext> {
    const query = input.query.trim();

    if (!query && !input.queryEmbedding?.length) {
      return {
        entries: [],
        trace: {
          enabled: true,
          layers: [],
          reason: "empty_query"
        }
      };
    }

    const entries = await this.retrieval.hybridRecall({
      guildId: input.guildId,
      channelId: input.channelId,
      userId: input.userId,
      query,
      queryEmbedding: input.queryEmbedding,
      limit: input.limit ?? 10
    });

    return {
      entries,
      trace: {
        enabled: true,
        layers: [...new Set(entries.map((entry) => entry.scope))],
        reason: entries.length ? "hybrid_recall" : "no_hits"
      }
    };
  }
}
