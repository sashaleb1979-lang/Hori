import type { AppEnv } from "@hori/config";
import type { BotIntent, ModelKind } from "@hori/shared";

export class ModelRouter {
  constructor(private readonly env: AppEnv) {}

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
    return this.pickKind(intent) === "smart" ? this.env.OLLAMA_SMART_MODEL : this.env.OLLAMA_FAST_MODEL;
  }
}

