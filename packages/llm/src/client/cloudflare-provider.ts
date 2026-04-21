import type { AppLogger } from "@hori/shared";

import { OpenAICompatibleProvider } from "./openai-compatible-provider";

export class CloudflareProvider extends OpenAICompatibleProvider {
  constructor(
    accountId: string,
    apiToken: string,
    logger: AppLogger,
    options?: { timeoutMs?: number; logTraffic?: boolean; logMaxChars?: number }
  ) {
    super({
      name: "cloudflare",
      endpointUrl: `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`,
      apiKey: apiToken,
      logger,
      timeoutMs: options?.timeoutMs,
      logTraffic: options?.logTraffic,
      logMaxChars: options?.logMaxChars
    });
  }
}