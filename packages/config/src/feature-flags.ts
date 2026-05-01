import type { FeatureFlags } from "@hori/shared";

import type { AppEnv } from "./env";

export function buildFeatureFlags(env: AppEnv): FeatureFlags {
  return {
    webSearch: env.FEATURE_WEB_SEARCH,
    autoInterject: env.FEATURE_AUTOINTERJECT,
    emotionalAdviceAnchorsEnabled: env.FEATURE_EMOTIONAL_ADVICE_ANCHORS_ENABLED,
    userProfiles: env.FEATURE_USER_PROFILES,
    contextActions: env.FEATURE_CONTEXT_ACTIONS,
    roast: env.FEATURE_ROAST,
    replyQueueEnabled: env.FEATURE_REPLY_QUEUE_ENABLED,
    runtimeConfigCacheEnabled: env.FEATURE_RUNTIME_CONFIG_CACHE_ENABLED,
    embeddingCacheEnabled: env.FEATURE_EMBEDDING_CACHE_ENABLED,
    channelAwareMode: env.FEATURE_CHANNEL_AWARE_MODE,
    messageKindAwareMode: env.FEATURE_MESSAGE_KIND_AWARE_MODE,
    antiSlopStrictMode: env.FEATURE_ANTI_SLOP_STRICT_MODE,
    playfulModeEnabled: env.FEATURE_PLAYFUL_MODE_ENABLED,
    irritatedModeEnabled: env.FEATURE_IRRITATED_MODE_ENABLED,
    ideologicalFlavourEnabled: env.FEATURE_IDEOLOGICAL_FLAVOUR_ENABLED,
    analogyBanEnabled: env.FEATURE_ANALOGY_BAN_ENABLED,
    slangLayerEnabled: env.FEATURE_SLANG_LAYER_ENABLED,
    selfInterjectionConstraintsEnabled: env.FEATURE_SELF_INTERJECTION_CONSTRAINTS_ENABLED,
    memoryAlbumEnabled: env.FEATURE_MEMORY_ALBUM_ENABLED,
    interactionRequestsEnabled: env.FEATURE_INTERACTION_REQUESTS_ENABLED,
    linkUnderstandingEnabled: env.FEATURE_LINK_UNDERSTANDING_ENABLED,
    naturalMessageSplittingEnabled: env.FEATURE_NATURAL_MESSAGE_SPLITTING_ENABLED,
    selectiveEngagementEnabled: env.FEATURE_SELECTIVE_ENGAGEMENT_ENABLED,
    selfReflectionLessonsEnabled: env.FEATURE_SELF_REFLECTION_LESSONS_ENABLED
  };
}

