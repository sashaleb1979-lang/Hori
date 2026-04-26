import type { AppPrismaClient, BotIntent, ContextBundleV2, ContextEntity, MessageEnvelope } from "@hori/shared";
import type { AppRedisClient } from "@hori/shared";

import { SummaryService } from "../summaries/summary-service";
import { ProfileService } from "../profiles/profile-service";
import { RelationshipService } from "../relationships/relationship-service";
import { RetrievalService } from "../retrieval/retrieval-service";
import { ActiveMemoryService } from "../active/active-memory-service";

const PROFILE_CACHE_TTL = 300;       // 5 min
const RELATIONSHIP_CACHE_TTL = 300;  // 5 min
const RELATIONSHIP_CONTEXT_HARD_DISABLED = true;

export class ContextService {
  constructor(
    private readonly prisma: AppPrismaClient,
    private readonly summaries: SummaryService,
    private readonly profiles: ProfileService,
    private readonly relationships: RelationshipService,
    private readonly retrieval: RetrievalService,
    private readonly activeMemory?: ActiveMemoryService,
    private readonly redis?: AppRedisClient
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
    const entities = detectEntities(options.message?.content ?? "");
    const [recentMessages, summaries, userProfile, relationship, serverMemories, replyChain, activeTopic, entityMemories, activeMemory] = await Promise.all([
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
      this.getCachedProfile(options.guildId, options.userId),
      RELATIONSHIP_CONTEXT_HARD_DISABLED ? Promise.resolve(null) : this.getCachedRelationship(options.guildId, options.userId),
      this.retrieval.findRelevantServerMemory(options.guildId, options.queryEmbedding),
      this.getReplyChain(options.guildId, options.channelId, options.message?.replyToMessageId ?? null),
      this.getActiveTopic(options.guildId, options.channelId),
      this.getEntityMemories(options.guildId, entities),
      this.activeMemory?.buildActiveMemory({
        guildId: options.guildId,
        channelId: options.channelId,
        userId: options.userId,
        query: options.message?.content ?? "",
        queryEmbedding: options.queryEmbedding,
        limit: 10
      }) ?? Promise.resolve(undefined)
    ]);
    const topicWindow = activeTopic ? await this.getTopicWindow(activeTopic.topicId) : [];

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
      summaries,
      serverMemories,
      userProfile: userProfile && userProfile.isEligible && userProfile.confidenceScore >= 0.45 ? userProfile : null,
      relationship,
      replyChain,
      repliedMessageId: options.message?.replyToMessageId ?? null,
      activeTopic,
      topicWindow,
      entities,
      entityMemories,
      activeMemory
    };
  }

  private async getReplyChain(guildId: string, channelId: string, replyToMessageId: string | null) {
    if (!replyToMessageId) {
      return [];
    }

    const chain: ContextBundleV2["replyChain"] = [];
    let currentId: string | null = replyToMessageId;

    for (let depth = 0; depth < 8 && currentId; depth += 1) {
      const replyMessage: {
        id: string;
        userId: string;
        content: string;
        createdAt: Date;
        replyToMessageId: string | null;
        user: { globalName: string | null; username: string | null; isBot: boolean };
      } | null = await this.prisma.message.findFirst({
        where: {
          id: currentId,
          guildId,
          channelId
        },
        include: { user: true }
      });

      if (!replyMessage) {
        break;
      }

      chain.push({
        id: replyMessage.id,
        author: replyMessage.user.globalName || replyMessage.user.username || replyMessage.userId,
        userId: replyMessage.userId,
        isBot: replyMessage.user.isBot,
        content: replyMessage.content,
        createdAt: replyMessage.createdAt,
        replyToMessageId: replyMessage.replyToMessageId
      });
      currentId = replyMessage.replyToMessageId;
    }

    return chain.reverse();
  }

  private async getActiveTopic(guildId: string, channelId: string): Promise<ContextBundleV2["activeTopic"]> {
    const topic = await this.prisma.topicSession.findFirst({
      where: {
        guildId,
        channelId,
        closedAt: null
      },
      orderBy: { lastActiveAt: "desc" }
    });

    if (!topic) {
      return null;
    }

    return {
      topicId: topic.id,
      title: topic.title,
      summaryShort: topic.summaryShort,
      summaryFacts: asStringArray(topic.summaryFacts),
      lastUpdatedAt: topic.lastActiveAt,
      confidence: topic.confidence
    };
  }

  private async getTopicWindow(topicId: string): Promise<ContextBundleV2["topicWindow"]> {
    const links = await this.prisma.topicMessageLink.findMany({
      where: { topicId },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        message: {
          include: { user: true }
        }
      }
    });

    return links
      .reverse()
      .map((link) => ({
        id: link.message.id,
        author: link.message.user.globalName || link.message.user.username || link.message.userId,
        userId: link.message.userId,
        isBot: link.message.user.isBot,
        content: link.message.content,
        createdAt: link.message.createdAt,
        replyToMessageId: link.message.replyToMessageId
      }));
  }

  private async getEntityMemories(guildId: string, entities: ContextEntity[]) {
    if (!entities.length) {
      return [];
    }

    const terms = [
      ...new Set(
        entities
          .flatMap((entity) => [entity.surface, entity.canonical])
          .filter((term): term is string => Boolean(term))
      )
    ].slice(0, 6);
    const memories = await this.prisma.serverMemory.findMany({
      where: {
        guildId,
        OR: terms.flatMap((term) => [
          { key: { contains: term, mode: "insensitive" as const } },
          { value: { contains: term, mode: "insensitive" as const } }
        ]),
        AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }]
      },
      orderBy: { updatedAt: "desc" },
      take: 3,
      select: {
        key: true,
        value: true,
        type: true
      }
    });

    return memories.map((memory) => ({ ...memory, score: 0.8 }));
  }

  // ---- Redis read-through cache for profile / relationship ----

  private async getCachedProfile(guildId: string, userId: string) {
    if (this.redis) {
      try {
        const cached = await this.redis.get(`ctx:profile:${guildId}:${userId}`);
        if (cached) return JSON.parse(cached, dateReviver);
      } catch { /* fallthrough to DB */ }
    }

    const profile = await this.profiles.getProfile(guildId, userId);

    if (this.redis && profile) {
      this.redis.set(`ctx:profile:${guildId}:${userId}`, JSON.stringify(profile), "EX", PROFILE_CACHE_TTL).catch(() => {});
    }

    return profile;
  }

  private async getCachedRelationship(guildId: string, userId: string) {
    if (this.redis) {
      try {
        const cached = await this.redis.get(`ctx:rel:${guildId}:${userId}`);
        if (cached) return JSON.parse(cached, dateReviver);
      } catch { /* fallthrough to DB */ }
    }

    const relationship = await this.relationships.getRelationship(guildId, userId);

    if (this.redis && relationship) {
      this.redis.set(`ctx:rel:${guildId}:${userId}`, JSON.stringify(relationship), "EX", RELATIONSHIP_CACHE_TTL).catch(() => {});
    }

    return relationship;
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

function detectEntities(content: string): ContextEntity[] {
  const normalized = content.toLowerCase();
  const candidates: Array<{ pattern: RegExp; entity: ContextEntity }> = [
    { pattern: /израил|israel/i, entity: { type: "place", surface: "Израиль", canonical: "israel", score: 0.92 } },
    { pattern: /палестин/i, entity: { type: "place", surface: "Палестина", canonical: "palestine", score: 0.86 } },
    { pattern: /хамас|hamas/i, entity: { type: "org", surface: "Хамас", canonical: "hamas", score: 0.9 } },
    { pattern: /анкап|анархо.?капитал|либертари/i, entity: { type: "concept", surface: "анкап", canonical: "anarcho-capitalism", score: 0.92 } },
    { pattern: /налог|регуляци|государств|этатизм|чиновник/i, entity: { type: "concept", surface: "государство", canonical: "state", score: 0.82 } },
    { pattern: /коммунизм|социализм|маркс|ленин|ссср/i, entity: { type: "concept", surface: "коммунизм", canonical: "communism", score: 0.88 } }
  ];

  return candidates.filter((candidate) => candidate.pattern.test(normalized)).map((candidate) => candidate.entity);
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
function dateReviver(_key: string, value: unknown) {
  if (typeof value === "string" && ISO_DATE_RE.test(value)) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return value;
}
