import type { AppLogger } from "@hori/shared";

import { OpenAICompatibleProvider } from "./openai-compatible-provider";

const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";

export class DeepSeekProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string, baseUrl: string | undefined, logger: AppLogger, options?: { timeoutMs?: number; logTraffic?: boolean; logMaxChars?: number }) {
    super({
      name: "deepseek",
      endpointUrl: buildDeepSeekChatCompletionsUrl(baseUrl),
      apiKey,
      logger,
      timeoutMs: options?.timeoutMs,
      logTraffic: options?.logTraffic,
      logMaxChars: options?.logMaxChars,
      extraBody: {
        thinking: {
          type: "disabled"
        }
      }
    });
  }
}

function buildDeepSeekChatCompletionsUrl(baseUrl?: string) {
  let normalized = (baseUrl?.trim() || DEFAULT_DEEPSEEK_BASE_URL).replace(/\/+$/, "");

  if (normalized.endsWith("/chat/completions")) {
    return normalized;
  }

  if (normalized.endsWith("/v1")) {
    normalized = normalized.slice(0, -3);
  }

  return `${normalized}/chat/completions`;
}