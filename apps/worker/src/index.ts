import { AnalyticsQueryService } from "@hori/analytics";
import { assertEnvForRole, loadEnv } from "@hori/config";
import { EmbeddingAdapter, ModelRouter, OllamaClient, OpenAIClient } from "@hori/llm";
import type { LlmClient } from "@hori/llm";
import { ProfileService, RetrievalService, SummaryService, TopicService } from "@hori/memory";
import { SearchCacheService } from "@hori/search";
import {
  createAppQueues,
  createLogger,
  createPrismaClient,
  createRedisClient,
  createWorker,
  ensureInfrastructureReady,
  loadPersistedOllamaBaseUrl,
  QUEUE_NAMES,
  shouldAutoSyncOllamaBaseUrl,
  startOllamaBaseUrlSync
} from "@hori/shared";

import { createCleanupJob } from "./jobs/cleanup";
import { createEmbeddingJob } from "./jobs/embeddings";
import { createMemoryFormationJob } from "./jobs/memory-formation";
import { createProfileJob } from "./jobs/profiles";
import { createSearchCacheCleanupJob } from "./jobs/search-cache";
import { createSummaryJob } from "./jobs/summaries";
import { createTopicJob } from "./jobs/topics";

export interface WorkerRuntime {
  env: ReturnType<typeof loadEnv>;
  logger: ReturnType<typeof createLogger>;
  prisma: ReturnType<typeof createPrismaClient>;
  redis: ReturnType<typeof createRedisClient>;
  queues: ReturnType<typeof createAppQueues>;
  analytics: AnalyticsQueryService;
  summaryService: SummaryService;
  profileService: ProfileService;
  retrievalService: RetrievalService;
  topicService: TopicService;
  searchCache: SearchCacheService;
  llmClient: LlmClient;
  modelRouter: ModelRouter;
  embeddingAdapter: EmbeddingAdapter;
}

async function main() {
  const env = loadEnv();
  assertEnvForRole(env, "worker");

  const logger = createLogger(env.LOG_LEVEL);
  const prisma = createPrismaClient();
  const redis = createRedisClient(env.REDIS_URL);
  await ensureInfrastructureReady({
    role: "worker",
    nodeEnv: env.NODE_ENV,
    databaseUrl: env.DATABASE_URL,
    redisUrl: env.REDIS_URL,
    prisma,
    redis,
    logger
  });

  if (!env.OLLAMA_BASE_URL) {
    const persistedOllamaUrl = await loadPersistedOllamaBaseUrl(prisma, logger);

    if (persistedOllamaUrl) {
      env.OLLAMA_BASE_URL = persistedOllamaUrl;
    }
  }

  if (shouldAutoSyncOllamaBaseUrl()) {
    startOllamaBaseUrlSync({ env, prisma, logger });
  }

  const queues = createAppQueues(env.REDIS_URL, env.JOB_QUEUE_PREFIX);
  const analytics = new AnalyticsQueryService(prisma);
  const summaryService = new SummaryService(prisma);
  const profileService = new ProfileService(prisma, env);
  const retrievalService = new RetrievalService(prisma);
  const topicService = new TopicService(prisma, {
    topicTtlMinutes: env.TOPIC_TTL_MINUTES,
    similarityThreshold: env.TOPIC_SIM_THRESHOLD
  });
  const searchCache = new SearchCacheService(prisma, redis);

  const llmProvider = (env as unknown as Record<string, unknown>).LLM_PROVIDER as string;
  let llmClient: LlmClient;

  if (llmProvider === "openai") {
    llmClient = new OpenAIClient(env, logger);
    logger.info("worker LLM provider: OpenAI");
  } else {
    llmClient = new OllamaClient(env, logger);
    logger.info("worker LLM provider: Ollama");
  }

  const modelRouter = new ModelRouter(env);
  const embeddingAdapter = new EmbeddingAdapter(llmClient, modelRouter);

  const runtime: WorkerRuntime = {
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
    llmClient,
    modelRouter,
    embeddingAdapter
  };

  const workers = [
    createWorker(QUEUE_NAMES.summary, env.REDIS_URL, env.JOB_QUEUE_PREFIX, createSummaryJob(runtime), env.JOB_CONCURRENCY_SUMMARIES),
    createWorker(QUEUE_NAMES.profile, env.REDIS_URL, env.JOB_QUEUE_PREFIX, createProfileJob(runtime), env.JOB_CONCURRENCY_PROFILES),
    createWorker(QUEUE_NAMES.embedding, env.REDIS_URL, env.JOB_QUEUE_PREFIX, createEmbeddingJob(runtime), env.JOB_CONCURRENCY_EMBEDDINGS),
    createWorker(QUEUE_NAMES.topic, env.REDIS_URL, env.JOB_QUEUE_PREFIX, createTopicJob(runtime), 1),
    createWorker(QUEUE_NAMES.memoryFormation, env.REDIS_URL, env.JOB_QUEUE_PREFIX, createMemoryFormationJob(runtime), 1),
    createWorker(QUEUE_NAMES.searchCache, env.REDIS_URL, env.JOB_QUEUE_PREFIX, createSearchCacheCleanupJob(runtime), 1),
    createWorker(QUEUE_NAMES.cleanup, env.REDIS_URL, env.JOB_QUEUE_PREFIX, createCleanupJob(runtime), 1)
  ];

  await Promise.all([
    queues.cleanup.add("cleanup", { kind: "logs" }, { jobId: "cleanup:logs", repeat: { every: 24 * 60 * 60 * 1000 } }),
    queues.cleanup.add("cleanup", { kind: "interjections" }, { jobId: "cleanup:interjections", repeat: { every: 24 * 60 * 60 * 1000 } }),
    queues.searchCache.add(
      "search-cache",
      { nowIso: new Date().toISOString() },
      { jobId: "search-cache:cleanup", repeat: { every: 60 * 60 * 1000 } }
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
