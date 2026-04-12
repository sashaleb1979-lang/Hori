import type { ModelKind } from "@hori/shared";

export interface ModelProfile {
  temperature: number;
  maxTokens: number;
  topP?: number;
}

const modelProfiles: Record<ModelKind, ModelProfile> = {
  fast: {
    temperature: 0.4,
    maxTokens: 400,
    topP: 0.9
  },
  smart: {
    temperature: 0.55,
    maxTokens: 700,
    topP: 0.95
  }
};

export function getModelProfile(kind: ModelKind): ModelProfile {
  return modelProfiles[kind];
}
