import type { ModelKind } from "@hori/shared";

export interface ModelProfile {
  temperature: number;
  maxTokens: number;
  topP?: number;
}

const modelProfiles: Record<ModelKind, ModelProfile> = {
  fast: {
    temperature: 0.35,
    maxTokens: 220,
    topP: 0.88
  },
  smart: {
    temperature: 0.5,
    maxTokens: 360,
    topP: 0.92
  }
};

export const chatModelProfile: ModelProfile = {
  temperature: 0.55,
  maxTokens: 280,
  topP: 0.90
};

export function getModelProfile(kind: ModelKind): ModelProfile {
  return modelProfiles[kind];
}
