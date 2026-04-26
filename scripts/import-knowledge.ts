/**
 * Bulk-load wiki-style knowledge into a per-guild KnowledgeCluster.
 *
 * Usage:
 *   pnpm knowledge:import -- \
 *     --guild <guildId> \
 *     --cluster jjs \
 *     --title "Jujutsu Shurigan Wiki" \
 *     --trigger ? \
 *     --dir ./jjs-wiki \
 *     [--ext md,txt] \
 *     [--replace] \
 *     [--model gpt-5-nano]
 *
 * Folder layout: each `*.md` (or `*.txt`) file in `--dir` becomes one article.
 * Article title defaults to the filename without extension. Subfolders are walked
 * recursively; the title becomes the relative path with `/` separators.
 *
 * Optional frontmatter is supported:
 * ---
 * title: Domain Expansion
 * sourceUrl: https://example.com/wiki/domain-expansion
 * category: mechanics
 * aliases:
 *   - de
 * keywords:
 *   - domain
 *   - expansion
 * ---
 *
 * If the cluster does not exist, it is created (with --title, --trigger).
 * --replace clears existing articles before re-ingesting.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

import { loadEnv } from "../packages/config/src/env";
import { KnowledgeService, type KnowledgeIngestArticle } from "../packages/core/src/services/knowledge-service";
import { EmbeddingAdapter } from "../packages/llm/src/adapters/embedding-adapter";
import { OpenAIClient } from "../packages/llm/src/client/openai-client";
import { ModelRouter } from "../packages/llm/src/router/model-router";
import { createLogger } from "../packages/shared/src/logger";
import { createPrismaClient } from "../packages/shared/src/prisma";

import { parseKnowledgeImportDocument } from "./import-knowledge-format";

interface CliArgs {
  guild: string;
  cluster: string;
  title?: string;
  trigger?: string;
  description?: string;
  dir: string;
  exts: string[];
  replace: boolean;
  model?: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }

  const required = (key: string): string => {
    const value = args[key];
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`--${key} is required`);
    }
    return value.trim();
  };

  return {
    guild: required("guild"),
    cluster: required("cluster"),
    title: typeof args.title === "string" ? args.title : undefined,
    trigger: typeof args.trigger === "string" ? args.trigger : undefined,
    description: typeof args.description === "string" ? args.description : undefined,
    dir: required("dir"),
    exts: typeof args.ext === "string" ? args.ext.split(",").map((e) => e.trim().toLowerCase()) : ["md", "txt"],
    replace: args.replace === true,
    model: typeof args.model === "string" ? args.model : undefined,
    dryRun: args["dry-run"] === true
  };
}

async function walk(dir: string, exts: string[]): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walk(full, exts)));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).slice(1).toLowerCase();
      if (exts.includes(ext)) out.push(full);
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = loadEnv();
  const logger = createLogger(env.LOG_LEVEL);
  const prisma = createPrismaClient();

  if (env.LLM_PROVIDER !== "openai" && env.LLM_PROVIDER !== "router") {
    logger.warn(
      { provider: env.LLM_PROVIDER },
      "knowledge:import: LLM_PROVIDER is not openai/router, embeddings will use the configured provider"
    );
  }

  const llmClient = new OpenAIClient(env, logger);
  const modelRouter = new ModelRouter(env);
  const embeddingAdapter = new EmbeddingAdapter(llmClient, modelRouter);

  const knowledge = new KnowledgeService({
    prisma,
    logger,
    defaultAnswerModel: args.model ?? env.OPENAI_MODEL,
    embed: async (text) => {
      const meta = modelRouter.pickEmbeddingModel({});
      const vector = await embeddingAdapter.embedOne(text, { dimensions: meta.dimensions });
      return { vector, model: meta.model, dimensions: meta.dimensions ?? vector.length };
    },
    chat: async ({ model, messages, maxTokens }) => {
      const response = await llmClient.chat({ model, messages, maxTokens });
      return { content: response.message?.content ?? "", model: response.routing?.model ?? model };
    }
  });

  let cluster = await knowledge.getCluster(args.guild, args.cluster);
  if (!cluster) {
    if (!args.title) {
      throw new Error(`Cluster "${args.cluster}" not found. Pass --title to create it.`);
    }
    cluster = await knowledge.createCluster({
      guildId: args.guild,
      code: args.cluster,
      title: args.title,
      trigger: args.trigger,
      description: args.description,
      answerModel: args.model
    });
    logger.info({ cluster: cluster.code, trigger: cluster.trigger }, "knowledge cluster created");
  } else {
    const patch: Parameters<typeof knowledge.updateCluster>[2] = {};
    if (args.title) patch.title = args.title;
    if (args.trigger) patch.trigger = args.trigger;
    if (args.description !== undefined) patch.description = args.description;
    if (args.model) patch.answerModel = args.model;
    if (Object.keys(patch).length > 0) {
      cluster = await knowledge.updateCluster(args.guild, args.cluster, patch);
      logger.info({ cluster: cluster.code, patch }, "knowledge cluster updated");
    }
  }

  if (args.replace) {
    const cleared = await knowledge.clearArticles(args.guild, args.cluster);
    logger.info({ cluster: cluster.code, deletedArticles: cleared.deletedArticles }, "knowledge cluster cleared");
  }

  const absDir = path.resolve(args.dir);
  const files = await walk(absDir, args.exts);
  logger.info({ files: files.length, dir: absDir, exts: args.exts }, "knowledge files discovered");
  if (files.length === 0) {
    logger.warn("no files matched, nothing to do");
    await prisma.$disconnect();
    return;
  }

  const articles: KnowledgeIngestArticle[] = [];
  for (const file of files) {
    const content = await fs.readFile(file, "utf-8");
    const rel = path.relative(absDir, file).replace(/\\/g, "/");
    const fallbackTitle = rel.replace(/\.[^.]+$/, "");
    const parsed = parseKnowledgeImportDocument(content, fallbackTitle);
    articles.push({ title: parsed.title, content: parsed.content, sourceUrl: parsed.sourceUrl });
  }

  if (args.dryRun) {
    logger.info(
      {
        articles: articles.map((article) => ({
          title: article.title,
          sourceUrl: article.sourceUrl ?? null
        }))
      },
      "dry run, nothing ingested"
    );
    await prisma.$disconnect();
    return;
  }

  const batchSize = 5;
  let totals = { articlesUpserted: 0, chunksCreated: 0, chunksSkipped: 0 };
  for (let i = 0; i < articles.length; i += batchSize) {
    const batch = articles.slice(i, i + batchSize);
    const result = await knowledge.ingestArticles(args.guild, args.cluster, batch);
    totals = {
      articlesUpserted: totals.articlesUpserted + result.articlesUpserted,
      chunksCreated: totals.chunksCreated + result.chunksCreated,
      chunksSkipped: totals.chunksSkipped + result.chunksSkipped
    };
    logger.info(
      { batch: i / batchSize + 1, of: Math.ceil(articles.length / batchSize), totals },
      "knowledge batch ingested"
    );
  }

  const stats = await knowledge.getStats(args.guild, args.cluster);
  logger.info({ cluster: cluster.code, totals, stats }, "knowledge import complete");
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("knowledge:import failed", error);
  process.exit(1);
});