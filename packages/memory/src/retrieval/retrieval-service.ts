import type { ActiveMemoryEntry, AppLogger, AppPrismaClient } from "@hori/shared";
import { asErrorMessage, toVectorLiteral } from "@hori/shared";

export interface HybridRecallInput {
  guildId: string;
  channelId: string;
  userId: string;
  query: string;
  queryEmbedding?: number[];
  limit?: number;
}

const temporalDecayHalfLifeDays = 30;
const temporalDecayFloor = 0.65;

interface HybridRow {
  scope: ActiveMemoryEntry["scope"];
  id: string;
  key: string;
  value: string;
  type: string;
  createdAt?: Date;
  updatedAt?: Date;
  userId?: string | null;
  rank: number;
  reason: "vector" | "lexical" | "recent";
  /** Salience weight from DB (0..1, default 0.5 = neutral). Used in RRF score boost. */
  salience?: number;
  /** Internal score used only to order rows before assigning RRF ranks. */
  sortScore?: number;
}

interface ScoredHybridHit {
  row: HybridRow;
  score: number;
  reasons: Set<string>;
}

type ServerMemoryRow = { id: string; key: string; value: string; type: string; createdAt: Date; updatedAt: Date };
type UserMemoryRow = { id: string; key: string; value: string; createdAt: Date; userId?: string | null };
type MessageMemoryRow = { id: string; content: string; userId: string; createdAt: Date };
type ChannelMemoryRow = { id: string; key: string; value: string; type: string; createdAt: Date; updatedAt: Date; confidence: number; salience: number };
type EventMemoryRow = { id: string; eventKey: string; key: string; value: string; type: string; createdAt: Date; updatedAt: Date; confidence: number; salience: number };
type MemoryEmbeddingEntityType = "server_memory" | "user_memory" | "channel_memory" | "event_memory";

export class RetrievalService {
  constructor(
    private readonly prisma: AppPrismaClient,
    private readonly logger?: AppLogger
  ) {}

  async findRelevantServerMemory(guildId: string, queryEmbedding?: number[], limit = 4): Promise<ServerMemoryRow[]> {
    if (!queryEmbedding?.length) {
      return this.prisma.serverMemory.findMany({
        where: {
          guildId,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          key: true,
          value: true,
          type: true,
          createdAt: true,
          updatedAt: true
        }
      });
    }

    const vectorLiteral = toVectorLiteral(queryEmbedding);
    const dimensions = queryEmbedding.length;

    return this.withVectorFallback(
      "server_memory",
      () => this.findRelevantServerMemory(guildId, undefined, limit),
      () => this.prisma.$queryRawUnsafe<ServerMemoryRow[]>(
        `
          SELECT id, key, value, type, "createdAt", "updatedAt"
          FROM "ServerMemory"
          WHERE "guildId" = $1
            AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
            AND embedding IS NOT NULL
            AND (dimensions = $3 OR (dimensions IS NULL AND vector_dims(embedding) = $3))
          ORDER BY embedding <=> $2::vector
          LIMIT $4
        `,
        guildId,
        vectorLiteral,
        dimensions,
        limit
      )
    );
  }

  async findRelevantUserMemory(guildId: string, userId: string, queryEmbedding?: number[], limit = 3): Promise<UserMemoryRow[]> {
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
    const dimensions = queryEmbedding.length;

    return this.withVectorFallback(
      "user_memory",
      () => this.findRelevantUserMemory(guildId, userId, undefined, limit),
      () => this.prisma.$queryRawUnsafe<UserMemoryRow[]>(
        `
          SELECT id, key, value, "createdAt"
          FROM "UserMemoryNote"
          WHERE "guildId" = $1
            AND "userId" = $2
            AND active = TRUE
            AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
            AND embedding IS NOT NULL
            AND (dimensions = $4 OR (dimensions IS NULL AND vector_dims(embedding) = $4))
          ORDER BY embedding <=> $3::vector
          LIMIT $5
        `,
        guildId,
        userId,
        vectorLiteral,
        dimensions,
        limit
      )
    );
  }

  async searchSimilarMessages(guildId: string, channelId: string, queryEmbedding: number[], limit = 5): Promise<MessageMemoryRow[]> {
    const vectorLiteral = toVectorLiteral(queryEmbedding);
    const dimensions = queryEmbedding.length;

    return this.withVectorFallback(
      "message_similarity",
      () => Promise.resolve([]),
      () => this.prisma.$queryRawUnsafe<MessageMemoryRow[]>(
        `
          SELECT m.id, m.content, m."userId", m."createdAt"
          FROM "MessageEmbedding" e
          INNER JOIN "Message" m ON m.id = e."messageId"
          WHERE e."guildId" = $1
            AND e."channelId" = $2
            AND e.embedding IS NOT NULL
            AND e.dimensions = $4
          ORDER BY e.embedding <=> $3::vector
          LIMIT $5
        `,
        guildId,
        channelId,
        vectorLiteral,
        dimensions,
        limit
      )
    );
  }

  async findRelevantChannelMemory(guildId: string, channelId: string, queryEmbedding?: number[], limit = 4): Promise<ChannelMemoryRow[]> {
    if (!queryEmbedding?.length) {
      return this.prisma.channelMemoryNote.findMany({
        where: {
          guildId,
          channelId,
          active: true,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
        },
        orderBy: [{ salience: "desc" }, { updatedAt: "desc" }],
        take: limit,
        select: {
          id: true,
          key: true,
          value: true,
          type: true,
          createdAt: true,
          updatedAt: true,
          confidence: true,
          salience: true
        }
      });
    }

    const vectorLiteral = toVectorLiteral(queryEmbedding);
    const dimensions = queryEmbedding.length;

    return this.withVectorFallback(
      "channel_memory",
      () => this.findRelevantChannelMemory(guildId, channelId, undefined, limit),
      () => this.prisma.$queryRawUnsafe<ChannelMemoryRow[]>(
        `
          SELECT id, key, value, type, "createdAt", "updatedAt", confidence, salience
          FROM "ChannelMemoryNote"
          WHERE "guildId" = $1
            AND "channelId" = $2
            AND active = TRUE
            AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
            AND embedding IS NOT NULL
            AND (dimensions = $4 OR (dimensions IS NULL AND vector_dims(embedding) = $4))
          ORDER BY embedding <=> $3::vector
          LIMIT $5
        `,
        guildId,
        channelId,
        vectorLiteral,
        dimensions,
        limit
      )
    );
  }

  async findRelevantEventMemory(guildId: string, channelId: string, queryEmbedding?: number[], limit = 4): Promise<EventMemoryRow[]> {
    if (!queryEmbedding?.length) {
      return this.prisma.eventMemory.findMany({
        where: {
          guildId,
          active: true,
          OR: [
            { channelId },
            { channelId: null },
            { tags: { hasSome: ["server", "global"] } }
          ],
          AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }]
        },
        orderBy: [{ salience: "desc" }, { updatedAt: "desc" }],
        take: limit,
        select: {
          id: true,
          eventKey: true,
          key: true,
          value: true,
          type: true,
          createdAt: true,
          updatedAt: true,
          confidence: true,
          salience: true
        }
      });
    }

    const vectorLiteral = toVectorLiteral(queryEmbedding);
    const dimensions = queryEmbedding.length;

    return this.withVectorFallback(
      "event_memory",
      () => this.findRelevantEventMemory(guildId, channelId, undefined, limit),
      () => this.prisma.$queryRawUnsafe<EventMemoryRow[]>(
        `
          SELECT id, "eventKey", key, value, type, "createdAt", "updatedAt", confidence, salience
          FROM "EventMemory"
          WHERE "guildId" = $1
            AND active = TRUE
            AND ("channelId" = $2 OR "channelId" IS NULL OR tags && ARRAY['server','global']::TEXT[])
            AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
            AND embedding IS NOT NULL
            AND (dimensions = $4 OR (dimensions IS NULL AND vector_dims(embedding) = $4))
          ORDER BY embedding <=> $3::vector
          LIMIT $5
        `,
        guildId,
        channelId,
        vectorLiteral,
        dimensions,
        limit
      )
    );
  }

  async hybridRecall(input: HybridRecallInput): Promise<ActiveMemoryEntry[]> {
    const limit = input.limit ?? 10;
    const vectorLimit = Math.max(limit, 8);
    const lexicalLimit = Math.max(limit, 8);
    const vectorRows = input.queryEmbedding?.length
      ? await this.withVectorFallback("hybrid_recall", () => Promise.resolve([]), () => this.getVectorHybridRows(input, vectorLimit))
      : [];
    const lexicalRows = await this.getLexicalHybridRows(input, lexicalLimit);
    const recentRows = vectorRows.length || lexicalRows.length ? [] : await this.getRecentHybridRows(input, Math.min(limit, 6));

    return mergeHybridRows([...vectorRows, ...lexicalRows, ...recentRows], limit);
  }

  async rememberServerFact(input: {
    guildId: string;
    key: string;
    value: string;
    type: string;
    source?: string | null;
    createdBy?: string | null;
  }) {
    const memory = await this.prisma.serverMemory.upsert({
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

    await this.invalidateEmbedding("server_memory", memory.id);
    return memory;
  }

  async rememberChannelFact(input: {
    guildId: string;
    channelId: string;
    key: string;
    value: string;
    type: string;
    tags?: string[];
    confidence?: number;
    salience?: number;
    source?: string | null;
    createdBy?: string | null;
  }) {
    const memory = await this.prisma.channelMemoryNote.upsert({
      where: {
        guildId_channelId_key: {
          guildId: input.guildId,
          channelId: input.channelId,
          key: input.key
        }
      },
      update: {
        value: input.value,
        type: input.type,
        tags: input.tags ?? undefined,
        confidence: input.confidence ?? undefined,
        salience: input.salience ?? undefined,
        source: input.source ?? undefined,
        createdBy: input.createdBy ?? undefined,
        active: true,
        expiresAt: null,
        updatedAt: new Date()
      },
      create: {
        guildId: input.guildId,
        channelId: input.channelId,
        key: input.key,
        value: input.value,
        type: input.type,
        tags: input.tags ?? [],
        confidence: input.confidence ?? 0.6,
        salience: input.salience ?? 0.5,
        source: input.source ?? undefined,
        createdBy: input.createdBy ?? undefined
      }
    });

    await this.invalidateEmbedding("channel_memory", memory.id);
    return memory;
  }

  async rememberEventFact(input: {
    guildId: string;
    channelId?: string | null;
    eventKey: string;
    key: string;
    value: string;
    type: string;
    title?: string | null;
    tags?: string[];
    confidence?: number;
    salience?: number;
    source?: string | null;
    createdBy?: string | null;
  }) {
    const memory = await this.prisma.eventMemory.upsert({
      where: {
        guildId_eventKey_key: {
          guildId: input.guildId,
          eventKey: input.eventKey,
          key: input.key
        }
      },
      update: {
        channelId: input.channelId ?? undefined,
        title: input.title ?? undefined,
        value: input.value,
        type: input.type,
        tags: input.tags ?? undefined,
        confidence: input.confidence ?? undefined,
        salience: input.salience ?? undefined,
        source: input.source ?? undefined,
        createdBy: input.createdBy ?? undefined,
        active: true,
        expiresAt: null,
        updatedAt: new Date()
      },
      create: {
        guildId: input.guildId,
        channelId: input.channelId ?? undefined,
        eventKey: input.eventKey,
        title: input.title ?? undefined,
        key: input.key,
        value: input.value,
        type: input.type,
        tags: input.tags ?? [],
        confidence: input.confidence ?? 0.6,
        salience: input.salience ?? 0.5,
        source: input.source ?? undefined,
        createdBy: input.createdBy ?? undefined
      }
    });

    await this.invalidateEmbedding("event_memory", memory.id);
    return memory;
  }

  async forgetServerFact(guildId: string, key: string): Promise<{ count: number }> {
    return this.prisma.serverMemory.deleteMany({
      where: { guildId, key }
    });
  }

  async setEmbedding(
    entityType: MemoryEmbeddingEntityType,
    entityId: string,
    vectorLiteral: string,
    dimensions?: number
  ) {
    const resolvedDimensions = dimensions ?? parseVectorLiteralDimensions(vectorLiteral);

    return this.prisma.$executeRawUnsafe(
      `UPDATE "${resolveEmbeddingTable(entityType)}" SET embedding = $1::vector, dimensions = $2 WHERE id = $3`,
      vectorLiteral,
      resolvedDimensions,
      entityId
    );
  }

  private async getVectorHybridRows(input: HybridRecallInput, limit: number): Promise<HybridRow[]> {
    if (!input.queryEmbedding?.length) {
      return [];
    }

    const vectorLiteral = toVectorLiteral(input.queryEmbedding);
    const dimensions = input.queryEmbedding.length;
    const perScopeLimit = Math.max(2, Math.ceil(limit / 2));
    const [server, user, channel, events, messages] = await Promise.all([
      this.prisma.$queryRawUnsafe<Array<Omit<HybridRow, "rank" | "reason">>>(
        `
          SELECT 'server' AS scope, id, key, value, type, "createdAt", "updatedAt", NULL::TEXT AS "userId", embedding <=> $2::vector AS "sortScore"
          FROM "ServerMemory"
          WHERE "guildId" = $1
            AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
            AND embedding IS NOT NULL
            AND (dimensions = $3 OR (dimensions IS NULL AND vector_dims(embedding) = $3))
          ORDER BY embedding <=> $2::vector
          LIMIT $4
        `,
        input.guildId,
        vectorLiteral,
        dimensions,
        perScopeLimit
      ),
      this.prisma.$queryRawUnsafe<Array<Omit<HybridRow, "rank" | "reason">>>(
        `
          SELECT 'user' AS scope, id, key, value, 'user_note' AS type, "createdAt", "userId", embedding <=> $3::vector AS "sortScore"
          FROM "UserMemoryNote"
          WHERE "guildId" = $1
            AND "userId" = $2
            AND active = TRUE
            AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
            AND embedding IS NOT NULL
            AND (dimensions = $4 OR (dimensions IS NULL AND vector_dims(embedding) = $4))
          ORDER BY embedding <=> $3::vector
          LIMIT $5
        `,
        input.guildId,
        input.userId,
        vectorLiteral,
        dimensions,
        perScopeLimit
      ),
      this.prisma.$queryRawUnsafe<Array<Omit<HybridRow, "rank" | "reason">>>(
        `
          SELECT 'channel' AS scope, id, key, value, type, "createdAt", "updatedAt", NULL::TEXT AS "userId", COALESCE(salience, 0.5) AS salience, embedding <=> $3::vector AS "sortScore"
          FROM "ChannelMemoryNote"
          WHERE "guildId" = $1
            AND "channelId" = $2
            AND active = TRUE
            AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
            AND embedding IS NOT NULL
            AND (dimensions = $4 OR (dimensions IS NULL AND vector_dims(embedding) = $4))
          ORDER BY embedding <=> $3::vector
          LIMIT $5
        `,
        input.guildId,
        input.channelId,
        vectorLiteral,
        dimensions,
        perScopeLimit
      ),
      this.prisma.$queryRawUnsafe<Array<Omit<HybridRow, "rank" | "reason">>>(
        `
          SELECT 'event' AS scope, id, key, value, type, "createdAt", "updatedAt", NULL::TEXT AS "userId", COALESCE(salience, 0.5) AS salience, embedding <=> $3::vector AS "sortScore"
          FROM "EventMemory"
          WHERE "guildId" = $1
            AND active = TRUE
            AND ("channelId" = $2 OR "channelId" IS NULL OR tags && ARRAY['server','global']::TEXT[])
            AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
            AND embedding IS NOT NULL
            AND (dimensions = $4 OR (dimensions IS NULL AND vector_dims(embedding) = $4))
          ORDER BY embedding <=> $3::vector
          LIMIT $5
        `,
        input.guildId,
        input.channelId,
        vectorLiteral,
        dimensions,
        perScopeLimit
      ),
      this.prisma.$queryRawUnsafe<Array<Omit<HybridRow, "rank" | "reason">>>(
        `
          SELECT 'message' AS scope, m.id, m.id AS key, m.content AS value, 'message' AS type, m."createdAt", m."userId", e.embedding <=> $3::vector AS "sortScore"
          FROM "MessageEmbedding" e
          INNER JOIN "Message" m ON m.id = e."messageId"
          WHERE e."guildId" = $1
            AND e."channelId" = $2
            AND e.embedding IS NOT NULL
            AND e.dimensions = $4
          ORDER BY e.embedding <=> $3::vector
          LIMIT $5
        `,
        input.guildId,
        input.channelId,
        vectorLiteral,
        dimensions,
        perScopeLimit
      )
    ]);

    return rankRows([...server, ...user, ...channel, ...events, ...messages], "vector", compareVectorRows);
  }

  private async getLexicalHybridRows(input: HybridRecallInput, limit: number): Promise<HybridRow[]> {
    const terms = extractLexicalTerms(input.query);
    if (!terms.length) {
      return [];
    }

    private async invalidateEmbedding(entityType: MemoryEmbeddingEntityType, entityId: string) {
      return this.prisma.$executeRawUnsafe(
        `UPDATE "${resolveEmbeddingTable(entityType)}" SET embedding = NULL, dimensions = NULL WHERE id = $1`,
        entityId
      );
    }


  function resolveEmbeddingTable(entityType: MemoryEmbeddingEntityType) {
    if (entityType === "server_memory") {
      return "ServerMemory";
    }

    if (entityType === "channel_memory") {
      return "ChannelMemoryNote";
    }

    if (entityType === "event_memory") {
      return "EventMemory";
    }

    return "UserMemoryNote";
  }

  function parseVectorLiteralDimensions(vectorLiteral: string) {
    const trimmed = vectorLiteral.trim();
    const payload = trimmed.replace(/^\[/, "").replace(/\]$/, "").trim();

    if (!payload) {
      return 0;
    }

    return payload.split(",").length;
  }
    const perScopeLimit = Math.max(2, Math.ceil(limit / 2));
    const serverOr = terms.flatMap((term) => [
      { key: { contains: term, mode: "insensitive" as const } },
      { value: { contains: term, mode: "insensitive" as const } }
    ]);
    const [server, user, channel, events, messages] = await Promise.all([
      this.prisma.serverMemory.findMany({
        where: {
          guildId: input.guildId,
          OR: serverOr,
          AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }]
        },
        orderBy: { updatedAt: "desc" },
        take: perScopeLimit,
        select: { id: true, key: true, value: true, type: true, createdAt: true, updatedAt: true }
      }),
      this.prisma.userMemoryNote.findMany({
        where: {
          guildId: input.guildId,
          userId: input.userId,
          active: true,
          OR: serverOr,
          AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }]
        },
        orderBy: { createdAt: "desc" },
        take: perScopeLimit,
        select: { id: true, key: true, value: true, createdAt: true, userId: true }
      }),
      this.prisma.channelMemoryNote.findMany({
        where: {
          guildId: input.guildId,
          channelId: input.channelId,
          active: true,
          OR: serverOr,
          AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }]
        },
        orderBy: [{ salience: "desc" }, { updatedAt: "desc" }],
        take: perScopeLimit,
        select: { id: true, key: true, value: true, type: true, createdAt: true, updatedAt: true, salience: true }
      }),
      this.prisma.eventMemory.findMany({
        where: {
          guildId: input.guildId,
          active: true,
          AND: [
            { OR: serverOr },
            { OR: [{ channelId: input.channelId }, { channelId: null }, { tags: { hasSome: ["server", "global"] } }] },
            { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }
          ],
        },
        orderBy: [{ salience: "desc" }, { updatedAt: "desc" }],
        take: perScopeLimit,
        select: { id: true, key: true, value: true, type: true, createdAt: true, updatedAt: true, salience: true }
      }),
      this.prisma.message.findMany({
        where: {
          guildId: input.guildId,
          channelId: input.channelId,
          OR: terms.map((term) => ({ content: { contains: term, mode: "insensitive" as const } }))
        },
        orderBy: { createdAt: "desc" },
        take: perScopeLimit,
        select: { id: true, content: true, createdAt: true, userId: true }
      })
    ]);

    return rankRows(
      [
        ...server.map((row) => ({
          scope: "server" as const,
          id: row.id,
          key: row.key,
          value: row.value,
          type: row.type,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          userId: null,
          sortScore: computeLexicalScore([row.key, row.value], terms)
        })),
        ...user.map((row) => ({
          scope: "user" as const,
          id: row.id,
          key: row.key,
          value: row.value,
          type: "user_note",
          createdAt: row.createdAt,
          userId: row.userId,
          sortScore: computeLexicalScore([row.key, row.value], terms)
        })),
        ...channel.map((row) => ({
          scope: "channel" as const,
          id: row.id,
          key: row.key,
          value: row.value,
          type: row.type,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          userId: null,
          salience: row.salience ?? 0.5,
          sortScore: computeLexicalScore([row.key, row.value], terms)
        })),
        ...events.map((row) => ({
          scope: "event" as const,
          id: row.id,
          key: row.key,
          value: row.value,
          type: row.type,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          userId: null,
          salience: row.salience ?? 0.5,
          sortScore: computeLexicalScore([row.key, row.value], terms)
        })),
        ...messages.map((row) => ({
          scope: "message" as const,
          id: row.id,
          key: row.id,
          value: row.content,
          type: "message",
          createdAt: row.createdAt,
          userId: row.userId,
          sortScore: computeLexicalScore([row.content], terms)
        }))
      ],
      "lexical",
      compareLexicalRows
    );
  }

  private async getRecentHybridRows(input: HybridRecallInput, limit: number): Promise<HybridRow[]> {
    const [server, user, channel, events] = await Promise.all([
      this.findRelevantServerMemory(input.guildId, undefined, limit),
      this.findRelevantUserMemory(input.guildId, input.userId, undefined, limit),
      this.findRelevantChannelMemory(input.guildId, input.channelId, undefined, limit),
      this.findRelevantEventMemory(input.guildId, input.channelId, undefined, limit)
    ]);

    return rankRows(
      [
        ...server.map((row) => ({ scope: "server" as const, id: row.id, key: row.key, value: row.value, type: row.type, createdAt: row.createdAt, updatedAt: row.updatedAt, userId: null })),
        ...user.map((row) => ({ scope: "user" as const, id: row.id, key: row.key, value: row.value, type: "user_note", createdAt: row.createdAt, userId: input.userId })),
        ...channel.map((row) => ({ scope: "channel" as const, id: row.id, key: row.key, value: row.value, type: row.type, createdAt: row.createdAt, updatedAt: row.updatedAt, userId: null, salience: row.salience ?? 0.5 })),
        ...events.map((row) => ({ scope: "event" as const, id: row.id, key: row.key, value: row.value, type: row.type, createdAt: row.createdAt, updatedAt: row.updatedAt, userId: null, salience: row.salience ?? 0.5 }))
      ],
      "recent",
      compareRecentRows
    );
  }

  private async withVectorFallback<T>(
    operation: string,
    fallback: () => Promise<T>,
    run: () => Promise<T>
  ): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (!isVectorDimensionError(error)) {
        throw error;
      }

      this.logger?.warn(
        { error: asErrorMessage(error), operation },
        "vector retrieval skipped because embedding dimensions differ"
      );
      return fallback();
    }
  }
}

function isVectorDimensionError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const record = error as {
    code?: unknown;
    message?: unknown;
    meta?: { message?: unknown };
  };
  const message = [record.message, record.meta?.message]
    .filter((value): value is string => typeof value === "string")
    .join("\n");

  return (record.code === "P2010" && /different vector dimensions/i.test(message))
    || /different vector dimensions/i.test(message);
}

function extractLexicalTerms(query: string) {
  return [
    ...new Set(
      query
        .toLowerCase()
        .replace(/ё/g, "е")
        .split(/[^\p{L}\p{N}]+/u)
        .map((term) => term.trim())
        .filter((term) => term.length >= 3)
    )
  ].slice(0, 6);
}

function rankRows(
  rows: Array<Omit<HybridRow, "rank" | "reason">>,
  reason: HybridRow["reason"],
  compare?: (left: Omit<HybridRow, "rank" | "reason">, right: Omit<HybridRow, "rank" | "reason">) => number
): HybridRow[] {
  const ordered = compare ? [...rows].sort(compare) : rows;
  return ordered.map((row, index) => ({ ...row, rank: index + 1, reason }));
}

function mergeHybridRows(rows: HybridRow[], limit: number): ActiveMemoryEntry[] {
  const scored = new Map<string, ScoredHybridHit>();

  for (const row of rows) {
    const key = `${row.scope}:${row.id}`;
    const current = scored.get(key);
    // RRF base score * salience multiplier: salience=0.5 → ×1.0 (neutral), salience=0.9 → ×1.4, salience=0.1 → ×0.6
    const rrfScore = 1 / (60 + row.rank);
    const temporalMultiplier = computeTemporalDecayMultiplier(row.updatedAt ?? row.createdAt);
    const score = rrfScore * (0.5 + (row.salience ?? 0.5)) * temporalMultiplier;

    if (!current) {
      scored.set(key, { row, score, reasons: new Set([row.reason]) });
      continue;
    }

    current.score += score;
    current.reasons.add(row.reason);
  }

  return [...scored.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ row, score, reasons }) => ({
      scope: row.scope,
      key: row.key,
      value: row.value,
      type: row.type,
      score: Number(score.toFixed(4)),
      reason: [...reasons].join("+"),
      sourceId: row.id,
      sourceUserId: row.userId ?? null,
      createdAt: row.createdAt
    }));
}

function computeLexicalScore(parts: Array<string | undefined>, terms: string[]) {
  const normalizedParts = parts
    .filter((part): part is string => Boolean(part))
    .map((part) => part.toLowerCase().replace(/ё/g, "е"));

  let score = 0;
  for (const term of terms) {
    for (const part of normalizedParts) {
      let fromIndex = 0;
      while (true) {
        const matchIndex = part.indexOf(term, fromIndex);
        if (matchIndex === -1) {
          break;
        }
        score += 1;
        fromIndex = matchIndex + term.length;
      }
    }
  }

  return score;
}

function compareVectorRows(left: Omit<HybridRow, "rank" | "reason">, right: Omit<HybridRow, "rank" | "reason">) {
  return compareNumberAsc(left.sortScore, right.sortScore)
    || compareNumberDesc(left.salience ?? 0.5, right.salience ?? 0.5)
    || compareDateDesc(left.updatedAt ?? left.createdAt, right.updatedAt ?? right.createdAt);
}

function compareLexicalRows(left: Omit<HybridRow, "rank" | "reason">, right: Omit<HybridRow, "rank" | "reason">) {
  return compareNumberDesc(left.sortScore, right.sortScore)
    || compareNumberDesc(left.salience ?? 0.5, right.salience ?? 0.5)
    || compareDateDesc(left.updatedAt ?? left.createdAt, right.updatedAt ?? right.createdAt);
}

function compareRecentRows(left: Omit<HybridRow, "rank" | "reason">, right: Omit<HybridRow, "rank" | "reason">) {
  return compareDateDesc(left.updatedAt ?? left.createdAt, right.updatedAt ?? right.createdAt)
    || compareNumberDesc(left.salience ?? 0.5, right.salience ?? 0.5);
}

function computeTemporalDecayMultiplier(referenceDate?: Date) {
  const timestamp = referenceDate?.getTime();
  if (!timestamp) {
    return 1;
  }

  const ageMs = Math.max(0, Date.now() - timestamp);
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  return temporalDecayFloor + (1 - temporalDecayFloor) * Math.exp(-ageDays / temporalDecayHalfLifeDays);
}

function compareNumberAsc(left?: number, right?: number) {
  const safeLeft = Number.isFinite(left) ? (left as number) : Number.POSITIVE_INFINITY;
  const safeRight = Number.isFinite(right) ? (right as number) : Number.POSITIVE_INFINITY;
  return safeLeft - safeRight;
}

function compareNumberDesc(left?: number, right?: number) {
  const safeLeft = Number.isFinite(left) ? (left as number) : Number.NEGATIVE_INFINITY;
  const safeRight = Number.isFinite(right) ? (right as number) : Number.NEGATIVE_INFINITY;
  return safeRight - safeLeft;
}

function compareDateDesc(left?: Date, right?: Date) {
  const safeLeft = left?.getTime() ?? 0;
  const safeRight = right?.getTime() ?? 0;
  return safeRight - safeLeft;
}
