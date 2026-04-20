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

interface HybridRow {
  scope: ActiveMemoryEntry["scope"];
  id: string;
  key: string;
  value: string;
  type: string;
  createdAt?: Date;
  userId?: string | null;
  rank: number;
  reason: "vector" | "lexical" | "recent";
  /** Salience weight from DB (0..1, default 0.5 = neutral). Used in RRF score boost. */
  salience?: number;
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
            AND vector_dims(embedding) = $3
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
            AND vector_dims(embedding) = $4
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
            AND vector_dims(embedding) = $4
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
            AND vector_dims(embedding) = $4
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
    return this.prisma.channelMemoryNote.upsert({
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
    return this.prisma.eventMemory.upsert({
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
  }

  async forgetServerFact(guildId: string, key: string): Promise<{ count: number }> {
    return this.prisma.serverMemory.deleteMany({
      where: { guildId, key }
    });
  }

  async setEmbedding(
    entityType: "server_memory" | "user_memory" | "channel_memory" | "event_memory",
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

    if (entityType === "channel_memory") {
      return this.prisma.$executeRawUnsafe(
        `UPDATE "ChannelMemoryNote" SET embedding = $1::vector WHERE id = $2`,
        vectorLiteral,
        entityId
      );
    }

    if (entityType === "event_memory") {
      return this.prisma.$executeRawUnsafe(
        `UPDATE "EventMemory" SET embedding = $1::vector WHERE id = $2`,
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
          SELECT 'server' AS scope, id, key, value, type, "createdAt", NULL::TEXT AS "userId"
          FROM "ServerMemory"
          WHERE "guildId" = $1
            AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
            AND embedding IS NOT NULL
            AND vector_dims(embedding) = $3
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
          SELECT 'user' AS scope, id, key, value, 'user_note' AS type, "createdAt", "userId"
          FROM "UserMemoryNote"
          WHERE "guildId" = $1
            AND "userId" = $2
            AND active = TRUE
            AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
            AND embedding IS NOT NULL
            AND vector_dims(embedding) = $4
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
          SELECT 'channel' AS scope, id, key, value, type, "createdAt", NULL::TEXT AS "userId", COALESCE(salience, 0.5) AS salience
          FROM "ChannelMemoryNote"
          WHERE "guildId" = $1
            AND "channelId" = $2
            AND active = TRUE
            AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
            AND embedding IS NOT NULL
            AND vector_dims(embedding) = $4
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
          SELECT 'event' AS scope, id, key, value, type, "createdAt", NULL::TEXT AS "userId", COALESCE(salience, 0.5) AS salience
          FROM "EventMemory"
          WHERE "guildId" = $1
            AND active = TRUE
            AND ("channelId" = $2 OR "channelId" IS NULL OR tags && ARRAY['server','global']::TEXT[])
            AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
            AND embedding IS NOT NULL
            AND vector_dims(embedding) = $4
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
          SELECT 'message' AS scope, m.id, m.id AS key, m.content AS value, 'message' AS type, m."createdAt", m."userId"
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

    return rankRows([...server, ...user, ...channel, ...events, ...messages], "vector");
  }

  private async getLexicalHybridRows(input: HybridRecallInput, limit: number): Promise<HybridRow[]> {
    const terms = extractLexicalTerms(input.query);
    if (!terms.length) {
      return [];
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
        select: { id: true, key: true, value: true, type: true, createdAt: true }
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
        select: { id: true, key: true, value: true, type: true, createdAt: true, salience: true }
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
        select: { id: true, key: true, value: true, type: true, createdAt: true, salience: true }
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
        ...server.map((row) => ({ scope: "server" as const, id: row.id, key: row.key, value: row.value, type: row.type, createdAt: row.createdAt, userId: null })),
        ...user.map((row) => ({ scope: "user" as const, id: row.id, key: row.key, value: row.value, type: "user_note", createdAt: row.createdAt, userId: row.userId })),
        ...channel.map((row) => ({ scope: "channel" as const, id: row.id, key: row.key, value: row.value, type: row.type, createdAt: row.createdAt, userId: null, salience: row.salience ?? 0.5 })),
        ...events.map((row) => ({ scope: "event" as const, id: row.id, key: row.key, value: row.value, type: row.type, createdAt: row.createdAt, userId: null, salience: row.salience ?? 0.5 })),
        ...messages.map((row) => ({ scope: "message" as const, id: row.id, key: row.id, value: row.content, type: "message", createdAt: row.createdAt, userId: row.userId }))
      ],
      "lexical"
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
        ...server.map((row) => ({ scope: "server" as const, id: row.id, key: row.key, value: row.value, type: row.type, createdAt: row.createdAt, userId: null })),
        ...user.map((row) => ({ scope: "user" as const, id: row.id, key: row.key, value: row.value, type: "user_note", createdAt: row.createdAt, userId: input.userId })),
        ...channel.map((row) => ({ scope: "channel" as const, id: row.id, key: row.key, value: row.value, type: row.type, createdAt: row.createdAt, userId: null, salience: row.salience })),
        ...events.map((row) => ({ scope: "event" as const, id: row.id, key: row.key, value: row.value, type: row.type, createdAt: row.createdAt, userId: null, salience: row.salience }))
      ],
      "recent"
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

function rankRows(rows: Array<Omit<HybridRow, "rank" | "reason">>, reason: HybridRow["reason"]): HybridRow[] {
  return rows.map((row, index) => ({ ...row, rank: index + 1, reason }));
}

function mergeHybridRows(rows: HybridRow[], limit: number): ActiveMemoryEntry[] {
  const scored = new Map<string, ScoredHybridHit>();

  for (const row of rows) {
    const key = `${row.scope}:${row.id}`;
    const current = scored.get(key);
    // RRF base score * salience multiplier: salience=0.5 → ×1.0 (neutral), salience=0.9 → ×1.4, salience=0.1 → ×0.6
    const rrfScore = 1 / (60 + row.rank);
    const score = rrfScore * (0.5 + (row.salience ?? 0.5));

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
