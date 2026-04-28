import type { Client } from "discord.js";

import { AnalyticsQueryService, MessageIngestService } from "@hori/analytics";
import { assertEnvForRole, loadEnv } from "@hori/config";
import { AffinityService, createChatOrchestrator, createRuntimeLlmClient, FlashTrollingService, KnowledgeService, MediaReactionService, MoodService, QueuePhrasePoolService, ReplyQueueService, RuntimeConfigService, SlashAdminService } from "@hori/core";
import { EmbeddingAdapter, ModelRouter, ToolOrchestrator } from "@hori/llm";
import type { LlmClient } from "@hori/llm";
import { ActiveMemoryService, ContextService, InteractionRequestService, MemoryAlbumService, ProfileService, PromptSlotService, ReflectionService, RelationshipService, RetrievalService, SessionBufferService, SummaryService } from "@hori/memory";
import { BraveSearchClient, SearchCacheService } from "@hori/search";
import { createLogger, createPrismaClient, createRedisClient, createAppQueues, ensureInfrastructureReady } from "@hori/shared";

import { createDiscordClient } from "./gateway/create-discord-client";
import { registerEvents } from "./events/register-events";

interface BotQueueHandle {
  add(jobName: string, payload?: unknown, options?: unknown): Promise<unknown>;
}

interface BotQueues {
  summary: BotQueueHandle;
  profile: BotQueueHandle;
  embedding: BotQueueHandle;
  topic: BotQueueHandle;
  session: BotQueueHandle;
  memoryFormation: BotQueueHandle;
  cleanup: BotQueueHandle;
  searchCache: BotQueueHandle;
  conversationAnalysis: BotQueueHandle;
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
  memoryAlbum: MemoryAlbumService;
  interactionRequests: InteractionRequestService;
  reflection: ReflectionService;
  runtimeConfig: RuntimeConfigService;
  orchestrator: ReturnType<typeof createChatOrchestrator>;
  replyQueue: ReplyQueueService;
  queuePhrasePool: QueuePhrasePoolService;
  flashTrolling: FlashTrollingService;
  relationshipService: RelationshipService;
  promptSlots: PromptSlotService;
  knowledge: KnowledgeService;
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
    topic: createNoopQueue("topic"),
    session: createNoopQueue("session"),
    memoryFormation: createNoopQueue("memoryFormation"),
    cleanup: createNoopQueue("cleanup"),
    searchCache: createNoopQueue("searchCache"),
    conversationAnalysis: createNoopQueue("conversationAnalysis"),
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

  const queues: BotQueues = redisReady
    ? createAppQueues(env.REDIS_URL, env.JOB_QUEUE_PREFIX)
    : createNoopQueues(logger, env.JOB_QUEUE_PREFIX);
  const client = createDiscordClient();

  const analytics = new AnalyticsQueryService(prisma);
  const summaryService = new SummaryService(prisma);
  const relationshipService = new RelationshipService(prisma);
  const retrievalService = new RetrievalService(prisma, logger);
  const activeMemoryService = new ActiveMemoryService(retrievalService);
  const memoryAlbumService = new MemoryAlbumService(prisma);
  const interactionRequestService = new InteractionRequestService(prisma);
  const reflectionService = new ReflectionService(prisma);
  const profileService = new ProfileService(prisma, env);
  const runtimeConfig = new RuntimeConfigService(prisma, env);
  const affinityService = new AffinityService(prisma);
  const moodService = new MoodService(prisma);
  const mediaReactionService = new MediaReactionService(prisma);
  const replyQueueService = new ReplyQueueService(prisma, env.REPLY_QUEUE_BUSY_TTL_SEC);
  const queuePhrasePoolService = new QueuePhrasePoolService();
  const flashTrollingService = new FlashTrollingService();
  const promptSlotService = new PromptSlotService(prisma);
  const sessionBufferService = redisReady ? new SessionBufferService(prisma, redis) : new SessionBufferService(prisma);
  const contextService = new ContextService(prisma, summaryService, profileService, relationshipService, retrievalService, activeMemoryService, redisReady ? redis : undefined, sessionBufferService);

  const { client: llmClient } = createRuntimeLlmClient(env, logger, runtimeConfig, "bot");

  const modelRouter = new ModelRouter(env);
  const embeddingAdapter = new EmbeddingAdapter(llmClient, modelRouter);
  const searchCache = new SearchCacheService(prisma, redisReady ? redis : null, logger);
  const searchClient = new BraveSearchClient(env, logger, searchCache);
  const toolOrchestrator = new ToolOrchestrator(llmClient, logger);
  const ingestService = new MessageIngestService(prisma, logger);
  const knowledgeService = new KnowledgeService({
    prisma,
    logger,
    defaultAnswerModel: env.OPENAI_MODEL,
    embed: async (text) => {
      const embeddingMeta = modelRouter.pickEmbeddingModel({});
      const vector = await embeddingAdapter.embedOne(text, { dimensions: embeddingMeta.dimensions });
      return { vector, model: embeddingMeta.model, dimensions: embeddingMeta.dimensions ?? vector.length };
    },
    chat: async ({ model, messages, maxTokens }) => {
      const response = await llmClient.chat({
        model,
        messages,
        maxTokens,
        metadata: { purpose: "knowledge_qa" }
      });
      return { content: response.message?.content ?? "", model: response.routing?.model ?? model };
    }
  });
  const slashAdmin = new SlashAdminService(
    prisma,
    analytics,
    relationshipService,
    retrievalService,
    summaryService,
    runtimeConfig,
    moodService,
    replyQueueService,
    memoryAlbumService,
    reflectionService,
    embeddingAdapter,
    llmClient
  );
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
    runtimeConfig,
    relationships: relationshipService,
    affinity: affinityService,
    mood: moodService,
    media: mediaReactionService,
    reflection: reflectionService,
    sessionBuffer: sessionBufferService,
    promptSlots: promptSlotService
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
    memoryAlbum: memoryAlbumService,
    interactionRequests: interactionRequestService,
    reflection: reflectionService,
    runtimeConfig,
    orchestrator,
    replyQueue: replyQueueService,
    queuePhrasePool: queuePhrasePoolService,
    flashTrolling: flashTrollingService,
    relationshipService,
    promptSlots: promptSlotService,
    knowledge: knowledgeService
  };

  registerEvents(runtime);
  await client.login(env.DISCORD_TOKEN);

  return runtime;
}
