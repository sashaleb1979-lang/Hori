import type { AppLogger } from "@hori/shared";

import { OpenAICompatibleProvider } from "./openai-compatible-provider";

const GEMINI_OPENAI_COMPAT_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

export class GeminiProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string, logger: AppLogger, options?: { timeoutMs?: number; logTraffic?: boolean; logMaxChars?: number }) {
    super({
      name: "gemini",
      endpointUrl: GEMINI_OPENAI_COMPAT_URL,
      apiKey,
      logger,
      timeoutMs: options?.timeoutMs,
      logTraffic: options?.logTraffic,
      logMaxChars: options?.logMaxChars
    });
  }
}