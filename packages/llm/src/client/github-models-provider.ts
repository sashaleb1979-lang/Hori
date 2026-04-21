import type { AppLogger } from "@hori/shared";

import { OpenAICompatibleProvider } from "./openai-compatible-provider";

export class GitHubModelsProvider extends OpenAICompatibleProvider {
  constructor(
    apiKey: string,
    endpointUrl: string,
    logger: AppLogger,
    options?: { timeoutMs?: number; logTraffic?: boolean; logMaxChars?: number }
  ) {
    super({
      name: "github",
      endpointUrl,
      apiKey,
      logger,
      timeoutMs: options?.timeoutMs,
      logTraffic: options?.logTraffic,
      logMaxChars: options?.logMaxChars,
      defaultHeaders: {
        "X-GitHub-Api-Version": "2022-11-28"
      }
    });
  }
}