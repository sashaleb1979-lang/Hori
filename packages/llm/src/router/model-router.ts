import type { AppEnv } from "@hori/config";
import type { BotIntent, ModelKind } from "@hori/shared";

import { chatModelProfile, type ModelProfile, getModelProfile } from "./model-profiles";

export class ModelRouter {
  constructor(private readonly env: AppEnv) {}

  private get isOpenAI(): boolean {
    return (this.env as Record<string, unknown>).LLM_PROVIDER === "openai";
  }

  pickKind(intent: BotIntent): ModelKind {
    switch (intent) {
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

  pickModel(intent: BotIntent) {
    if (this.isOpenAI) {
      const env = this.env as Record<string, unknown>;
      return this.pickKind(intent) === "smart"
        ? (env.OPENAI_SMART_MODEL as string) ?? "gpt-4o-mini"
        : (env.OPENAI_CHAT_MODEL as string) ?? "gpt-4o-mini";
    }

    return this.pickKind(intent) === "smart" ? this.env.OLLAMA_SMART_MODEL : this.env.OLLAMA_FAST_MODEL;
  }

  pickEmbedModel(): string {
    if (this.isOpenAI) {
      return ((this.env as Record<string, unknown>).OPENAI_EMBED_MODEL as string) ?? "text-embedding-3-small";
    }

    return this.env.OLLAMA_EMBED_MODEL;
  }

  pickProfile(intent: BotIntent): ModelProfile {
    if (intent === "chat") {
      return chatModelProfile;
    }

    return getModelProfile(this.pickKind(intent));
  }
}

