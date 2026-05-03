import { AnalyticsQueryService } from "@hori/analytics";
import { assertEnvForRole, loadEnv } from "@hori/config";
import { createRuntimeLlmClient, RuntimeConfigService } from "@hori/core";
import { EmbeddingAdapter, ModelRouter } from "@hori/llm";
import type { LlmClient } from "@hori/llm";
import { ProfileService, RelationshipService, RetrievalService, SessionBufferService, SummaryService, TopicService } from "@hori/memory";
import { SearchCacheService } from "@hori/search";
import {
  createAppQueues,
  createLogger,
  createPrismaClient,
  createRedisClient,
  createWorker,
  ensureInfrastructureReady,
  QUEUE_NAMES,
} from "@hori/shared";

import { createCleanupJob } from "./jobs/cleanup";
import { createConversationAnalysisJob } from "./jobs/conversation-analysis";
import { createEmbeddingJob } from "./jobs/embeddings";
import { createMemoryFormationJob } from "./jobs/memory-formation";
import { createProfileJob } from "./jobs/profiles";
import { createSearchCacheCleanupJob } from "./jobs/search-cache";
import { createSessionCompactionJob } from "./jobs/session-compaction";
import { createSessionJob } from "./jobs/session-evaluator";
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
  sessionBuffer: SessionBufferService;
  profileService: ProfileService;
  retrievalService: RetrievalService;
  relationshipService: RelationshipService;
  topicService: TopicService;
  searchCache: SearchCacheService;
  runtimeConfig: RuntimeConfigService;
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

  const queues = createAppQueues(env.REDIS_URL, env.JOB_QUEUE_PREFIX);
  const analytics = new AnalyticsQueryService(prisma);
  const summaryService = new SummaryService(prisma);
  const sessionBuffer = new SessionBufferService(prisma, redis);
  const profileService = new ProfileService(prisma, env);
  const relationshipService = new RelationshipService(prisma);
  const retrievalService = new RetrievalService(prisma, logger);
  const topicService = new TopicService(prisma, {
    topicTtlMinutes: env.TOPIC_TTL_MINUTES,
    similarityThreshold: env.TOPIC_SIM_THRESHOLD
  });
  const searchCache = new SearchCacheService(prisma, redis);
  const runtimeConfig = new RuntimeConfigService(prisma, env);

  const { client: llmClient } = createRuntimeLlmClient(env, logger, runtimeConfig, "worker");

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
    sessionBuffer,
    profileService,
    retrievalService,
    relationshipService,
    topicService,
    searchCache,
    runtimeConfig,
    llmClient,
    modelRouter,
    embeddingAdapter
  };

  const workers = [
    createWorker(QUEUE_NAMES.summary, env.REDIS_URL, env.JOB_QUEUE_PREFIX, createSummaryJob(runtime), env.JOB_CONCURRENCY_SUMMARIES),
    createWorker(QUEUE_NAMES.sessionCompaction, env.REDIS_URL, env.JOB_QUEUE_PREFIX, createSessionCompactionJob(runtime), 1),
    createWorker(QUEUE_NAMES.profile, env.REDIS_URL, env.JOB_QUEUE_PREFIX, createProfileJob(runtime), env.JOB_CONCURRENCY_PROFILES),
    createWorker(QUEUE_NAMES.embedding, env.REDIS_URL, env.JOB_QUEUE_PREFIX, createEmbeddingJob(runtime), env.JOB_CONCURRENCY_EMBEDDINGS),
    createWorker(QUEUE_NAMES.topic, env.REDIS_URL, env.JOB_QUEUE_PREFIX, createTopicJob(runtime), 1),
    createWorker(QUEUE_NAMES.session, env.REDIS_URL, env.JOB_QUEUE_PREFIX, createSessionJob(runtime), 1),
    createWorker(QUEUE_NAMES.memoryFormation, env.REDIS_URL, env.JOB_QUEUE_PREFIX, createMemoryFormationJob(runtime), 1),
    createWorker(QUEUE_NAMES.searchCache, env.REDIS_URL, env.JOB_QUEUE_PREFIX, createSearchCacheCleanupJob(runtime), 1),
    createWorker(QUEUE_NAMES.cleanup, env.REDIS_URL, env.JOB_QUEUE_PREFIX, createCleanupJob(runtime), 1),
    createWorker(QUEUE_NAMES.conversationAnalysis, env.REDIS_URL, env.JOB_QUEUE_PREFIX, createConversationAnalysisJob(runtime), 1)
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
