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

export const utilityFastModelProfile: ModelProfile = {
  temperature: 0.65,
  maxTokens: 360,
  topP: 0.95
};

export const rewriteModelProfile: ModelProfile = {
  temperature: 0.45,
  maxTokens: 420,
  topP: 0.92
};

export const analyticsModelProfile: ModelProfile = {
  temperature: 0.5,
  maxTokens: 520,
  topP: 0.92
};

export const summaryModelProfile: ModelProfile = {
  temperature: 0.62,
  maxTokens: 560,
  topP: 0.94
};

export const searchModelProfile: ModelProfile = {
  temperature: 0.5,
  maxTokens: 620,
  topP: 0.92
};

export const profileModelProfile: ModelProfile = {
  temperature: 0.5,
  maxTokens: 420,
  topP: 0.92
};

export function getModelProfile(kind: ModelKind): ModelProfile {
  return modelProfiles[kind];
}
