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
  resolveModelRouting,
  slotForIntent,
  type ModelRoutingSlot,
  type ResolvedModelRouting
} from "./model-routing";

type ProviderAwareEnv = AppEnv & {
  LLM_PROVIDER?: string;
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

  pickSlot(intent: BotIntent) {
    return slotForIntent(intent);
  }

  pickModel(intent: BotIntent, routing?: ResolvedModelRouting) {
    return this.pickModelForSlot(slotForIntent(intent), routing);
  }

  pickModelForSlot(slot: ModelRoutingSlot, routing?: ResolvedModelRouting) {
    const resolved = routing ?? resolveModelRouting(this.env);

    if (this.isOpenAI) {
      return resolved.slots[slot];
    }

    return resolved.slots[slot] ?? (this.isSmartSlot(slot) ? this.env.OLLAMA_SMART_MODEL : this.env.OLLAMA_FAST_MODEL);
  }

  pickEmbedModel(): string {
    if (this.isOpenAI) {
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

  private isSmartSlot(slot: ModelRoutingSlot) {
    return slot !== "classifier" && slot !== "chat";
  }
}

