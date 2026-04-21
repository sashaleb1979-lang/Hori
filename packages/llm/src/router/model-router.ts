import type { AppEnv } from "@hori/config";
import type { BotIntent, ModelKind } from "@hori/shared";

import {
  analyticsModelProfile,
  chatModelProfile,
  type ModelProfile,
  getModelProfile,
  profileModelProfile,
  rewriteModelProfile,
  searchModelProfile,
  summaryModelProfile,
  utilityFastModelProfile
} from "./model-profiles";

import {
  type ModelRoutingSlot,
  type ResolvedModelRouting,
  OPENAI_EMBEDDING_MODEL,
  resolveOpenAIEmbeddingDimensions,
  slotForIntent
} from "./model-routing";

type ProviderAwareEnv = AppEnv & {
  LLM_PROVIDER?: string;
  OPENAI_MODEL?: string;
  OPENAI_CHAT_MODEL?: string;
  OPENAI_SMART_MODEL?: string;
  OPENAI_EMBED_MODEL?: string;
};

export class ModelRouter {
  constructor(private readonly env: AppEnv) {}

  private get providerEnv(): ProviderAwareEnv {
    return this.env as ProviderAwareEnv;
  }

  private get isOpenAI(): boolean {
    return this.providerEnv.LLM_PROVIDER === "openai";
  }

  private get isRouter(): boolean {
    return this.providerEnv.LLM_PROVIDER === "router";
  }

  pickKind(intent: BotIntent): ModelKind {
    switch (intent) {
      case "analytics":
      case "rewrite":
      case "summary":
      case "search":
      case "profile":
      case "memory_write":
      case "memory_forget":
        return "smart";
      default:
        return "fast";
    }
  }

  pickSlot(intent: BotIntent): ModelRoutingSlot {
    return slotForIntent(intent);
  }

  pickModelForSlot(slot: ModelRoutingSlot, routing: ResolvedModelRouting): string {
    return routing.slots[slot];
  }

  pickModel(intent: BotIntent, routing?: ResolvedModelRouting): string {
    if (routing) {
      return this.pickModelForSlot(this.pickSlot(intent), routing);
    }

    if (this.isOpenAI) {
      const env = this.providerEnv;
      return this.pickKind(intent) === "smart"
        ? env.OPENAI_SMART_MODEL ?? "gpt-5.4-nano"
        : env.OPENAI_CHAT_MODEL ?? "gpt-5.4-nano";
    }

    if (this.isRouter) {
      return this.providerEnv.OPENAI_MODEL ?? this.providerEnv.OPENAI_CHAT_MODEL ?? "gpt-5-nano";
    }

    return this.pickKind(intent) === "smart" ? this.env.OLLAMA_SMART_MODEL : this.env.OLLAMA_FAST_MODEL;
  }

  pickEmbeddingModel(overrides?: { dimensions?: number }): { model: string; dimensions?: number } {
    if (this.isOpenAI || this.isRouter) {
      return {
        model: OPENAI_EMBEDDING_MODEL,
        dimensions: resolveOpenAIEmbeddingDimensions({ OPENAI_EMBED_DIMENSIONS: overrides?.dimensions ?? this.providerEnv.OPENAI_EMBED_DIMENSIONS })
      };
    }

    return { model: this.env.OLLAMA_EMBED_MODEL };
  }

  pickEmbedModel(): string {
    if (this.isOpenAI || this.isRouter) {
      return this.providerEnv.OPENAI_EMBED_MODEL ?? "text-embedding-3-small";
    }

    return this.env.OLLAMA_EMBED_MODEL;
  }

  pickProfile(intent: BotIntent): ModelProfile {
    switch (intent) {
      case "chat":
        return chatModelProfile;
      case "help":
        return utilityFastModelProfile;
      case "rewrite":
        return rewriteModelProfile;
      case "analytics":
        return analyticsModelProfile;
      case "summary":
        return summaryModelProfile;
      case "search":
        return searchModelProfile;
      case "profile":
        return profileModelProfile;
      default:
        return getModelProfile(this.pickKind(intent));
    }
  }
}