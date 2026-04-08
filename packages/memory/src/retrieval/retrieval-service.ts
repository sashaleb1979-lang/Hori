import type { AppPrismaClient } from "@hori/shared";
import { toVectorLiteral } from "@hori/shared";

export class RetrievalService {
  constructor(private readonly prisma: AppPrismaClient) {}

  async findRelevantServerMemory(guildId: string, queryEmbedding?: number[], limit = 4) {
    if (!queryEmbedding?.length) {
      return this.prisma.serverMemory.findMany({
        where: {
          guildId,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          key: true,
          value: true,
          type: true
        }
      });
    }

    const vectorLiteral = toVectorLiteral(queryEmbedding);

    return this.prisma.$queryRawUnsafe<
      Array<{ key: string; value: string; type: string }>
    >(
      `
        SELECT key, value, type
        FROM "ServerMemory"
        WHERE "guildId" = $1
          AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
          AND embedding IS NOT NULL
        ORDER BY embedding <=> $2::vector
        LIMIT $3
      `,
      guildId,
      vectorLiteral,
      limit
    );
  }

  async findRelevantUserMemory(guildId: string, userId: string, queryEmbedding?: number[], limit = 3) {
    if (!queryEmbedding?.length) {
      return this.prisma.userMemoryNote.findMany({
        where: {
          guildId,
          userId,
          active: true,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
        },
        orderBy: { createdAt: "desc" },
        take: limit
      });
    }

    const vectorLiteral = toVectorLiteral(queryEmbedding);

    return this.prisma.$queryRawUnsafe<
      Array<{ id: string; key: string; value: string }>
    >(
      `
        SELECT id, key, value
        FROM "UserMemoryNote"
        WHERE "guildId" = $1
          AND "userId" = $2
          AND active = TRUE
          AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
          AND embedding IS NOT NULL
        ORDER BY embedding <=> $3::vector
        LIMIT $4
      `,
      guildId,
      userId,
      vectorLiteral,
      limit
    );
  }

  async searchSimilarMessages(guildId: string, channelId: string, queryEmbedding: number[], limit = 5) {
    const vectorLiteral = toVectorLiteral(queryEmbedding);

    return this.prisma.$queryRawUnsafe<
      Array<{ id: string; content: string; userId: string; createdAt: Date }>
    >(
      `
        SELECT m.id, m.content, m."userId", m."createdAt"
        FROM "MessageEmbedding" e
        INNER JOIN "Message" m ON m.id = e."messageId"
        WHERE e."guildId" = $1
          AND e."channelId" = $2
          AND e.embedding IS NOT NULL
        ORDER BY e.embedding <=> $3::vector
        LIMIT $4
      `,
      guildId,
      channelId,
      vectorLiteral,
      limit
    );
  }

  async rememberServerFact(input: {
    guildId: string;
    key: string;
    value: string;
    type: string;
    source?: string | null;
    createdBy?: string | null;
  }) {
    return this.prisma.serverMemory.upsert({
      where: {
        guildId_key: {
          guildId: input.guildId,
          key: input.key
        }
      },
      update: {
        value: input.value,
        type: input.type,
        source: input.source ?? undefined,
        createdBy: input.createdBy ?? undefined,
        updatedAt: new Date()
      },
      create: {
        guildId: input.guildId,
        key: input.key,
        value: input.value,
        type: input.type,
        source: input.source ?? undefined,
        createdBy: input.createdBy ?? undefined
      }
    });
  }

  async forgetServerFact(guildId: string, key: string): Promise<{ count: number }> {
    return this.prisma.serverMemory.deleteMany({
      where: { guildId, key }
    });
  }

  async setEmbedding(
    entityType: "server_memory" | "user_memory",
    entityId: string,
    vectorLiteral: string
  ) {
    if (entityType === "server_memory") {
      return this.prisma.$executeRawUnsafe(
        `UPDATE "ServerMemory" SET embedding = $1::vector WHERE id = $2`,
        vectorLiteral,
        entityId
      );
    }

    return this.prisma.$executeRawUnsafe(
      `UPDATE "UserMemoryNote" SET embedding = $1::vector WHERE id = $2`,
      vectorLiteral,
      entityId
    );
  }
}
