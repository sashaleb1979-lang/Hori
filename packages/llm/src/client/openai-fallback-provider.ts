import type { AppLogger } from "@hori/shared";

import { OpenAICompatibleProvider } from "./openai-compatible-provider";

const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";

export class OpenAiFallbackProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string, logger: AppLogger, options?: { timeoutMs?: number; logTraffic?: boolean; logMaxChars?: number }) {
    super({
      name: "openai",
      endpointUrl: OPENAI_CHAT_COMPLETIONS_URL,
      apiKey,
      logger,
      timeoutMs: options?.timeoutMs,
      logTraffic: options?.logTraffic,
      logMaxChars: options?.logMaxChars
    });
  }
}