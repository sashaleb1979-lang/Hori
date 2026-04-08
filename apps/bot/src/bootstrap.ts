import type { Client } from "discord.js";

import { AnalyticsQueryService, MessageIngestService } from "@hori/analytics";
import { assertEnvForRole, loadEnv } from "@hori/config";
import { createChatOrchestrator, RuntimeConfigService, SlashAdminService } from "@hori/core";
import { EmbeddingAdapter, ModelRouter, OllamaClient, ToolOrchestrator } from "@hori/llm";
import { ContextService, ProfileService, RelationshipService, RetrievalService, SummaryService } from "@hori/memory";
import { BraveSearchClient, SearchCacheService } from "@hori/search";
import { createLogger, createPrismaClient, createRedisClient, createAppQueues } from "@hori/shared";

import { createDiscordClient } from "./gateway/create-discord-client";
import { registerEvents } from "./events/register-events";

export interface BotRuntime {
  env: ReturnType<typeof loadEnv>;
  client: Client;
  logger: ReturnType<typeof createLogger>;
  prisma: ReturnType<typeof createPrismaClient>;
  redis: ReturnType<typeof createRedisClient>;
  queues: ReturnType<typeof createAppQueues>;
  ingestService: MessageIngestService;
  analytics: AnalyticsQueryService;
  slashAdmin: SlashAdminService;
  runtimeConfig: RuntimeConfigService;
  orchestrator: ReturnType<typeof createChatOrchestrator>;
}

export async function bootstrapBot() {
  const env = loadEnv();
  assertEnvForRole(env, "bot");

  const logger = createLogger(env.LOG_LEVEL);
  const prisma = createPrismaClient();
  const redis = createRedisClient(env.REDIS_URL);
  const queues = createAppQueues(env.REDIS_URL, env.JOB_QUEUE_PREFIX);
  const client = createDiscordClient();

  const analytics = new AnalyticsQueryService(prisma);
  const summaryService = new SummaryService(prisma);
  const relationshipService = new RelationshipService(prisma);
  const retrievalService = new RetrievalService(prisma);
  const profileService = new ProfileService(prisma, env);
  const runtimeConfig = new RuntimeConfigService(prisma, env);
  const contextService = new ContextService(prisma, summaryService, profileService, relationshipService, retrievalService);
  const llmClient = new OllamaClient(env, logger);
  const modelRouter = new ModelRouter(env);
  const embeddingAdapter = new EmbeddingAdapter(llmClient, env);
  const searchCache = new SearchCacheService(prisma, redis);
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
