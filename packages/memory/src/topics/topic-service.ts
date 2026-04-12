import type { AppPrismaClient } from "@hori/shared";
import { toVectorLiteral } from "@hori/shared";

interface TopicServiceOptions {
  topicTtlMinutes?: number;
  similarityThreshold?: number;
}

interface TopicSessionSnapshot {
  id: string;
  guildId: string;
  channelId: string;
  title: string;
  summaryShort: string;
  summaryFacts: unknown;
  confidence: number;
  startedAt: Date;
  lastActiveAt: Date;
  closedAt: Date | null;
  closedReason: string | null;
}

export class TopicService {
  constructor(
    private readonly prisma: AppPrismaClient,
    private readonly options: TopicServiceOptions = {}
  ) {}

  async getActiveTopic(guildId: string, channelId: string): Promise<TopicSessionSnapshot | null> {
    return this.prisma.topicSession.findFirst({
      where: {
        guildId,
        channelId,
        closedAt: null
      },
      orderBy: { lastActiveAt: "desc" }
    });
  }

  async resetTopic(guildId: string, channelId: string, reason = "manual"): Promise<{ count: number }> {
    return this.prisma.topicSession.updateMany({
      where: {
        guildId,
        channelId,
        closedAt: null
      },
      data: {
        closedAt: new Date(),
        closedReason: reason
      }
    });
  }

  async updateFromMessage(input: {
    guildId: string;
    channelId: string;
    messageId: string;
    content: string;
    createdAt?: Date;
    replyToMessageId?: string | null;
    embedding?: number[];
  }) {
    const now = input.createdAt ?? new Date();
    const activeTopic = await this.getActiveTopic(input.guildId, input.channelId);
    const resetReason = activeTopic ? await this.getResetReason(input, activeTopic, now) : "no_active_topic";

    let topic = activeTopic;

    if (!topic || resetReason) {
      if (topic && resetReason) {
        await this.prisma.topicSession.update({
          where: { id: topic.id },
          data: {
            closedAt: now,
            closedReason: resetReason
          }
        });
      }

      const createdTopic = await this.prisma.topicSession.create({
        data: {
          guildId: input.guildId,
          channelId: input.channelId,
          title: buildTitle(input.content),
          summaryShort: buildSummary(input.content),
          summaryFacts: buildFacts(input.content),
          confidence: 0.55,
          lastActiveAt: now
        }
      });
      topic = createdTopic;

      if (input.embedding?.length) {
        await this.setTopicEmbedding(createdTopic.id, input.embedding);
      }
    } else {
      topic = await this.prisma.topicSession.update({
        where: { id: topic.id },
        data: {
          summaryShort: buildSummary(input.content),
          summaryFacts: mergeFacts(topic.summaryFacts, input.content),
          confidence: Math.min(0.95, topic.confidence + 0.03),
          lastActiveAt: now
        }
      });
    }

    if (!topic) {
      throw new Error("Topic session was not resolved after update");
    }

    await this.prisma.topicMessageLink.upsert({
      where: {
        topicId_messageId: {
          topicId: topic.id,
          messageId: input.messageId
        }
      },
      update: {
        relevance: 0.75
      },
      create: {
        topicId: topic.id,
        messageId: input.messageId,
        relevance: 0.75
      }
    });

    return {
      topicId: topic.id,
      resetReason
    };
  }

  private async getResetReason(
    input: {
      content: string;
      replyToMessageId?: string | null;
      embedding?: number[];
    },
    activeTopic: { id: string; title: string; summaryShort: string; lastActiveAt: Date },
    now: Date
  ) {
    if (input.replyToMessageId) {
      return null;
    }

    if (now.getTime() - activeTopic.lastActiveAt.getTime() > this.topicTtlMinutes * 60 * 1000) {
      return "ttl_expired";
    }

    if (/(новая тема|другое|сменим тему|кстати)\b/i.test(input.content)) {
      return "explicit_topic_switch";
    }

    if (isWeakTopicSignal(input.content)) {
      return null;
    }

    const embeddingSimilarity = input.embedding?.length ? await this.getEmbeddingSimilarity(activeTopic.id, input.embedding) : null;
    if (embeddingSimilarity !== null && embeddingSimilarity < this.similarityThreshold) {
      return "embedding_divergence";
    }

    if (embeddingSimilarity === null && lexicalSimilarity(input.content, `${activeTopic.title} ${activeTopic.summaryShort}`) < 0.12) {
      return "lexical_divergence";
    }

    return null;
  }

  private async getEmbeddingSimilarity(topicId: string, embedding: number[]) {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ similarity: number | null }>>(
      `
        SELECT 1 - (embedding <=> $1::vector) AS similarity
        FROM "TopicSession"
        WHERE id = $2 AND embedding IS NOT NULL
        LIMIT 1
      `,
      toVectorLiteral(embedding),
      topicId
    );

    return rows[0]?.similarity ?? null;
  }

  private async setTopicEmbedding(topicId: string, embedding: number[]) {
    await this.prisma.$executeRawUnsafe(
      `UPDATE "TopicSession" SET embedding = $1::vector WHERE id = $2`,
      toVectorLiteral(embedding),
      topicId
    );
  }

  private get topicTtlMinutes() {
    return this.options.topicTtlMinutes ?? 30;
  }

  private get similarityThreshold() {
    return this.options.similarityThreshold ?? 0.35;
  }
}

function buildTitle(content: string) {
  const compact = content.replace(/\s+/g, " ").trim();
  return (compact || "Новая тема").slice(0, 80);
}

function buildSummary(content: string) {
  return buildTitle(content).slice(0, 180);
}

function buildFacts(content: string) {
  return [buildSummary(content)].filter(Boolean);
}

function mergeFacts(existing: unknown, content: string) {
  const facts = Array.isArray(existing) ? existing.filter((item): item is string => typeof item === "string") : [];
  const next = buildSummary(content);
  return [...new Set([...facts.slice(-5), next])].slice(-6);
}

function lexicalSimilarity(left: string, right: string) {
  const leftTerms = termSet(left);
  const rightTerms = termSet(right);

  if (!leftTerms.size || !rightTerms.size) {
    return 0;
  }

  let overlap = 0;
  for (const term of leftTerms) {
    if (rightTerms.has(term)) {
      overlap += 1;
    }
  }

  return overlap / Math.max(leftTerms.size, rightTerms.size);
}

function isWeakTopicSignal(content: string) {
  const compact = content.replace(/\s+/g, " ").trim();
  return compact.length < 20 || termSet(compact).size < 2;
}

function termSet(value: string) {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((term) => term.length >= 4)
  );
}
