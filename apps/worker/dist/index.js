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
var import_core = require("@hori/core");
var import_llm4 = require("@hori/llm");
var import_memory3 = require("@hori/memory");
var import_search = require("@hori/search");
var import_shared6 = require("@hori/shared");

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
    const [expiredMoods, oldQueueItems] = await Promise.all([
      runtime.prisma.moodState.deleteMany({
        where: { endsAt: { lt: cutoff } }
      }),
      runtime.prisma.replyQueueItem.deleteMany({
        where: {
          status: { in: ["done", "dropped"] },
          updatedAt: { lt: cutoff }
        }
      })
    ]);
    return {
      deleted: result.count + expiredMoods.count + oldQueueItems.count,
      kind: "interjections",
      interjections: result.count,
      expiredMoods: expiredMoods.count,
      oldQueueItems: oldQueueItems.count
    };
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
      let vector2;
      try {
        vector2 = await runtime.embeddingAdapter.embedOne(message.content);
      } catch (error) {
        runtime.logger.warn({ entityId: message.id, error: (0, import_shared.asErrorMessage)(error), jobId: job.id }, "embedding skipped because ollama is unavailable");
        return { skipped: true, reason: "ollama unavailable" };
      }
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
    const source = job.data.entityType === "server_memory" ? await runtime.prisma.serverMemory.findUnique({ where: { id: job.data.entityId } }) : job.data.entityType === "user_memory" ? await runtime.prisma.userMemoryNote.findUnique({ where: { id: job.data.entityId } }) : job.data.entityType === "channel_memory" ? await runtime.prisma.channelMemoryNote.findUnique({ where: { id: job.data.entityId } }) : await runtime.prisma.eventMemory.findUnique({ where: { id: job.data.entityId } });
    if (!source) {
      return { skipped: true, reason: "entity not found" };
    }
    const value = "value" in source ? source.value : "";
    let vector;
    try {
      vector = await runtime.embeddingAdapter.embedOne(value);
    } catch (error) {
      runtime.logger.warn({ entityId: job.data.entityId, error: (0, import_shared.asErrorMessage)(error), jobId: job.id }, "embedding skipped because ollama is unavailable");
      return { skipped: true, reason: "ollama unavailable" };
    }
    await runtime.retrievalService.setEmbedding(job.data.entityType, job.data.entityId, (0, import_shared.toVectorLiteral)(vector));
    return { skipped: false, entityType: job.data.entityType };
  };
}

// src/jobs/memory-formation.ts
var import_llm = require("@hori/llm");
var import_memory = require("@hori/memory");
var import_shared2 = require("@hori/shared");
var chunkSize = 80;
var maxMessagesByDepth = {
  channel: {
    recent: 700,
    deep: 3500
  },
  server: {
    recent: 1600,
    deep: 8e3
  }
};
function createMemoryFormationJob(runtime) {
  return async (job) => {
    const run = await runtime.prisma.memoryBuildRun.findUnique({
      where: { id: job.data.runId }
    });
    if (!run) {
      return { skipped: true, reason: "run not found" };
    }
    if (job.data.scope === "channel" && !job.data.channelId) {
      await markRunFailed(runtime, job.data.runId, "channel scope requires channelId");
      return { skipped: true, reason: "channelId required" };
    }
    const isOpenAI = runtime.env.LLM_PROVIDER === "openai";
    const runtimeSettings = await runtime.runtimeConfig.getRuntimeSettings();
    let formationEnv;
    let bestModelName;
    let bestModelReason;
    if (isOpenAI) {
      bestModelName = runtime.modelRouter.pickModelForSlot("memory", runtimeSettings.modelRouting);
      bestModelReason = `openai ${runtimeSettings.modelRouting.preset} memory slot`;
      formationEnv = {
        ...runtime.env,
        OLLAMA_FAST_MODEL: bestModelName,
        OLLAMA_SMART_MODEL: bestModelName
      };
    } else {
      const bestModel = await (0, import_llm.resolveBestInstalledChatModel)(
        runtime.env.OLLAMA_BASE_URL,
        runtime.env.OLLAMA_SMART_MODEL,
        runtime.logger
      );
      bestModelName = bestModel.model;
      bestModelReason = bestModel.reason;
      formationEnv = {
        ...runtime.env,
        OLLAMA_FAST_MODEL: bestModel.model,
        OLLAMA_SMART_MODEL: bestModel.model
      };
    }
    const formationService = new import_memory.MemoryFormationService(
      runtime.prisma,
      runtime.retrievalService,
      runtime.llmClient,
      formationEnv,
      runtime.modelRouter.pickEmbedModel()
    );
    await runtime.prisma.memoryBuildRun.update({
      where: { id: job.data.runId },
      data: {
        status: "running",
        startedAt: /* @__PURE__ */ new Date(),
        bestModel: bestModelName,
        progressJson: {
          phase: "loading_messages",
          processedChunks: 0,
          totalChunks: 0,
          model: bestModelName,
          modelReason: bestModelReason
        }
      }
    });
    try {
      const messages = await loadMessages(runtime, job.data);
      if (!messages.length) {
        await runtime.prisma.memoryBuildRun.update({
          where: { id: job.data.runId },
          data: {
            status: "finished",
            finishedAt: /* @__PURE__ */ new Date(),
            progressJson: { phase: "finished", processedChunks: 0, totalChunks: 0 },
            resultJson: {
              skipped: true,
              reason: "no messages in database for selected scope",
              model: bestModelName
            }
          }
        });
        return { skipped: true, reason: "no messages" };
      }
      const chunks = chunkMessages(messages, chunkSize);
      const totals = { extractedFacts: 0, added: 0, updated: 0, deleted: 0, skipped: 0 };
      const sampleFacts = [];
      for (let index = 0; index < chunks.length; index += 1) {
        const chunk = chunks[index] ?? [];
        const dominant = pickDominantUser(chunk, job.data.requestedBy);
        const channelId = pickDominantChannel(chunk, job.data.channelId ?? null);
        const priorSummaries = channelId ? await runtime.summaryService.getRecentSummaries(job.data.guildId, channelId, 2) : [];
        let result;
        try {
          result = await formationService.runFormation({
            guildId: job.data.guildId,
            channelId: channelId ?? job.data.channelId ?? "server",
            userId: dominant.userId,
            displayName: dominant.displayName,
            priorSummaries: priorSummaries.map((summary) => summary.summaryShort),
            messages: toFormationMessages(chunk),
            source: `memory_build:${job.data.scope}:${job.data.depth}`,
            createdBy: job.data.requestedBy
          });
        } catch (error) {
          runtime.logger.warn(
            { error: (0, import_shared2.asErrorMessage)(error), guildId: job.data.guildId, runId: job.data.runId, chunkIndex: index },
            "memory formation chunk failed"
          );
          totals.skipped += 1;
          continue;
        }
        totals.extractedFacts += result.extractedFacts;
        totals.added += result.added;
        totals.updated += result.updated;
        totals.deleted += result.deleted;
        totals.skipped += result.skipped;
        sampleFacts.push(...result.facts.slice(0, Math.max(0, 12 - sampleFacts.length)));
        const progress = {
          phase: "forming_memory",
          processedChunks: index + 1,
          totalChunks: chunks.length,
          totals,
          latestChannelId: channelId,
          latestUserId: dominant.userId,
          model: bestModelName,
          modelReason: bestModelReason
        };
        await job.updateProgress(progress);
        await runtime.prisma.memoryBuildRun.update({
          where: { id: job.data.runId },
          data: { progressJson: progress }
        });
      }
      const resultJson = {
        scope: job.data.scope,
        depth: job.data.depth,
        messageCount: messages.length,
        chunkCount: chunks.length,
        totals,
        sampleFacts,
        model: bestModelName,
        modelReason: bestModelReason
      };
      await runtime.prisma.memoryBuildRun.update({
        where: { id: job.data.runId },
        data: {
          status: "finished",
          finishedAt: /* @__PURE__ */ new Date(),
          progressJson: { phase: "finished", processedChunks: chunks.length, totalChunks: chunks.length, totals },
          resultJson
        }
      });
      return { skipped: false, ...resultJson };
    } catch (error) {
      const errorText = (0, import_shared2.asErrorMessage)(error);
      await markRunFailed(runtime, job.data.runId, errorText);
      throw error;
    }
  };
}
async function loadMessages(runtime, payload) {
  const take = maxMessagesByDepth[payload.scope][payload.depth];
  const messages = await runtime.prisma.message.findMany({
    where: {
      guildId: payload.guildId,
      ...payload.scope === "channel" && payload.channelId ? { channelId: payload.channelId } : {}
    },
    orderBy: { createdAt: "desc" },
    take,
    include: { user: true }
  });
  return messages.filter((message) => message.content.trim().length > 0).reverse();
}
function chunkMessages(messages, size) {
  const chunks = [];
  for (let index = 0; index < messages.length; index += size) {
    chunks.push(messages.slice(index, index + size));
  }
  return chunks;
}
function toFormationMessages(messages) {
  return messages.map((message) => {
    const author = message.user.globalName || message.user.username || message.userId;
    return {
      role: "user",
      content: `[${author} | userId=${message.userId} | channelId=${message.channelId}] ${message.content}`
    };
  });
}
function pickDominantUser(messages, fallbackUserId) {
  const counts = /* @__PURE__ */ new Map();
  for (const message of messages) {
    if (message.user.isBot) {
      continue;
    }
    const entry2 = counts.get(message.userId) ?? {
      count: 0,
      displayName: message.user.globalName || message.user.username || null
    };
    entry2.count += 1;
    counts.set(message.userId, entry2);
  }
  const [userId, entry] = [...counts.entries()].sort((left, right) => right[1].count - left[1].count)[0] ?? [
    fallbackUserId,
    { count: 0, displayName: null }
  ];
  return { userId, displayName: entry.displayName };
}
function pickDominantChannel(messages, fallbackChannelId) {
  const counts = /* @__PURE__ */ new Map();
  for (const message of messages) {
    counts.set(message.channelId, (counts.get(message.channelId) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? fallbackChannelId;
}
async function markRunFailed(runtime, runId, errorText) {
  await runtime.prisma.memoryBuildRun.update({
    where: { id: runId },
    data: {
      status: "failed",
      finishedAt: /* @__PURE__ */ new Date(),
      errorText
    }
  });
}

// src/jobs/profiles.ts
var import_llm2 = require("@hori/llm");
var import_memory2 = require("@hori/memory");
var import_shared3 = require("@hori/shared");
function createProfileJob(runtime) {
  return async (job) => {
    const profile = (0, import_llm2.getModelProfile)("smart");
    const runtimeSettings = await runtime.runtimeConfig.getRuntimeSettings();
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
    const prompt = (0, import_llm2.buildUserProfilePrompt)(
      [
        `\u0421\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043A\u0430: totalMessages=${stats.totalMessages}, avgMessageLength=${stats.avgMessageLength}, totalReplies=${stats.totalReplies}, totalMentions=${stats.totalMentions}.`,
        "\u0421\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F:",
        ...messages.map((message) => `- ${message.content}`)
      ].join("\n")
    );
    let parsed;
    try {
      const response = await runtime.llmClient.chat({
        model: runtime.modelRouter.pickModel("profile", runtimeSettings.modelRouting),
        messages: prompt,
        format: "json",
        temperature: Math.min(profile.temperature, 0.2),
        topP: profile.topP,
        maxTokens: Math.min(profile.maxTokens, 220)
      });
      const raw = response.message.content.trim();
      try {
        parsed = JSON.parse(raw);
      } catch {
        const start = raw.indexOf("{");
        const end = raw.lastIndexOf("}");
        if (start !== -1 && end > start) {
          parsed = JSON.parse(raw.slice(start, end + 1));
        } else {
          throw new Error("no JSON object found in LLM response");
        }
      }
    } catch (error) {
      runtime.logger.warn({ error: (0, import_shared3.asErrorMessage)(error), guildId: job.data.guildId, jobId: job.id, userId: job.data.userId }, "profile refresh skipped because ollama is unavailable or returned invalid json");
      return { skipped: true, reason: "ollama unavailable" };
    }
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
    const latestChannelId = messages[0]?.channelId;
    if (latestChannelId && messages.length) {
      try {
        const memoryModel = runtime.modelRouter.pickModelForSlot("memory", runtimeSettings.modelRouting);
        const formationEnv = {
          ...runtime.env,
          OLLAMA_FAST_MODEL: memoryModel,
          OLLAMA_SMART_MODEL: memoryModel
        };
        const formationService = new import_memory2.MemoryFormationService(runtime.prisma, runtime.retrievalService, runtime.llmClient, formationEnv, runtime.modelRouter.pickEmbedModel());
        const priorSummaries = await runtime.summaryService.getRecentSummaries(job.data.guildId, latestChannelId, 2);
        await formationService.runFormation({
          guildId: job.data.guildId,
          channelId: latestChannelId,
          userId: job.data.userId,
          priorSummaries: priorSummaries.map((summary) => summary.summaryShort),
          source: "profile_job",
          createdBy: "worker",
          messages: messages.slice().reverse().map((message) => ({ role: "user", content: message.content }))
        });
      } catch (error) {
        runtime.logger.warn({ error: (0, import_shared3.asErrorMessage)(error), guildId: job.data.guildId, userId: job.data.userId, jobId: job.id }, "memory formation skipped");
      }
    }
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
var import_llm3 = require("@hori/llm");
var import_shared4 = require("@hori/shared");
function createSummaryJob(runtime) {
  return async (job) => {
    const profile = (0, import_llm3.getModelProfile)("smart");
    const messages = await runtime.summaryService.getMessagesForNextSummary(
      job.data.guildId,
      job.data.channelId,
      runtime.env.SUMMARY_CHUNK_MESSAGE_COUNT
    );
    if (messages.length < runtime.env.SUMMARY_MIN_MESSAGES) {
      return { skipped: true, reason: "not enough messages" };
    }
    const runtimeSettings = await runtime.runtimeConfig.getRuntimeSettings();
    const prompt = (0, import_llm3.buildSummaryPrompt)(
      messages.map((message) => `[${message.user.globalName || message.user.username || message.userId}] ${message.content}`).join("\n"),
      "\u0421\u0434\u0435\u043B\u0430\u0439 \u043A\u0440\u0430\u0442\u043A\u0443\u044E \u0438 \u0434\u043B\u0438\u043D\u043D\u0443\u044E \u0441\u0432\u043E\u0434\u043A\u0443. \u0412 \u043F\u0435\u0440\u0432\u043E\u0439 \u0441\u0442\u0440\u043E\u043A\u0435 \u043A\u043E\u0440\u043E\u0442\u043A\u043E, \u0434\u0430\u043B\u044C\u0448\u0435 \u043F\u043E\u0434\u0440\u043E\u0431\u043D\u0435\u0435."
    );
    let response;
    try {
      response = await runtime.llmClient.chat({
        model: runtime.modelRouter.pickModel("summary", runtimeSettings.modelRouting),
        messages: prompt,
        temperature: profile.temperature,
        topP: profile.topP,
        maxTokens: profile.maxTokens
      });
    } catch (error) {
      runtime.logger.warn({ channelId: job.data.channelId, error: (0, import_shared4.asErrorMessage)(error), guildId: job.data.guildId, jobId: job.id }, "summary skipped because ollama is unavailable");
      return { skipped: true, reason: "ollama unavailable" };
    }
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

// src/jobs/topics.ts
var import_shared5 = require("@hori/shared");
function createTopicJob(runtime) {
  return async (job) => {
    if (!runtime.env.FEATURE_TOPIC_ENGINE_ENABLED) {
      return { skipped: true, reason: "feature disabled" };
    }
    const message = await runtime.prisma.message.findUnique({
      where: { id: job.data.messageId }
    });
    if (!message) {
      return { skipped: true, reason: "message not found" };
    }
    let embedding;
    if (message.content.length >= runtime.env.MESSAGE_EMBED_MIN_CHARS) {
      try {
        embedding = await runtime.embeddingAdapter.embedOne(message.content);
      } catch (error) {
        runtime.logger.warn({ error: (0, import_shared5.asErrorMessage)(error), messageId: message.id, jobId: job.id }, "topic embedding unavailable");
      }
    }
    return runtime.topicService.updateFromMessage({
      guildId: message.guildId,
      channelId: message.channelId,
      messageId: message.id,
      content: message.content,
      createdAt: message.createdAt,
      replyToMessageId: message.replyToMessageId,
      embedding
    });
  };
}

// src/index.ts
async function main() {
  const env = (0, import_config.loadEnv)();
  (0, import_config.assertEnvForRole)(env, "worker");
  const logger = (0, import_shared6.createLogger)(env.LOG_LEVEL);
  const prisma = (0, import_shared6.createPrismaClient)();
  const redis = (0, import_shared6.createRedisClient)(env.REDIS_URL);
  await (0, import_shared6.ensureInfrastructureReady)({
    role: "worker",
    nodeEnv: env.NODE_ENV,
    databaseUrl: env.DATABASE_URL,
    redisUrl: env.REDIS_URL,
    prisma,
    redis,
    logger
  });
  if (!env.OLLAMA_BASE_URL) {
    const persistedOllamaUrl = await (0, import_shared6.loadPersistedOllamaBaseUrl)(prisma, logger);
    if (persistedOllamaUrl) {
      env.OLLAMA_BASE_URL = persistedOllamaUrl;
    }
  }
  if ((0, import_shared6.shouldAutoSyncOllamaBaseUrl)()) {
    (0, import_shared6.startOllamaBaseUrlSync)({ env, prisma, logger });
  }
  const queues = (0, import_shared6.createAppQueues)(env.REDIS_URL, env.JOB_QUEUE_PREFIX);
  const analytics = new import_analytics.AnalyticsQueryService(prisma);
  const summaryService = new import_memory3.SummaryService(prisma);
  const profileService = new import_memory3.ProfileService(prisma, env);
  const retrievalService = new import_memory3.RetrievalService(prisma, logger);
  const topicService = new import_memory3.TopicService(prisma, {
    topicTtlMinutes: env.TOPIC_TTL_MINUTES,
    similarityThreshold: env.TOPIC_SIM_THRESHOLD
  });
  const searchCache = new import_search.SearchCacheService(prisma, redis);
  const runtimeConfig = new import_core.RuntimeConfigService(prisma, env);
  const llmProvider = env.LLM_PROVIDER;
  let llmClient;
  if (llmProvider === "openai") {
    llmClient = new import_llm4.OpenAIClient(env, logger);
    logger.info("worker LLM provider: OpenAI");
  } else {
    llmClient = new import_llm4.OllamaClient(env, logger);
    logger.info("worker LLM provider: Ollama");
  }
  const modelRouter = new import_llm4.ModelRouter(env);
  const embeddingAdapter = new import_llm4.EmbeddingAdapter(llmClient, modelRouter);
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
    topicService,
    searchCache,
    runtimeConfig,
    llmClient,
    modelRouter,
    embeddingAdapter
  };
  const workers = [
    (0, import_shared6.createWorker)(import_shared6.QUEUE_NAMES.summary, env.REDIS_URL, env.JOB_QUEUE_PREFIX, createSummaryJob(runtime), env.JOB_CONCURRENCY_SUMMARIES),
    (0, import_shared6.createWorker)(import_shared6.QUEUE_NAMES.profile, env.REDIS_URL, env.JOB_QUEUE_PREFIX, createProfileJob(runtime), env.JOB_CONCURRENCY_PROFILES),
    (0, import_shared6.createWorker)(import_shared6.QUEUE_NAMES.embedding, env.REDIS_URL, env.JOB_QUEUE_PREFIX, createEmbeddingJob(runtime), env.JOB_CONCURRENCY_EMBEDDINGS),
    (0, import_shared6.createWorker)(import_shared6.QUEUE_NAMES.topic, env.REDIS_URL, env.JOB_QUEUE_PREFIX, createTopicJob(runtime), 1),
    (0, import_shared6.createWorker)(import_shared6.QUEUE_NAMES.memoryFormation, env.REDIS_URL, env.JOB_QUEUE_PREFIX, createMemoryFormationJob(runtime), 1),
    (0, import_shared6.createWorker)(import_shared6.QUEUE_NAMES.searchCache, env.REDIS_URL, env.JOB_QUEUE_PREFIX, createSearchCacheCleanupJob(runtime), 1),
    (0, import_shared6.createWorker)(import_shared6.QUEUE_NAMES.cleanup, env.REDIS_URL, env.JOB_QUEUE_PREFIX, createCleanupJob(runtime), 1)
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
