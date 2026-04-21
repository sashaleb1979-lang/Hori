import { loadEnv } from "../packages/config/src/env";
import { RuntimeConfigService } from "../packages/core/src/services/runtime-config-service";
import { OpenAIClient } from "../packages/llm/src/client/openai-client";
import {
  OPENAI_EMBEDDING_MODEL,
  SUPPORTED_OPENAI_EMBEDDING_DIMENSIONS,
} from "../packages/llm/src/router/model-routing";
import { createLogger } from "../packages/shared/src/logger";
import { createPrismaClient } from "../packages/shared/src/prisma";
import { asErrorMessage, parseCsv, toVectorLiteral } from "../packages/shared/src/utils";

const DEFAULT_SOURCE_DIMENSIONS = 768;
const DEFAULT_TARGET_DIMENSIONS = 512;
const DEFAULT_BATCH_SIZE = 25;

const ENTITY_TYPES = ["message", "server_memory", "user_memory", "channel_memory", "event_memory"] as const;

type ReembedEntityType = (typeof ENTITY_TYPES)[number];

interface ScriptOptions {
  apply: boolean;
  batchSize: number;
  sourceDimensions: number;
  targetDimensions: number;
  limit?: number;
  guildId?: string;
  entityTypes: ReembedEntityType[];
}

interface ReembedRow {
  id: string;
  text: string;
}

type PrismaClient = ReturnType<typeof createPrismaClient>;

interface EntityPlan {
  type: ReembedEntityType;
  count(prisma: PrismaClient, options: ScriptOptions): Promise<number>;
  fetch(prisma: PrismaClient, options: ScriptOptions, take: number): Promise<ReembedRow[]>;
  apply(prisma: PrismaClient, row: ReembedRow, vector: number[], targetDimensions: number): Promise<void>;
}

const ENTITY_PLANS: Record<ReembedEntityType, EntityPlan> = {
  message: {
    type: "message",
    async count(prisma, options) {
      const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint | number }>>(
        `
          SELECT COUNT(*) AS count
          FROM "MessageEmbedding" e
          INNER JOIN "Message" m ON m.id = e."messageId"
          WHERE e.embedding IS NOT NULL
            AND e.dimensions = $1
            AND NULLIF(BTRIM(m.content), '') IS NOT NULL
            AND ($2::TEXT IS NULL OR e."guildId" = $2)
        `,
        options.sourceDimensions,
        options.guildId ?? null,
      );

      return toCount(rows[0]?.count);
    },
    async fetch(prisma, options, take) {
      return prisma.$queryRawUnsafe<ReembedRow[]>(
        `
          SELECT e."messageId" AS id, m.content AS text
          FROM "MessageEmbedding" e
          INNER JOIN "Message" m ON m.id = e."messageId"
          WHERE e.embedding IS NOT NULL
            AND e.dimensions = $1
            AND NULLIF(BTRIM(m.content), '') IS NOT NULL
            AND ($2::TEXT IS NULL OR e."guildId" = $2)
          ORDER BY m."createdAt" ASC, e."messageId" ASC
          LIMIT $3
        `,
        options.sourceDimensions,
        options.guildId ?? null,
        take,
      );
    },
    async apply(prisma, row, vector, targetDimensions) {
      await prisma.$executeRawUnsafe(
        `
          UPDATE "MessageEmbedding"
          SET embedding = $1::vector,
              dimensions = $2
          WHERE "messageId" = $3
        `,
        toVectorLiteral(vector),
        targetDimensions,
        row.id,
      );
      await prisma.message.update({
        where: { id: row.id },
        data: { vectorizedAt: new Date() },
      });
    },
  },
  server_memory: {
    type: "server_memory",
    async count(prisma, options) {
      const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint | number }>>(
        `
          SELECT COUNT(*) AS count
          FROM "ServerMemory"
          WHERE embedding IS NOT NULL
            AND vector_dims(embedding) = $1
            AND NULLIF(BTRIM(value), '') IS NOT NULL
            AND ($2::TEXT IS NULL OR "guildId" = $2)
        `,
        options.sourceDimensions,
        options.guildId ?? null,
      );

      return toCount(rows[0]?.count);
    },
    async fetch(prisma, options, take) {
      return prisma.$queryRawUnsafe<ReembedRow[]>(
        `
          SELECT id, value AS text
          FROM "ServerMemory"
          WHERE embedding IS NOT NULL
            AND vector_dims(embedding) = $1
            AND NULLIF(BTRIM(value), '') IS NOT NULL
            AND ($2::TEXT IS NULL OR "guildId" = $2)
          ORDER BY "createdAt" ASC, id ASC
          LIMIT $3
        `,
        options.sourceDimensions,
        options.guildId ?? null,
        take,
      );
    },
    async apply(prisma, row, vector) {
      await prisma.$executeRawUnsafe(
        `UPDATE "ServerMemory" SET embedding = $1::vector WHERE id = $2`,
        toVectorLiteral(vector),
        row.id,
      );
    },
  },
  user_memory: {
    type: "user_memory",
    async count(prisma, options) {
      const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint | number }>>(
        `
          SELECT COUNT(*) AS count
          FROM "UserMemoryNote"
          WHERE embedding IS NOT NULL
            AND vector_dims(embedding) = $1
            AND NULLIF(BTRIM(value), '') IS NOT NULL
            AND ($2::TEXT IS NULL OR "guildId" = $2)
        `,
        options.sourceDimensions,
        options.guildId ?? null,
      );

      return toCount(rows[0]?.count);
    },
    async fetch(prisma, options, take) {
      return prisma.$queryRawUnsafe<ReembedRow[]>(
        `
          SELECT id, value AS text
          FROM "UserMemoryNote"
          WHERE embedding IS NOT NULL
            AND vector_dims(embedding) = $1
            AND NULLIF(BTRIM(value), '') IS NOT NULL
            AND ($2::TEXT IS NULL OR "guildId" = $2)
          ORDER BY "createdAt" ASC, id ASC
          LIMIT $3
        `,
        options.sourceDimensions,
        options.guildId ?? null,
        take,
      );
    },
    async apply(prisma, row, vector) {
      await prisma.$executeRawUnsafe(
        `UPDATE "UserMemoryNote" SET embedding = $1::vector WHERE id = $2`,
        toVectorLiteral(vector),
        row.id,
      );
    },
  },
  channel_memory: {
    type: "channel_memory",
    async count(prisma, options) {
      const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint | number }>>(
        `
          SELECT COUNT(*) AS count
          FROM "ChannelMemoryNote"
          WHERE embedding IS NOT NULL
            AND vector_dims(embedding) = $1
            AND NULLIF(BTRIM(value), '') IS NOT NULL
            AND ($2::TEXT IS NULL OR "guildId" = $2)
        `,
        options.sourceDimensions,
        options.guildId ?? null,
      );

      return toCount(rows[0]?.count);
    },
    async fetch(prisma, options, take) {
      return prisma.$queryRawUnsafe<ReembedRow[]>(
        `
          SELECT id, value AS text
          FROM "ChannelMemoryNote"
          WHERE embedding IS NOT NULL
            AND vector_dims(embedding) = $1
            AND NULLIF(BTRIM(value), '') IS NOT NULL
            AND ($2::TEXT IS NULL OR "guildId" = $2)
          ORDER BY "createdAt" ASC, id ASC
          LIMIT $3
        `,
        options.sourceDimensions,
        options.guildId ?? null,
        take,
      );
    },
    async apply(prisma, row, vector) {
      await prisma.$executeRawUnsafe(
        `UPDATE "ChannelMemoryNote" SET embedding = $1::vector WHERE id = $2`,
        toVectorLiteral(vector),
        row.id,
      );
    },
  },
  event_memory: {
    type: "event_memory",
    async count(prisma, options) {
      const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint | number }>>(
        `
          SELECT COUNT(*) AS count
          FROM "EventMemory"
          WHERE embedding IS NOT NULL
            AND vector_dims(embedding) = $1
            AND NULLIF(BTRIM(value), '') IS NOT NULL
            AND ($2::TEXT IS NULL OR "guildId" = $2)
        `,
        options.sourceDimensions,
        options.guildId ?? null,
      );

      return toCount(rows[0]?.count);
    },
    async fetch(prisma, options, take) {
      return prisma.$queryRawUnsafe<ReembedRow[]>(
        `
          SELECT id, value AS text
          FROM "EventMemory"
          WHERE embedding IS NOT NULL
            AND vector_dims(embedding) = $1
            AND NULLIF(BTRIM(value), '') IS NOT NULL
            AND ($2::TEXT IS NULL OR "guildId" = $2)
          ORDER BY "createdAt" ASC, id ASC
          LIMIT $3
        `,
        options.sourceDimensions,
        options.guildId ?? null,
        take,
      );
    },
    async apply(prisma, row, vector) {
      await prisma.$executeRawUnsafe(
        `UPDATE "EventMemory" SET embedding = $1::vector WHERE id = $2`,
        toVectorLiteral(vector),
        row.id,
      );
    },
  },
};

async function main() {
  const env = loadEnv();

  if (env.LLM_PROVIDER !== "openai") {
    throw new Error("reembed-openai requires LLM_PROVIDER=openai");
  }

  const prisma = createPrismaClient();
  const logger = createLogger(env.LOG_LEVEL);
  const runtimeConfig = new RuntimeConfigService(prisma, env);
  const runtimeTarget = await runtimeConfig.getOpenAIEmbeddingDimensionsStatus();
  const sourceDimensions = parseDimensionsArg("--source-dimensions") ?? DEFAULT_SOURCE_DIMENSIONS;
  const targetDimensions = parseDimensionsArg("--target-dimensions")
    ?? (runtimeTarget.source !== "unsupported" && runtimeTarget.value && runtimeTarget.value !== sourceDimensions
      ? runtimeTarget.value
      : DEFAULT_TARGET_DIMENSIONS);
  const options: ScriptOptions = {
    apply: hasFlag("--apply"),
    batchSize: parsePositiveIntArg("--batch-size") ?? DEFAULT_BATCH_SIZE,
    sourceDimensions,
    targetDimensions,
    limit: parsePositiveIntArg("--limit"),
    guildId: readArg("--guild-id")?.trim() || undefined,
    entityTypes: parseEntityTypes(readArg("--entity-types")),
  };

  if (options.sourceDimensions === options.targetDimensions) {
    throw new Error(`sourceDimensions and targetDimensions are both ${options.targetDimensions}; nothing to do`);
  }

  const client = new OpenAIClient(env, logger);

  console.log([
    "[reembed] starting OpenAI vector backfill",
    `[reembed] mode=${options.apply ? "apply" : "dry-run"}`,
    `[reembed] model=${OPENAI_EMBEDDING_MODEL}`,
    `[reembed] sourceDimensions=${options.sourceDimensions}`,
    `[reembed] targetDimensions=${options.targetDimensions}`,
    `[reembed] batchSize=${options.batchSize}`,
    `[reembed] limit=${options.limit ?? "all per entity"}`,
    `[reembed] guildId=${options.guildId ?? "all"}`,
    `[reembed] entityTypes=${options.entityTypes.join(",")}`,
  ].join("\n"));

  const summary: Array<{ type: ReembedEntityType; matched: number; processed: number }> = [];

  try {
    for (const type of options.entityTypes) {
      const plan = ENTITY_PLANS[type];
      const matched = await plan.count(prisma, options);
      const targetCount = options.limit === undefined ? matched : Math.min(matched, options.limit);
      console.log(`[reembed] ${type}: matched=${matched}, target=${targetCount}`);

      if (!options.apply || targetCount === 0) {
        summary.push({ type, matched, processed: 0 });
        continue;
      }

      let processed = 0;
      while (processed < targetCount) {
        const take = Math.min(options.batchSize, targetCount - processed);
        const rows = await plan.fetch(prisma, options, take);

        if (!rows.length) {
          break;
        }

        const vectors = await client.embed(
          OPENAI_EMBEDDING_MODEL,
          rows.map((row) => row.text),
          { dimensions: options.targetDimensions },
        );

        if (vectors.length !== rows.length) {
          throw new Error(`${type}: expected ${rows.length} embeddings, got ${vectors.length}`);
        }

        for (const [index, row] of rows.entries()) {
          const vector = vectors[index] ?? [];

          if (vector.length !== options.targetDimensions) {
            throw new Error(`${type}:${row.id} returned ${vector.length} dims instead of ${options.targetDimensions}`);
          }

          await plan.apply(prisma, row, vector, options.targetDimensions);
          processed += 1;
        }

        console.log(`[reembed] ${type}: processed=${processed}/${targetCount}`);
      }

      summary.push({ type, matched, processed });
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log("[reembed] summary");
  for (const item of summary) {
    console.log(`[reembed] ${item.type}: matched=${item.matched}, processed=${item.processed}`);
  }

  if (!options.apply) {
    console.log("[reembed] dry-run complete. Re-run with --apply to rewrite vectors.");
    return;
  }

  console.log("[reembed] apply complete. Switch runtime dimensions in /hori panel -> LLM after the rewrite finishes.");
}

function readArg(flag: string) {
  const index = process.argv.indexOf(flag);

  if (index === -1 || index === process.argv.length - 1) {
    return undefined;
  }

  return process.argv[index + 1];
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function parsePositiveIntArg(flag: string) {
  const raw = readArg(flag);

  if (!raw) {
    return undefined;
  }

  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function parseDimensionsArg(flag: string) {
  const raw = readArg(flag);

  if (!raw) {
    return undefined;
  }

  const parsed = Number(raw);
  return SUPPORTED_OPENAI_EMBEDDING_DIMENSIONS.includes(parsed as (typeof SUPPORTED_OPENAI_EMBEDDING_DIMENSIONS)[number])
    ? parsed
    : undefined;
}

function parseEntityTypes(raw?: string) {
  if (!raw) {
    return [...ENTITY_TYPES];
  }

  const values = parseCsv(raw)
    .map((value) => value.toLowerCase())
    .filter((value): value is ReembedEntityType => ENTITY_TYPES.includes(value as ReembedEntityType));

  if (!values.length) {
    throw new Error(`No supported entity types in --entity-types=${raw}`);
  }

  return [...new Set(values)];
}

function toCount(value: bigint | number | undefined) {
  if (typeof value === "bigint") {
    return Number(value);
  }

  return Number(value ?? 0);
}

main().catch((error) => {
  console.error(`[reembed] failed: ${asErrorMessage(error)}`);
  process.exit(1);
});