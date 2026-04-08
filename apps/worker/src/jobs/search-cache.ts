import type { Job } from "bullmq";

import type { SearchCacheCleanupJobPayload } from "@hori/shared";

import type { WorkerRuntime } from "../index";

export function createSearchCacheCleanupJob(runtime: WorkerRuntime) {
  return async (_job: Job<SearchCacheCleanupJobPayload>) => {
    const result = await runtime.searchCache.cleanupExpired();
    return { deleted: result.count };
  };
}

