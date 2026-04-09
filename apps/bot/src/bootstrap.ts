import type { Client } from "discord.js";

import { AnalyticsQueryService, MessageIngestService } from "@hori/analytics";
import { assertEnvForRole, loadEnv } from "@hori/config";
import { createChatOrchestrator, RuntimeConfigService, SlashAdminService } from "@hori/core";
import { EmbeddingAdapter, ModelRouter, OllamaClient, ToolOrchestrator } from "@hori/llm";
import { ContextService, ProfileService, RelationshipService, RetrievalService, SummaryService } from "@hori/memory";
import { BraveSearchClient, SearchCacheService } from "@hori/search";
import { createLogger, createPrismaClient, createRedisClient, createAppQueues, ensureInfrastructureReady, loadPersistedOllamaBaseUrl } from "@hori/shared";

import { createDiscordClient } from "./gateway/create-discord-client";
import { registerEvents } from "./events/register-events";

interface BotQueueHandle {
  add(jobName: string, payload?: unknown, options?: unknown): Promise<unknown>;
}

interface BotQueues {
  summary: BotQueueHandle;
  profile: BotQueueHandle;
  embedding: BotQueueHandle;
  cleanup: BotQueueHandle;
  searchCache: BotQueueHandle;
  prefix: string;
}

export interface BotRuntime {
  env: ReturnType<typeof loadEnv>;
  client: Client;
  logger: ReturnType<typeof createLogger>;
  prisma: ReturnType<typeof createPrismaClient>;
  redis: ReturnType<typeof createRedisClient>;
  queues: BotQueues;
  ingestService: MessageIngestService;
  analytics: AnalyticsQueryService;
  slashAdmin: SlashAdminService;
  runtimeConfig: RuntimeConfigService;
  orchestrator: ReturnType<typeof createChatOrchestrator>;
}

function createNoopQueues(logger: ReturnType<typeof createLogger>, prefix: string): BotQueues {
  let warned = false;

  const createNoopQueue = (queueName: string): BotQueueHandle => ({
      async add(jobName: string) {
        if (!warned) {
          warned = true;
          logger.warn(
            { queue: queueName, jobName },
            "redis unavailable, background jobs are disabled in local fallback mode"
          );
        }

        return null;
      }
    });

  return {
    summary: createNoopQueue("summary"),
    profile: createNoopQueue("profile"),
    embedding: createNoopQueue("embedding"),
    cleanup: createNoopQueue("cleanup"),
    searchCache: createNoopQueue("searchCache"),
    prefix
  };
}

export async function bootstrapBot() {
  const env = loadEnv();
  assertEnvForRole(env, "bot");

  const logger = createLogger(env.LOG_LEVEL);
  const prisma = createPrismaClient();
  const redis = createRedisClient(env.REDIS_URL);
  const { redisReady } = await ensureInfrastructureReady({
    role: "bot",
    nodeEnv: env.NODE_ENV,
    databaseUrl: env.DATABASE_URL,
    redisUrl: env.REDIS_URL,
    prisma,
    redis,
    logger,
    allowRedisFailure: env.NODE_ENV !== "production"
  });

  if (!env.OLLAMA_BASE_URL) {
    const persistedOllamaUrl = await loadPersistedOllamaBaseUrl(prisma, logger);

    if (persistedOllamaUrl) {
      env.OLLAMA_BASE_URL = persistedOllamaUrl;
    }
  }

  const queues: BotQueues = redisReady
    ? createAppQueues(env.REDIS_URL, env.JOB_QUEUE_PREFIX)
    : createNoopQueues(logger, env.JOB_QUEUE_PREFIX);
  const client = createDiscordClient();

  const analytics = new AnalyticsQueryService(prisma);
  const summaryService = new SummaryService(prisma);
  const relationshipService = new RelationshipService(prisma);
  const retrievalService = new RetrievalService(prisma);
  const profileService = new ProfileService(prisma, env);
  const runtimeConfig = new RuntimeConfigService(prisma, env);
  const contextService = new ContextService(prisma, summaryService, profileService, relationshipService, retrievalService);
  const llmClient = new OllamaClient(env, logger);

  // --- Ollama health check: сразу видно в логах, жива ли нейронка ---
  if (env.OLLAMA_BASE_URL) {
    try {
      const probe = await fetch(new URL("/api/tags", env.OLLAMA_BASE_URL), {
        signal: AbortSignal.timeout(5000)
      });
      if (probe.ok) {
        const data = (await probe.json()) as { models?: { name: string }[] };
        const models = data.models?.map((m) => m.name) ?? [];
        logger.info({ url: env.OLLAMA_BASE_URL, models }, `ollama reachable: url=${env.OLLAMA_BASE_URL} models=${models.join(",")}`);
      } else {
        logger.warn({ url: env.OLLAMA_BASE_URL, status: probe.status }, `ollama responded with error: url=${env.OLLAMA_BASE_URL} status=${probe.status} — fallback replies until fixed`);
      }
    } catch (error) {
      const errorText = error instanceof Error ? error.message : String(error);
      logger.warn({ url: env.OLLAMA_BASE_URL, error: errorText }, `ollama unreachable: url=${env.OLLAMA_BASE_URL} error=${errorText} — bot will use fallback replies. Run start-tunnel.ps1 and /bot-ai-url`);
    }
  } else {
    logger.warn("OLLAMA_BASE_URL not set — bot will use fallback replies for all LLM calls");
  }

  const modelRouter = new ModelRouter(env);
  const embeddingAdapter = new EmbeddingAdapter(llmClient, env);
  const searchCache = new SearchCacheService(prisma, redisReady ? redis : null, logger);
  const searchClient = new BraveSearchClient(env, logger, searchCache);
  const toolOrchestrator = new ToolOrchestrator(llmClient, logger);
  const ingestService = new MessageIngestService(prisma, logger);
  const slashAdmin = new SlashAdminService(prisma, analytics, relationshipService, retrievalService, summaryService);
  const orchestrator = createChatOrchestrator({
    env,
    logger,
    prisma,
    analytics,
    contextService,
    retrieval: retrievalService,
    llmClient,
    modelRouter,
    toolOrchestrator,
    searchClient,
    embeddingAdapter,
    runtimeConfig
  });

  const runtime: BotRuntime = {
    env,
    client,
    logger,
    prisma,
    redis,
    queues,
    ingestService,
    analytics,
    slashAdmin,
    runtimeConfig,
    orchestrator
  };

  registerEvents(runtime);
  await client.login(env.DISCORD_TOKEN);

  return runtime;
}
