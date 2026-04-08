import type { AppPrismaClient, ContextBundle } from "@hori/shared";

import { SummaryService } from "../summaries/summary-service";
import { ProfileService } from "../profiles/profile-service";
import { RelationshipService } from "../relationships/relationship-service";
import { RetrievalService } from "../retrieval/retrieval-service";

export class ContextService {
  constructor(
    private readonly prisma: AppPrismaClient,
    private readonly summaries: SummaryService,
    private readonly profiles: ProfileService,
    private readonly relationships: RelationshipService,
    private readonly retrieval: RetrievalService
  ) {}

  async buildContext(options: {
    guildId: string;
    channelId: string;
    userId: string;
    limit: number;
    queryEmbedding?: number[];
  }): Promise<ContextBundle> {
    const [recentMessages, summaries, userProfile, relationship, serverMemories] = await Promise.all([
      this.prisma.message.findMany({
        where: {
          guildId: options.guildId,
          channelId: options.channelId
        },
        orderBy: { createdAt: "desc" },
        take: options.limit,
        include: { user: true }
      }),
      this.summaries.getRecentSummaries(options.guildId, options.channelId, 3),
      this.profiles.getProfile(options.guildId, options.userId),
      this.relationships.getRelationship(options.guildId, options.userId),
      this.retrieval.findRelevantServerMemory(options.guildId, options.queryEmbedding)
    ]);

    return {
      recentMessages: recentMessages
        .reverse()
        .map((message) => ({
          author: message.user.globalName || message.user.username || message.userId,
          content: message.content,
          createdAt: message.createdAt
        })),
      summaries,
      serverMemories,
      userProfile: userProfile && userProfile.isEligible && userProfile.confidenceScore >= 0.45 ? userProfile : null,
      relationship
    };
  }
}
