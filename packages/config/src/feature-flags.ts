import type { FeatureFlags } from "@hori/shared";

import type { AppEnv } from "./env";

export function buildFeatureFlags(env: AppEnv): FeatureFlags {
  return {
    webSearch: env.FEATURE_WEB_SEARCH,
    autoInterject: env.FEATURE_AUTOINTERJECT,
    contextActions: env.FEATURE_CONTEXT_ACTIONS,
    roast: env.FEATURE_ROAST,
    replyQueueEnabled: env.FEATURE_REPLY_QUEUE_ENABLED,
    runtimeConfigCacheEnabled: env.FEATURE_RUNTIME_CONFIG_CACHE_ENABLED,
    embeddingCacheEnabled: env.FEATURE_EMBEDDING_CACHE_ENABLED,
    messageKindAwareMode: env.FEATURE_MESSAGE_KIND_AWARE_MODE,
    memoryAlbumEnabled: env.FEATURE_MEMORY_ALBUM_ENABLED,
    interactionRequestsEnabled: env.FEATURE_INTERACTION_REQUESTS_ENABLED,
    linkUnderstandingEnabled: env.FEATURE_LINK_UNDERSTANDING_ENABLED,
    naturalMessageSplittingEnabled: env.FEATURE_NATURAL_MESSAGE_SPLITTING_ENABLED,
    selectiveEngagementEnabled: env.FEATURE_SELECTIVE_ENGAGEMENT_ENABLED,
    selfReflectionLessonsEnabled: env.FEATURE_SELF_REFLECTION_LESSONS_ENABLED,
    mediaReactionsEnabled: env.FEATURE_MEDIA_REACTIONS_ENABLED ?? true
  };
}

