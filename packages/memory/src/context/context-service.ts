import type { AppPrismaClient, BotIntent, ContextBundleV2, MessageEnvelope } from "@hori/shared";
import type { AppRedisClient } from "@hori/shared";

import { SessionBufferService } from "../session/session-buffer-service";

import { SummaryService } from "../summaries/summary-service";
import { ProfileService } from "../profiles/profile-service";
import { RelationshipService } from "../relationships/relationship-service";
import { RetrievalService } from "../retrieval/retrieval-service";
import { ActiveMemoryService } from "../active/active-memory-service";

export class ContextService {
  constructor(
    private readonly prisma: AppPrismaClient,
    private readonly summaries: SummaryService,
    private readonly profiles: ProfileService,
    private readonly relationships: RelationshipService,
    private readonly retrieval: RetrievalService,
    private readonly activeMemory?: ActiveMemoryService,
    private readonly redis?: AppRedisClient,
    private readonly sessionBuffer?: SessionBufferService
  ) {}

  async buildContext(options: {
    guildId: string;
    channelId: string;
    userId: string;
    limit: number;
    queryEmbedding?: number[];
    message?: MessageEnvelope;
    intent?: BotIntent;
  }): Promise<ContextBundleV2> {
    const [recentMessages, activeMemory] = await Promise.all([
      this.prisma.message.findMany({
        where: {
          guildId: options.guildId,
          channelId: options.channelId
        },
        orderBy: { createdAt: "desc" },
        take: options.limit,
        include: { user: true }
      }),
      this.activeMemory?.buildActiveMemory({
        guildId: options.guildId,
        channelId: options.channelId,
        userId: options.userId,
        query: options.message?.content ?? "",
        queryEmbedding: options.queryEmbedding,
        limit: 10
      }) ?? Promise.resolve(undefined)
    ]);

    return {
      version: "v2",
      recentMessages: recentMessages
        .reverse()
        .map((message) => ({
          id: message.id,
          author: message.user.globalName || message.user.username || message.userId,
          userId: message.userId,
          isBot: message.user.isBot,
          content: message.content,
          createdAt: message.createdAt,
          replyToMessageId: message.replyToMessageId
        })),
      summaries: [],
      serverMemories: [],
      userProfile: null,
      relationship: null,
      replyChain: [],
      repliedMessageId: options.message?.replyToMessageId ?? null,
      activeTopic: null,
      topicWindow: [],
      entities: [],
      entityMemories: [],
      activeMemory
    };
  }

  /** Invalidate cached profile/relationship after an update (call from worker jobs). */
  async invalidateUserCache(guildId: string, userId: string) {
    if (!this.redis) return;
    await Promise.allSettled([
      this.redis.del(`ctx:profile:${guildId}:${userId}`),
      this.redis.del(`ctx:rel:${guildId}:${userId}`)
    ]);
  }
}
