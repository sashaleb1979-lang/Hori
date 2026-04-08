import type { FeatureFlags } from "@hori/shared";

import type { AppEnv } from "./env";

export function buildFeatureFlags(env: AppEnv): FeatureFlags {
  return {
    webSearch: env.FEATURE_WEB_SEARCH,
    autoInterject: env.FEATURE_AUTOINTERJECT,
    userProfiles: env.FEATURE_USER_PROFILES,
    contextActions: env.FEATURE_CONTEXT_ACTIONS,
    roast: env.FEATURE_ROAST
  };
}

