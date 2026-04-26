import type { AppEnv } from "@hori/config";
import type { AppLogger } from "@hori/shared";
import { AiRouterClient, OpenAIClient, type LlmClient } from "@hori/llm";

import { RuntimeConfigService } from "./runtime-config-service";

export interface RuntimeLlmClientFactoryResult {
  client: LlmClient;
  mode: "openai" | "router";
}

export function createRuntimeLlmClient(
  env: AppEnv,
  logger: AppLogger,
  runtimeConfig: RuntimeConfigService,
  role: "bot" | "worker"
): RuntimeLlmClientFactoryResult {
  const llmProvider = (env as unknown as Record<string, unknown>).LLM_PROVIDER as string;
  const logPrefix = role === "worker" ? "worker " : "";

  if (llmProvider === "openai") {
    logger.info(`${logPrefix}LLM provider: OpenAI`);
    return {
      client: new OpenAIClient(env, logger),
      mode: "openai"
    };
  }

  (env as typeof env & { LLM_PROVIDER: string }).LLM_PROVIDER = "router";

  if (llmProvider === "ollama") {
    logger.warn(`${logPrefix}LLM_PROVIDER=ollama is deprecated in this runtime; using multi-provider AI router instead`);
  }

  logger.info(`${logPrefix}LLM provider: AI router`);
  return {
    client: new AiRouterClient(env, logger, {
      stateStore: {
        getState: () => runtimeConfig.getAiRouterState(),
        setState: async (state) => {
          await runtimeConfig.setAiRouterState(state);
        },
        updateState: (updater) => runtimeConfig.updateAiRouterState(updater)
      }
    }),
    mode: "router"
  };
}
