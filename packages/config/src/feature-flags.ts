import type { FeatureFlags } from "@hori/shared";

import type { AppEnv } from "./env";

export function buildFeatureFlags(env: AppEnv): FeatureFlags {
  return {
    webSearch: env.FEATURE_WEB_SEARCH,
    autoInterject: env.FEATURE_AUTOINTERJECT,
    userProfiles: env.FEATURE_USER_PROFILES,
    contextActions: env.FEATURE_CONTEXT_ACTIONS,
    roast: env.FEATURE_ROAST,
    channelAwareMode: env.FEATURE_CHANNEL_AWARE_MODE,
    messageKindAwareMode: env.FEATURE_MESSAGE_KIND_AWARE_MODE,
    antiSlopStrictMode: env.FEATURE_ANTI_SLOP_STRICT_MODE,
    playfulModeEnabled: env.FEATURE_PLAYFUL_MODE_ENABLED,
    irritatedModeEnabled: env.FEATURE_IRRITATED_MODE_ENABLED,
    ideologicalFlavourEnabled: env.FEATURE_IDEOLOGICAL_FLAVOUR_ENABLED,
    analogyBanEnabled: env.FEATURE_ANALOGY_BAN_ENABLED,
    slangLayerEnabled: env.FEATURE_SLANG_LAYER_ENABLED,
    selfInterjectionConstraintsEnabled: env.FEATURE_SELF_INTERJECTION_CONSTRAINTS_ENABLED
  };
}

