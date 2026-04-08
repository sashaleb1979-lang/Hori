"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
module.exports = __toCommonJS(index_exports);
var import_analytics = require("@hori/analytics");
var import_config = require("@hori/config");
var import_llm3 = require("@hori/llm");
var import_memory = require("@hori/memory");
var import_search = require("@hori/search");
var import_shared2 = require("@hori/shared");

// src/jobs/cleanup.ts
function createCleanupJob(runtime) {
  return async (job) => {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1e3);
    if (job.data.kind === "logs") {
      const result2 = await runtime.prisma.botEventLog.deleteMany({
        where: { createdAt: { lt: cutoff } }
      });
      return { deleted: result2.count, kind: "logs" };
    }
    const result = await runtime.prisma.interjectionLog.deleteMany({
      where: { createdAt: { lt: cutoff } }
    });
    return { deleted: result.count, kind: "interjections" };
  };
}

// src/jobs/embeddings.ts
var import_shared = require("@hori/shared");
function createEmbeddingJob(runtime) {
  return async (job) => {
    if (job.data.entityType === "message") {
      const message = await runtime.prisma.message.findUnique({
        where: { id: job.data.entityId }
      });
      if (!message || message.content.length < runtime.env.MESSAGE_EMBED_MIN_CHARS) {
        return { skipped: true, reason: "message not eligible" };
      }
      const vector2 = await runtime.embeddingAdapter.embedOne(message.content);
      await runtime.prisma.messageEmbedding.upsert({
        where: { messageId: message.id },
        update: {
          guildId: message.guildId,
          channelId: message.channelId,
          dimensions: vector2.length
        },
        create: {
          messageId: message.id,
          guildId: message.guildId,
          channelId: message.channelId,
          dimensions: vector2.length
        }
      });
      await runtime.prisma.$executeRawUnsafe(
        `UPDATE "MessageEmbedding" SET embedding = $1::vector WHERE "messageId" = $2`,
        (0, import_shared.toVectorLiteral)(vector2),
        message.id
      );
      await runtime.prisma.message.update({
        where: { id: message.id },
        data: { vectorizedAt: /* @__PURE__ */ new Date() }
      });
      return { skipped: false, entityType: "message" };
    }
    const source = job.data.entityType === "server_memory" ? await runtime.prisma.serverMemory.findUnique({ where: { id: job.data.entityId } }) : await runtime.prisma.userMemoryNote.findUnique({ where: { id: job.data.entityId } });
    if (!source) {
      return { skipped: true, reason: "entity not found" };
    }
    const value = "value" in source ? source.value : "";
    const vector = await runtime.embeddingAdapter.embedOne(value);
    await runtime.retrievalService.setEmbedding(job.data.entityType, job.data.entityId, (0, import_shared.toVectorLiteral)(vector));
    return { skipped: false, entityType: job.data.entityType };
  };
}

// src/jobs/profiles.ts
var import_llm = require("@hori/llm");
function createProfileJob(runtime) {
  return async (job) => {
    const stats = await runtime.analytics.getUserStats(job.data.guildId, job.data.userId);
    if (!stats || !runtime.profileService.isEligible(stats.totalMessages)) {
      return { skipped: true, reason: "user not eligible" };
    }
    const current = await runtime.profileService.getProfile(job.data.guildId, job.data.userId);
    if (current && !runtime.profileService.shouldRefreshProfile({
      totalMessages: stats.totalMessages,
      lastProfiledAt: current.lastProfiledAt,
      sourceWindowSize: current.sourceWindowSize
    })) {
      return { skipped: true, reason: "profile refresh not needed" };
    }
    const messages = await runtime.profileService.getRecentMessagesForProfile(job.data.guildId, job.data.userId, 50);
    const response = await runtime.llmClient.chat({
      model: runtime.env.OLLAMA_SMART_MODEL,
      messages: (0, import_llm.buildUserProfilePrompt)(
        [
          `\u0421\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043A\u0430: totalMessages=${stats.totalMessages}, avgMessageLength=${stats.avgMessageLength}, totalReplies=${stats.totalReplies}, totalMentions=${stats.totalMentions}.`,
          "\u0421\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F:",
          ...messages.map((message) => `- ${message.content}`)
        ].join("\n")
      ),
      format: "json",
      temperature: 0.2
    });
    const parsed = JSON.parse(response.message.content);
    await runtime.profileService.upsertProfile({
      guildId: job.data.guildId,
      userId: job.data.userId,
      summaryShort: parsed.summaryShort ?? "\u041F\u0440\u043E\u0444\u0438\u043B\u044C \u0441\u044B\u0440\u043E\u0439, \u0434\u0430\u043D\u043D\u044B\u0445 \u043C\u0430\u043B\u043E\u0432\u0430\u0442\u043E.",
      styleTags: parsed.styleTags ?? [],
      topicTags: parsed.topicTags ?? [],
      confidenceScore: Number(parsed.confidenceScore ?? 0.4),
      sourceWindowSize: stats.totalMessages,
      isEligible: true
    });
    return { skipped: false };
  };
}

// src/jobs/search-cache.ts
function createSearchCacheCleanupJob(runtime) {
  return async (_job) => {
    const result = await runtime.searchCache.cleanupExpired();
    return { deleted: result.count };
  };
}

// src/jobs/summaries.ts
var import_llm2 = require("@hori/llm");
function createSummaryJob(runtime) {
  return async (job) => {
    const messages = await runtime.summaryService.getMessagesForNextSummary(
      job.data.guildId,
      job.data.channelId,
      runtime.env.SUMMARY_CHUNK_MESSAGE_COUNT
    );
    if (messages.length < runtime.env.SUMMARY_MIN_MESSAGES) {
      return { skipped: true, reason: "not enough messages" };
    }
    const prompt = (0, import_llm2.buildSummaryPrompt)(
      messages.map((message) => `[${message.user.globalName || message.user.username || message.userId}] ${message.content}`).join("\n"),
      "\u0421\u0434\u0435\u043B\u0430\u0439 \u043A\u0440\u0430\u0442\u043A\u0443\u044E \u0438 \u0434\u043B\u0438\u043D\u043D\u0443\u044E \u0441\u0432\u043E\u0434\u043A\u0443. \u0412 \u043F\u0435\u0440\u0432\u043E\u0439 \u0441\u0442\u0440\u043E\u043A\u0435 \u043A\u043E\u0440\u043E\u0442\u043A\u043E, \u0434\u0430\u043B\u044C\u0448\u0435 \u043F\u043E\u0434\u0440\u043E\u0431\u043D\u0435\u0435."
    );
    const response = await runtime.llmClient.chat({
      model: runtime.env.OLLAMA_SMART_MODEL,
      messages: prompt
    });
    const [summaryShort, ...rest] = response.message.content.split("\n");
    await runtime.summaryService.storeSummary({
      guildId: job.data.guildId,
      channelId: job.data.channelId,
      rangeStart: messages[0].createdAt,
      rangeEnd: messages[messages.length - 1].createdAt,
      summaryShort: summaryShort.trim(),
      summaryLong: rest.join("\n").trim() || summaryShort.trim(),
      topicTags: [],
      notableUsers: [...new Set(messages.map((message) => message.userId))].slice(0, 5)
    });
    return { skipped: false, count: messages.length };
  };
}

// src/index.ts
async function main() {
  const env = (0, import_config.loadEnv)();
  (0, import_config.assertEnvForRole)(env, "worker");
  const logger = (0, import_shared2.createLogger)(env.LOG_LEVEL);
  const prisma = (0, import_shared2.createPrismaClient)();
  const redis = (0, import_shared2.createRedisClient)(env.REDIS_URL);
  const queues = (0, import_shared2.createAppQueues)(env.REDIS_URL, env.JOB_QUEUE_PREFIX);
  const analytics = new import_analytics.AnalyticsQueryService(prisma);
  const summaryService = new import_memory.SummaryService(prisma);
  const profileService = new import_memory.ProfileService(prisma, env);
  const retrievalService = new import_memory.RetrievalService(prisma);
  const searchCache = new import_search.SearchCacheService(prisma, redis);
  const llmClient = new import_llm3.OllamaClient(env, logger);
  const embeddingAdapter = new import_llm3.EmbeddingAdapter(llmClient, env);
  const runtime = {
    env,
    logger,
    prisma,
    redis,
    queues,
    analytics,
    summaryService,
    profileService,
    retrievalService,
    searchCache,
    llmClient,
    embeddingAdapter
  };
  const workers = [
    (0, import_shared2.createWorker)(import_shared2.QUEUE_NAMES.summary, env.REDIS_URL, env.JOB_QUEUE_PREFIX, createSummaryJob(runtime), env.JOB_CONCURRENCY_SUMMARIES),
    (0, import_shared2.createWorker)(import_shared2.QUEUE_NAMES.profile, env.REDIS_URL, env.JOB_QUEUE_PREFIX, createProfileJob(runtime), env.JOB_CONCURRENCY_PROFILES),
    (0, import_shared2.createWorker)(import_shared2.QUEUE_NAMES.embedding, env.REDIS_URL, env.JOB_QUEUE_PREFIX, createEmbeddingJob(runtime), env.JOB_CONCURRENCY_EMBEDDINGS),
    (0, import_shared2.createWorker)(import_shared2.QUEUE_NAMES.searchCache, env.REDIS_URL, env.JOB_QUEUE_PREFIX, createSearchCacheCleanupJob(runtime), 1),
    (0, import_shared2.createWorker)(import_shared2.QUEUE_NAMES.cleanup, env.REDIS_URL, env.JOB_QUEUE_PREFIX, createCleanupJob(runtime), 1)
  ];
  await Promise.all([
    queues.cleanup.add("cleanup", { kind: "logs" }, { jobId: "cleanup:logs", repeat: { every: 24 * 60 * 60 * 1e3 } }),
    queues.cleanup.add("cleanup", { kind: "interjections" }, { jobId: "cleanup:interjections", repeat: { every: 24 * 60 * 60 * 1e3 } }),
    queues.searchCache.add(
      "search-cache",
      { nowIso: (/* @__PURE__ */ new Date()).toISOString() },
      { jobId: "search-cache:cleanup", repeat: { every: 60 * 60 * 1e3 } }
    )
  ]);
  for (const worker of workers) {
    worker.on("failed", (job, error) => {
      logger.error({ queue: worker.name, jobId: job?.id, error }, "worker job failed");
    });
  }
  logger.info("workers started");
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
