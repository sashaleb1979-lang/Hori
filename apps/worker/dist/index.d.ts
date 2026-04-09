import { AnalyticsQueryService } from '@hori/analytics';
import { loadEnv } from '@hori/config';
import { LlmClient, EmbeddingAdapter } from '@hori/llm';
import { SummaryService, ProfileService, RetrievalService } from '@hori/memory';
import { SearchCacheService } from '@hori/search';
import { createLogger, createPrismaClient, createRedisClient, createAppQueues } from '@hori/shared';

interface WorkerRuntime {
    env: ReturnType<typeof loadEnv>;
    logger: ReturnType<typeof createLogger>;
    prisma: ReturnType<typeof createPrismaClient>;
    redis: ReturnType<typeof createRedisClient>;
    queues: ReturnType<typeof createAppQueues>;
    analytics: AnalyticsQueryService;
    summaryService: SummaryService;
    profileService: ProfileService;
    retrievalService: RetrievalService;
    searchCache: SearchCacheService;
    llmClient: LlmClient;
    embeddingAdapter: EmbeddingAdapter;
}

export type { WorkerRuntime };
