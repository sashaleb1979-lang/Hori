import type { AppLogger, AppPrismaClient, LlmChatMessage } from "@hori/shared";
import { toVectorLiteral } from "@hori/shared";

export interface KnowledgeServiceDeps {
  prisma: AppPrismaClient;
  logger?: AppLogger;
  embed: (text: string) => Promise<{ vector: number[]; model: string; dimensions: number }>;
  chat: (options: {
    model: string;
    messages: LlmChatMessage[];
    maxTokens?: number;
  }) => Promise<{ content: string; model: string }>;
  defaultAnswerModel: string;
}

export interface KnowledgeClusterDescriptor {
  id: string;
  guildId: string;
  code: string;
  title: string;
  description: string | null;
  trigger: string;
  enabled: boolean;
  answerModel: string | null;
  embedModel: string | null;
  dimensions: number | null;
}

export interface KnowledgeIngestArticle {
  title: string;
  content: string;
  sourceUrl?: string | null;
}

export interface KnowledgeIngestResult {
  articlesUpserted: number;
  chunksCreated: number;
  chunksSkipped: number;
}

export interface KnowledgeAnswer {
  cluster: KnowledgeClusterDescriptor;
  question: string;
  answer: string;
  sources: Array<{ articleId: string; title: string; chunkIndex: number; snippet: string; sortScore: number }>;
  fallback: boolean;
  model: string;
  retrievedChunkCount: number;
}

interface KnowledgeChunkRow {
  id: string;
  articleId: string;
  chunkIndex: number;
  content: string;
  title: string;
  sortScore: number;
}

const CHUNK_TARGET_CHARS = 1200;
const CHUNK_OVERLAP_CHARS = 150;
const VECTOR_TOP_K = 8;
const LEXICAL_TOP_K = 8;
const FINAL_TOP_K = 4;
const MIN_LEXICAL_SCORE = 0.05;
const ANSWER_MAX_TOKENS = 500;

export class KnowledgeService {
  constructor(private readonly deps: KnowledgeServiceDeps) {}

  // ---------------- Cluster CRUD ----------------

  async listClusters(guildId: string): Promise<KnowledgeClusterDescriptor[]> {
    const rows = await this.deps.prisma.knowledgeCluster.findMany({
      where: { guildId },
      orderBy: { createdAt: "asc" }
    });
    return rows.map(toDescriptor);
  }

  async getCluster(guildId: string, code: string): Promise<KnowledgeClusterDescriptor | null> {
    const row = await this.deps.prisma.knowledgeCluster.findUnique({
      where: { guildId_code: { guildId, code: normalizeCode(code) } }
    });
    return row ? toDescriptor(row) : null;
  }

  async createCluster(input: {
    guildId: string;
    code: string;
    title: string;
    trigger?: string;
    description?: string | null;
    answerModel?: string | null;
  }): Promise<KnowledgeClusterDescriptor> {
    const trigger = normalizeTrigger(input.trigger ?? "?");
    const code = normalizeCode(input.code);
    const row = await this.deps.prisma.knowledgeCluster.create({
      data: {
        guildId: input.guildId,
        code,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        trigger,
        answerModel: input.answerModel?.trim() || null,
        enabled: true
      }
    });
    return toDescriptor(row);
  }

  async updateCluster(
    guildId: string,
    code: string,
    patch: Partial<Pick<KnowledgeClusterDescriptor, "title" | "description" | "trigger" | "enabled" | "answerModel">>
  ): Promise<KnowledgeClusterDescriptor> {
    const data: Record<string, unknown> = {};
    if (patch.title !== undefined) data.title = patch.title.trim();
    if (patch.description !== undefined) data.description = patch.description?.trim() || null;
    if (patch.trigger !== undefined) data.trigger = normalizeTrigger(patch.trigger);
    if (patch.enabled !== undefined) data.enabled = patch.enabled;
    if (patch.answerModel !== undefined) data.answerModel = patch.answerModel?.trim() || null;
    const row = await this.deps.prisma.knowledgeCluster.update({
      where: { guildId_code: { guildId, code: normalizeCode(code) } },
      data
    });
    return toDescriptor(row);
  }

  async deleteCluster(guildId: string, code: string): Promise<void> {
    await this.deps.prisma.knowledgeCluster.delete({
      where: { guildId_code: { guildId, code: normalizeCode(code) } }
    });
  }

  async clearArticles(guildId: string, code: string): Promise<{ deletedArticles: number }> {
    const cluster = await this.requireCluster(guildId, code);
    const result = await this.deps.prisma.knowledgeArticle.deleteMany({
      where: { clusterId: cluster.id }
    });
    return { deletedArticles: result.count };
  }

  async getStats(guildId: string, code: string): Promise<{ articles: number; chunks: number }> {
    const cluster = await this.requireCluster(guildId, code);
    const [articles, chunks] = await Promise.all([
      this.deps.prisma.knowledgeArticle.count({ where: { clusterId: cluster.id } }),
      this.deps.prisma.knowledgeChunk.count({ where: { clusterId: cluster.id } })
    ]);
    return { articles, chunks };
  }

  // ---------------- Trigger detection ----------------

  /**
   * Returns the cluster matching the leading trigger character of the message, if any.
   * Trigger is the first non-whitespace character. The remainder (after trigger and any leading
   * whitespace) is returned as the question.
   */
  async matchTrigger(
    guildId: string,
    rawContent: string
  ): Promise<{ cluster: KnowledgeClusterDescriptor; question: string } | null> {
    const trimmed = rawContent.trimStart();
    if (!trimmed) return null;
    const triggerChar = Array.from(trimmed)[0];
    if (!triggerChar) return null;
    if (/[\p{L}\p{N}_]/u.test(triggerChar)) return null;
    const row = await this.deps.prisma.knowledgeCluster.findFirst({
      where: { guildId, enabled: true, trigger: triggerChar }
    });
    if (!row) return null;
    const question = trimmed.slice(triggerChar.length).trim();
    return { cluster: toDescriptor(row), question };
  }

  // ---------------- Ingest ----------------

  async ingestArticles(
    guildId: string,
    code: string,
    articles: KnowledgeIngestArticle[]
  ): Promise<KnowledgeIngestResult> {
    const cluster = await this.requireCluster(guildId, code);
    let articlesUpserted = 0;
    let chunksCreated = 0;
    let chunksSkipped = 0;

    for (const incoming of articles) {
      const title = incoming.title.trim();
      const content = incoming.content.trim();
      if (!title || !content) {
        chunksSkipped += 1;
        continue;
      }

      const article = await this.deps.prisma.knowledgeArticle.upsert({
        where: { clusterId_title: { clusterId: cluster.id, title } },
        create: {
          clusterId: cluster.id,
          title,
          sourceUrl: incoming.sourceUrl?.trim() || null,
          rawContent: content
        },
        update: {
          sourceUrl: incoming.sourceUrl?.trim() || null,
          rawContent: content
        }
      });

      // Replace chunks for this article.
      await this.deps.prisma.knowledgeChunk.deleteMany({ where: { articleId: article.id } });

      const chunks = chunkText(content);
      let chunkIndex = 0;
      let firstDimensions: number | null = null;
      for (const chunkContent of chunks) {
        try {
          const { vector, dimensions } = await this.deps.embed(`${title}\n\n${chunkContent}`);
          firstDimensions ??= dimensions;
          const created = await this.deps.prisma.knowledgeChunk.create({
            data: {
              clusterId: cluster.id,
              articleId: article.id,
              chunkIndex,
              content: chunkContent,
              tokens: estimateTokens(chunkContent),
              dimensions
            }
          });
          await this.deps.prisma.$executeRawUnsafe(
            `UPDATE "KnowledgeChunk" SET embedding = $1::vector WHERE id = $2`,
            toVectorLiteral(vector),
            created.id
          );
          chunksCreated += 1;
          chunkIndex += 1;
        } catch (error) {
          chunksSkipped += 1;
          this.deps.logger?.warn?.(
            { clusterId: cluster.id, articleId: article.id, chunkIndex, error: (error as Error).message },
            "knowledge chunk embed failed"
          );
        }
      }

      if (firstDimensions && cluster.dimensions !== firstDimensions) {
        await this.deps.prisma.knowledgeCluster.update({
          where: { id: cluster.id },
          data: { dimensions: firstDimensions }
        });
      }

      articlesUpserted += 1;
    }

    return { articlesUpserted, chunksCreated, chunksSkipped };
  }

  // ---------------- Query ----------------

  async query(
    cluster: KnowledgeClusterDescriptor,
    question: string,
    options: { limit?: number } = {}
  ): Promise<KnowledgeChunkRow[]> {
    const trimmed = question.trim();
    if (!trimmed) return [];
    const limit = options.limit ?? FINAL_TOP_K;

    let vectorRows: KnowledgeChunkRow[] = [];
    try {
      const { vector, dimensions } = await this.deps.embed(trimmed);
      const literal = toVectorLiteral(vector);
      vectorRows = await this.deps.prisma.$queryRawUnsafe<KnowledgeChunkRow[]>(
        `
          SELECT c.id, c."articleId", c."chunkIndex", c.content, a.title,
                 (c.embedding <=> $1::vector) AS "sortScore"
          FROM "KnowledgeChunk" c
          JOIN "KnowledgeArticle" a ON a.id = c."articleId"
          WHERE c."clusterId" = $2
            AND c.embedding IS NOT NULL
            AND (c.dimensions = $3 OR (c.dimensions IS NULL AND vector_dims(c.embedding) = $3))
          ORDER BY c.embedding <=> $1::vector
          LIMIT $4
        `,
        literal,
        cluster.id,
        dimensions,
        VECTOR_TOP_K
      );
    } catch (error) {
      this.deps.logger?.warn?.(
        { clusterId: cluster.id, error: (error as Error).message },
        "knowledge vector retrieval failed, falling back to lexical only"
      );
    }

    const lexicalRows = await this.lexicalSearch(cluster.id, trimmed, LEXICAL_TOP_K);
    const merged = mergeAndRerank(vectorRows, lexicalRows, trimmed, limit);
    return merged;
  }

  async answer(
    cluster: KnowledgeClusterDescriptor,
    question: string
  ): Promise<KnowledgeAnswer> {
    const chunks = await this.query(cluster, question);
    const model = cluster.answerModel?.trim() || this.deps.defaultAnswerModel;

    if (chunks.length === 0) {
      return {
        cluster,
        question,
        answer: "нет такой инфы",
        sources: [],
        fallback: true,
        model,
        retrievedChunkCount: 0
      };
    }

    const systemPrompt = buildKnowledgeSystemPrompt(cluster, chunks);
    const messages: LlmChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: question }
    ];

    let answerText = "нет такой инфы";
    let actualModel = model;
    try {
      const result = await this.deps.chat({ model, messages, maxTokens: ANSWER_MAX_TOKENS });
      actualModel = result.model || model;
      const cleaned = result.content.trim();
      if (cleaned) answerText = cleaned;
    } catch (error) {
      this.deps.logger?.warn?.(
        { clusterId: cluster.id, model, error: (error as Error).message },
        "knowledge answer generation failed"
      );
    }

    return {
      cluster,
      question,
      answer: answerText,
      sources: chunks.map((c) => ({
        articleId: c.articleId,
        title: c.title,
        chunkIndex: c.chunkIndex,
        snippet: c.content.slice(0, 160),
        sortScore: c.sortScore
      })),
      fallback: /^нет такой инфы$/i.test(answerText.trim()),
      model: actualModel,
      retrievedChunkCount: chunks.length
    };
  }

  // ---------------- Internals ----------------

  private async requireCluster(guildId: string, code: string): Promise<KnowledgeClusterDescriptor> {
    const cluster = await this.getCluster(guildId, code);
    if (!cluster) {
      throw new Error(`Knowledge cluster "${code}" not found for guild ${guildId}`);
    }
    return cluster;
  }

  private async lexicalSearch(clusterId: string, question: string, limit: number): Promise<KnowledgeChunkRow[]> {
    const terms = extractKeywords(question);
    if (terms.length === 0) return [];
    const tsQuery = terms.map((t) => `${escapeTsQuery(t)}:*`).join(" | ");
    try {
      return await this.deps.prisma.$queryRawUnsafe<KnowledgeChunkRow[]>(
        `
          SELECT c.id, c."articleId", c."chunkIndex", c.content, a.title,
                 ts_rank_cd(
                   to_tsvector('simple', a.title || ' ' || c.content),
                   to_tsquery('simple', $1)
                 ) AS "sortScore"
          FROM "KnowledgeChunk" c
          JOIN "KnowledgeArticle" a ON a.id = c."articleId"
          WHERE c."clusterId" = $2
            AND to_tsvector('simple', a.title || ' ' || c.content) @@ to_tsquery('simple', $1)
          ORDER BY "sortScore" DESC
          LIMIT $3
        `,
        tsQuery,
        clusterId,
        limit
      );
    } catch (error) {
      this.deps.logger?.debug?.(
        { clusterId, error: (error as Error).message },
        "knowledge lexical search failed"
      );
      return [];
    }
  }
}

// ---------------- Helpers ----------------

function toDescriptor(row: {
  id: string;
  guildId: string;
  code: string;
  title: string;
  description: string | null;
  trigger: string;
  enabled: boolean;
  answerModel: string | null;
  embedModel: string | null;
  dimensions: number | null;
}): KnowledgeClusterDescriptor {
  return {
    id: row.id,
    guildId: row.guildId,
    code: row.code,
    title: row.title,
    description: row.description,
    trigger: row.trigger,
    enabled: row.enabled,
    answerModel: row.answerModel,
    embedModel: row.embedModel,
    dimensions: row.dimensions
  };
}

function normalizeCode(code: string): string {
  const normalized = code.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(normalized)) {
    throw new Error(`Invalid knowledge cluster code: "${code}". Use 1-32 chars: a-z 0-9 _ -`);
  }
  return normalized;
}

function normalizeTrigger(trigger: string): string {
  const trimmed = trigger.trim();
  const first = Array.from(trimmed)[0];
  if (!first) {
    throw new Error("Trigger must be a single non-whitespace character");
  }
  if (/[\p{L}\p{N}_\s]/u.test(first)) {
    throw new Error(`Trigger "${first}" must be a single non-letter/non-digit symbol (e.g. "?", "!", "$").`);
  }
  return first;
}

export function chunkText(input: string, target = CHUNK_TARGET_CHARS, overlap = CHUNK_OVERLAP_CHARS): string[] {
  const text = input.replace(/\r\n/g, "\n").trim();
  if (!text) return [];
  if (text.length <= target) return [text];

  const chunks: string[] = [];
  // Prefer splitting on paragraph boundaries.
  const paragraphs = text.split(/\n{2,}/g);
  let buffer = "";
  for (const para of paragraphs) {
    const next = buffer ? `${buffer}\n\n${para}` : para;
    if (next.length <= target) {
      buffer = next;
      continue;
    }
    if (buffer) {
      chunks.push(buffer);
      const tail = buffer.slice(Math.max(0, buffer.length - overlap));
      buffer = tail ? `${tail}\n\n${para}` : para;
    } else {
      // Single paragraph too big, split by sentences/length.
      for (const piece of splitLongBlock(para, target, overlap)) chunks.push(piece);
      buffer = "";
    }
  }
  if (buffer) chunks.push(buffer);
  return chunks;
}

function splitLongBlock(block: string, target: number, overlap: number): string[] {
  const out: string[] = [];
  let start = 0;
  while (start < block.length) {
    const end = Math.min(block.length, start + target);
    out.push(block.slice(start, end));
    if (end >= block.length) break;
    start = end - overlap;
  }
  return out;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function extractKeywords(question: string): string[] {
  return Array.from(
    new Set(
      question
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s_-]+/gu, " ")
        .split(/\s+/u)
        .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
    )
  ).slice(0, 8);
}

function escapeTsQuery(term: string): string {
  return term.replace(/['\\]/g, " ").replace(/\s+/g, "");
}

const STOPWORDS = new Set([
  "что", "как", "это", "для", "его", "она", "они", "там", "был", "уже", "ещё", "еще", "или", "если",
  "the", "and", "for", "you", "are", "but", "not", "what", "how", "why", "with", "this", "that"
]);

function mergeAndRerank(
  vectorRows: KnowledgeChunkRow[],
  lexicalRows: KnowledgeChunkRow[],
  question: string,
  limit: number
): KnowledgeChunkRow[] {
  const byId = new Map<string, { row: KnowledgeChunkRow; vectorRank: number; lexicalRank: number; lexicalScore: number }>();

  vectorRows.forEach((row, index) => {
    byId.set(row.id, { row, vectorRank: index + 1, lexicalRank: 0, lexicalScore: 0 });
  });
  lexicalRows.forEach((row, index) => {
    const existing = byId.get(row.id);
    if (existing) {
      existing.lexicalRank = index + 1;
      existing.lexicalScore = row.sortScore ?? 0;
    } else {
      byId.set(row.id, { row, vectorRank: 0, lexicalRank: index + 1, lexicalScore: row.sortScore ?? 0 });
    }
  });

  const k = 60;
  const questionTerms = new Set(extractKeywords(question));

  const scored = Array.from(byId.values()).map(({ row, vectorRank, lexicalRank, lexicalScore }) => {
    let rrf = 0;
    if (vectorRank > 0) rrf += 1 / (k + vectorRank);
    if (lexicalRank > 0) rrf += 0.7 / (k + lexicalRank);
    // Term-overlap boost — encourages chunks that mirror user terminology.
    const overlapBoost = computeTermOverlap(row.content + " " + row.title, questionTerms);
    const score = rrf + 0.05 * overlapBoost + (lexicalScore > MIN_LEXICAL_SCORE ? 0.001 * lexicalScore : 0);
    return { row, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(({ row, score }) => ({ ...row, sortScore: score }));
}

function computeTermOverlap(text: string, terms: Set<string>): number {
  if (terms.size === 0) return 0;
  const lower = text.toLowerCase();
  let hits = 0;
  for (const term of terms) {
    if (lower.includes(term)) hits += 1;
  }
  return hits / terms.size;
}

function buildKnowledgeSystemPrompt(cluster: KnowledgeClusterDescriptor, chunks: KnowledgeChunkRow[]): string {
  const fragments = chunks
    .map((chunk, index) => `[#${index + 1}] ${chunk.title}\n${chunk.content.trim()}`)
    .join("\n\n---\n\n");

  return [
    `Ты отвечаешь на вопрос по теме «${cluster.title}».`,
    "Используй ТОЛЬКО приведённые ниже фрагменты вики. Не придумывай.",
    'Если в фрагментах нет ответа — ответь ровно: "нет такой инфы".',
    "Отвечай коротко, без воды и без вступлений.",
    "В ответе максимально копируй термины и обороты из вопроса пользователя и из фрагментов вики. Не перефразируй жаргон, не подменяй названия.",
    "",
    "[ФРАГМЕНТЫ ВИКИ]",
    fragments
  ].join("\n");
}
