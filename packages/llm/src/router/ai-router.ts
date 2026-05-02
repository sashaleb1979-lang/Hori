import { randomUUID } from "node:crypto";

import {
  AI_ROUTER_PROVIDER_NAMES,
  getEnabledAiRouterProviders,
  resolveAiRouterEnvState,
  type AiRouterProviderName,
  type AppEnv
} from "@hori/config";
import type { AppLogger } from "@hori/shared";
import { asErrorMessage, normalizeWhitespace } from "@hori/shared";

import { CloudflareProvider } from "../client/cloudflare-provider";
import { DeepSeekProvider } from "../client/deepseek-provider";
import { GeminiProvider } from "../client/gemini-provider";
import { GitHubModelsProvider } from "../client/github-models-provider";
import type {
  LlmChatOptions,
  LlmChatResponse,
  LlmClient,
  LlmEmbedOptions
} from "../client/llm-client";
import { OpenAiFallbackProvider } from "../client/openai-fallback-provider";
import { OpenAIClient } from "../client/openai-client";
import { OPENAI_EMBEDDING_MODEL, resolveOpenAIEmbeddingDimensions } from "./model-routing";
import type { ChatProvider, ChatProviderRequest } from "./chat-provider";
import { InMemoryAiRouterStateStore, type AiRouterRecentRoute, type AiRouterState, type AiRouterStateStore } from "./ai-router-state";
import { classifyProviderError, type ProviderErrorInfo } from "./provider-error";
import { AiRouterQuotaManager } from "./quota-manager";

export type PreferredChatProviderValue = AiRouterProviderName | "auto";

export const PREFERRED_CHAT_PROVIDER_VALUES = ["auto", ...AI_ROUTER_PROVIDER_NAMES] as const;

export function isPreferredChatProviderValue(value: unknown): value is PreferredChatProviderValue {
  return typeof value === "string" && (PREFERRED_CHAT_PROVIDER_VALUES as readonly string[]).includes(value);
}

export interface AiRouterClientOptions {
  stateStore?: AiRouterStateStore;
  quotaManager?: AiRouterQuotaManager;
  providers?: Partial<Record<AiRouterProviderName, ChatProvider>>;
  embedClient?: LlmClient;
  /**
   * Async getter returning the operator's preferred chat provider for the
   * primary attempt. Other providers stay in the chain as fallback.
   * Return "auto" (or undefined) to keep the default order (deepseek first).
   */
  getPreferredChatProvider?: () => Promise<PreferredChatProviderValue | undefined> | PreferredChatProviderValue | undefined;
}

export interface AiRouterStatusSnapshot {
  enabledProviders: Array<{
    provider: AiRouterProviderName;
    enabled: boolean;
    enabledByFlag: boolean;
    configured: boolean;
    missing: string[];
  }>;
  activeOrder: string[];
  preferredChatProvider: PreferredChatProviderValue;
  cooldowns: Array<{ provider: string; model: string; cooldownUntil: string }>;
  geminiUsage: {
    flash: { used: number; limit?: number };
    pro: { used: number; limit?: number };
  };
  embeddings: {
    provider: "openai";
    model: string;
    dimensions: number;
    available: boolean;
    missing: string[];
  };
  recentRoutes: AiRouterRecentRoute[];
  fallbackCounts: Record<string, number>;
}

interface RouterAttempt {
  providerName: AiRouterProviderName;
  model: string;
  reason: string;
}

export class AiRouterClient implements LlmClient {
  private readonly envState;
  private readonly providers: Partial<Record<AiRouterProviderName, ChatProvider>>;
  private readonly quotaManager: AiRouterQuotaManager;
  private readonly embedClient?: LlmClient;
  private readonly preferredChatProviderGetter?: AiRouterClientOptions["getPreferredChatProvider"];

  constructor(
    private readonly env: AppEnv,
    private readonly logger: AppLogger,
    options: AiRouterClientOptions = {}
  ) {
    this.envState = resolveAiRouterEnvState(env);
    this.providers = options.providers ?? buildProviders(env, logger);
    this.preferredChatProviderGetter = options.getPreferredChatProvider;
    this.quotaManager = options.quotaManager ?? new AiRouterQuotaManager(
      options.stateStore ?? new InMemoryAiRouterStateStore(),
      {
        geminiFlashModel: env.GEMINI_FLASH_MODEL,
        geminiProModel: env.GEMINI_PRO_MODEL,
        deepseekCooldownMs: env.AI_ROUTER_DEEPSEEK_COOLDOWN_MS,
        geminiFlashDailyLimit: env.AI_ROUTER_GEMINI_FLASH_DAILY_LIMIT,
        geminiProDailyLimit: env.AI_ROUTER_GEMINI_PRO_DAILY_LIMIT,
        cloudflareCooldownMs: env.AI_ROUTER_CLOUDFLARE_COOLDOWN_MS,
        githubCooldownMs: env.AI_ROUTER_GITHUB_COOLDOWN_MS,
        openaiCooldownMs: env.AI_ROUTER_OPENAI_COOLDOWN_MS,
        reservationTtlMs: Math.max(env.OLLAMA_TIMEOUT_MS * 2, 5 * 60 * 1000)
      }
    );

    this.embedClient = options.embedClient ?? (env.OPENAI_API_KEY ? new OpenAIClient(env, logger) : undefined);
  }

  async chat(options: LlmChatOptions): Promise<LlmChatResponse> {
    const requestId = options.metadata?.requestId ?? randomUUID();
    const userKey = options.metadata?.userKey ?? "anonymous";
    const preferred = await this.resolvePreferredChatProvider();
    const attempts = this.buildAttemptChain(options, preferred);
    const routedFrom: string[] = [];
    const failedFrom: string[] = [];
    const allowPaidFallback = options.metadata?.allowPaidFallback !== false;
    let lastError: Error | undefined;

    for (const [index, attempt] of attempts.entries()) {
      if (!allowPaidFallback && (attempt.providerName === "deepseek" || attempt.providerName === "openai")) {
        continue;
      }

      const provider = this.providers[attempt.providerName];
      if (!provider) {
        this.logTransition({
          requestId,
          userKey,
          provider: attempt.providerName,
          model: attempt.model,
          fallbackDepth: index,
          reason: "provider_not_constructed"
        });
        routedFrom.push(`${attempt.providerName}:${attempt.model}`);
        continue;
      }

      if (!this.envState[attempt.providerName].enabled || !(await provider.isAvailable())) {
        this.logTransition({
          requestId,
          userKey,
          provider: attempt.providerName,
          model: attempt.model,
          fallbackDepth: index,
          reason: "provider_disabled"
        });
        routedFrom.push(`${attempt.providerName}:${attempt.model}`);
        continue;
      }

      if (options.tools?.length && provider.supportsTools === false) {
        this.logTransition({
          requestId,
          userKey,
          provider: attempt.providerName,
          model: attempt.model,
          fallbackDepth: index,
          reason: "tools_unsupported"
        });
        routedFrom.push(`${attempt.providerName}:${attempt.model}`);
        continue;
      }

      const availability = await this.quotaManager.reserve({
        provider: attempt.providerName,
        model: attempt.model,
        requestId
      });
      if (!availability.allowed) {
        this.logTransition({
          requestId,
          userKey,
          provider: attempt.providerName,
          model: attempt.model,
          fallbackDepth: index,
          reason: availability.reason ?? "unavailable"
        });
        routedFrom.push(`${attempt.providerName}:${attempt.model}`);
        continue;
      }

      try {
        const response = await this.sendWithRetry(provider, {
          ...options,
          model: attempt.model,
          metadata: {
            ...options.metadata,
            requestId,
            userKey,
            purpose: options.metadata?.purpose ?? attempt.reason
          }
        });

        await this.quotaManager.recordSuccess({
          ...options,
          provider: attempt.providerName,
          model: attempt.model,
          requestId,
          routedFrom,
          fallbackDepth: failedFrom.length,
          reason: attempt.reason
        });

        this.logger.info(
          {
            requestId,
            userKey,
            provider: attempt.providerName,
            model: attempt.model,
            latencyMs: response.latencyMs,
            success: true,
            fallbackDepth: failedFrom.length,
            routedFrom,
            finishReason: response.finishReason
          },
          "ai router request succeeded"
        );

        return {
          message: {
            role: "assistant",
            content: response.content,
            ...(response.toolCalls?.length ? { tool_calls: response.toolCalls } : {})
          },
          routing: {
            provider: response.provider,
            model: response.model,
            latencyMs: response.latencyMs,
            finishReason: response.finishReason,
            routedFrom,
            fallbackDepth: failedFrom.length,
            requestId
          },
          rawUsage: response.rawUsage,
          usage: normalizeUsage(response.rawUsage, response.latencyMs)
        };
      } catch (error) {
        const classification = provider.classifyError(error);
        await this.quotaManager.recordFailure({
          provider: attempt.providerName,
          model: attempt.model,
          classification: classification.class,
          requestId,
          routedFrom,
          fallbackDepth: failedFrom.length,
          reason: attempt.reason,
          retryAfterMs: classification.retryAfterMs
        });

        this.logger.warn(
          {
            requestId,
            userKey,
            provider: attempt.providerName,
            model: attempt.model,
            success: false,
            fallbackDepth: failedFrom.length,
            fallbackReason: attempt.reason,
            errorClass: classification.class,
            status: classification.status,
            message: classification.message
          },
          "ai router provider failed, falling back"
        );

        routedFrom.push(`${attempt.providerName}:${attempt.model}`);
        failedFrom.push(`${attempt.providerName}:${attempt.model}`);
        lastError = error instanceof Error ? error : new Error(String(error));

        if (!classification.fallbackImmediately) {
          throw lastError;
        }
      }
    }

    throw lastError ?? new Error(`AI router exhausted all providers for request ${requestId}`);
  }

  async embed(model: string, input: string | string[], options?: LlmEmbedOptions): Promise<number[][]> {
    if (!this.embedClient) {
      throw new Error("AI router has no embedding-capable fallback client configured");
    }

    return this.embedClient.embed(model, input, options);
  }

  async getStatusSnapshot(): Promise<AiRouterStatusSnapshot> {
    const state = await this.quotaManager.getState();
    const preferred = (await this.resolvePreferredChatProvider()) ?? "auto";
    const enabledProviders = AI_ROUTER_PROVIDER_NAMES.map((provider) => ({
      provider,
      enabled: this.envState[provider].enabled,
      enabledByFlag: this.envState[provider].enabledByFlag,
      configured: this.envState[provider].configured,
      missing: this.envState[provider].missing
    }));
    const cooldowns = collectCooldowns(state);
    const geminiProvider = state.providers.gemini;
    const geminiFlash = geminiProvider?.models[this.env.GEMINI_FLASH_MODEL];
    const geminiPro = geminiProvider?.models[this.env.GEMINI_PRO_MODEL];

    return {
      enabledProviders,
      activeOrder: this.describeActiveOrder(preferred),
      preferredChatProvider: preferred,
      cooldowns,
      geminiUsage: {
        flash: {
          used: geminiFlash?.requestsToday ?? 0,
          limit: geminiFlash?.dailyLimit ?? this.env.AI_ROUTER_GEMINI_FLASH_DAILY_LIMIT
        },
        pro: {
          used: geminiPro?.requestsToday ?? 0,
          limit: geminiPro?.dailyLimit ?? this.env.AI_ROUTER_GEMINI_PRO_DAILY_LIMIT
        }
      },
      embeddings: {
        provider: "openai",
        model: OPENAI_EMBEDDING_MODEL,
        dimensions: resolveOpenAIEmbeddingDimensions({ OPENAI_EMBED_DIMENSIONS: this.env.OPENAI_EMBED_DIMENSIONS }),
        available: Boolean(this.embedClient),
        missing: this.embedClient ? [] : ["OPENAI_API_KEY"]
      },
      recentRoutes: state.recentRoutes,
      fallbackCounts: Object.fromEntries(
        getEnabledAiRouterProviders(this.env).map((provider) => [provider, state.providers[provider]?.fallbackCount ?? 0])
      )
    };
  }

  async getState(): Promise<AiRouterState> {
    return this.quotaManager.getState();
  }

  private async sendWithRetry(provider: ChatProvider, options: LlmChatOptions) {
    const request = toProviderRequest(options);
    let retryError: ProviderErrorInfo | undefined;

    try {
      return await provider.send(request);
    } catch (error) {
      retryError = provider.classifyError(error);
      if (!retryError.retryOnce) {
        throw error;
      }

      this.logger.warn(
        {
          requestId: options.metadata?.requestId,
          provider: provider.name,
          model: options.model,
          errorClass: retryError.class,
          message: retryError.message
        },
        "ai router retrying provider once"
      );
    }

    return provider.send(request);
  }

  private async resolvePreferredChatProvider(): Promise<PreferredChatProviderValue | undefined> {
    if (!this.preferredChatProviderGetter) {
      return undefined;
    }

    try {
      const value = await Promise.resolve(this.preferredChatProviderGetter());
      if (!value || value === "auto") {
        return "auto";
      }

      if (isPreferredChatProviderValue(value)) {
        return value;
      }

      this.logger.warn({ value }, "ai router: unknown preferredChatProvider value, falling back to auto");
      return "auto";
    } catch (error) {
      this.logger.warn({ message: asErrorMessage(error) }, "ai router: failed to resolve preferredChatProvider");
      return "auto";
    }
  }

  private buildAttemptChain(options: LlmChatOptions, preferred?: PreferredChatProviderValue): RouterAttempt[] {
    const attempts: RouterAttempt[] = [];
    const isComplex = this.shouldUseGeminiPro(options);

    attempts.push({
      providerName: "deepseek",
      model: this.env.DEEPSEEK_MODEL,
      reason: "default_chat_primary"
    });

    if (!isComplex) {
      attempts.push({
        providerName: "openai",
        model: this.env.OPENAI_MODEL,
        reason: "deepseek_unavailable_simple_request"
      });
    }

    if (isComplex) {
      attempts.push({
        providerName: "gemini",
        model: this.env.GEMINI_PRO_MODEL,
        reason: "deepseek_unavailable_complex_request"
      });
    }

    attempts.push({
      providerName: "gemini",
      model: this.env.GEMINI_FLASH_MODEL,
      reason: isComplex ? "gemini_pro_unavailable_or_failed" : "deepseek_unavailable"
    });
    attempts.push({
      providerName: "cloudflare",
      model: this.env.CF_MODEL,
      reason: "gemini_unavailable"
    });

    for (const model of uniqueStrings([
      this.env.GITHUB_MODEL_PRIMARY,
      this.env.GITHUB_MODEL_SECONDARY,
      this.env.GITHUB_MODEL_TERTIARY
    ])) {
      attempts.push({
        providerName: "github",
        model,
        reason: "free_tiers_exhausted"
      });
    }

    if (isComplex) {
      attempts.push({
        providerName: "openai",
        model: this.env.OPENAI_MODEL,
        reason: "final_paid_fallback"
      });
    }

    if (preferred && preferred !== "auto") {
      return reorderAttemptsForPreferredProvider(attempts, preferred);
    }

    return attempts;
  }

  private shouldUseGeminiPro(options: LlmChatOptions) {
    if (!this.env.AI_ROUTER_USE_GEMINI_PRO_FOR_COMPLEX) {
      return false;
    }

    if (options.metadata?.complexityHint === "complex") {
      return true;
    }

    if (options.metadata?.complexityHint === "simple") {
      return false;
    }

    const userText = normalizeWhitespace(
      options.messages
        .filter((message) => message.role === "user")
        .map((message) => message.content)
        .join("\n")
    );
    const combinedText = normalizeWhitespace(options.messages.map((message) => message.content).join("\n"));
    const lower = combinedText.toLowerCase();

    if (userText.length >= 900 || combinedText.length >= 1600) {
      return true;
    }

    if (/```|typescript|javascript|python|sql|regex|refactor|algorithm|diff|stack trace|bug|trace/i.test(combinedText)) {
      return true;
    }

    if (/сравни|compare|analysis|проанализируй|evaluate|tradeoff|pros and cons|аргументируй|контекст|conditions|constraints/i.test(lower)) {
      return true;
    }

    if ((userText.match(/\b(если|when|unless|except|иначе|услови|вариант|option|compare|versus|vs)\b/gi)?.length ?? 0) >= 3) {
      return true;
    }

    return false;
  }

  private describeActiveOrder(preferred?: PreferredChatProviderValue) {
    const baseOrder = [
      `deepseek:${this.env.DEEPSEEK_MODEL}`,
      `openai:${this.env.OPENAI_MODEL} (simple fallback)`,
      `gemini:${this.env.GEMINI_PRO_MODEL} (complex only)`,
      `gemini:${this.env.GEMINI_FLASH_MODEL}`,
      `cloudflare:${this.env.CF_MODEL}`,
      `github:${this.env.GITHUB_MODEL_PRIMARY}`,
      `github:${this.env.GITHUB_MODEL_SECONDARY}`,
      `github:${this.env.GITHUB_MODEL_TERTIARY}`,
      `openai:${this.env.OPENAI_MODEL}`
    ];
    const order = uniqueStrings(baseOrder);

    if (!preferred || preferred === "auto") {
      return order;
    }

    const promoted = order.filter((entry) => entry.startsWith(`${preferred}:`));
    if (!promoted.length) {
      return order;
    }

    const others = order.filter((entry) => !entry.startsWith(`${preferred}:`));
    return [...promoted, ...others];
  }

  private logTransition(input: {
    requestId: string;
    userKey: string;
    provider: string;
    model: string;
    fallbackDepth: number;
    reason: string;
  }) {
    if (!this.env.AI_ROUTER_LOG_VERBOSE) {
      return;
    }

    this.logger.info(
      {
        requestId: input.requestId,
        userKey: input.userKey,
        provider: input.provider,
        model: input.model,
        fallbackDepth: input.fallbackDepth,
        fallbackReason: input.reason
      },
      "ai router skipped provider"
    );
  }
}

function buildProviders(env: AppEnv, logger: AppLogger): Partial<Record<AiRouterProviderName, ChatProvider>> {
  return {
    deepseek: env.DEEPSEEK_API_KEY
      ? new DeepSeekProvider(env.DEEPSEEK_API_KEY, env.DEEPSEEK_BASE_URL, logger, {
          timeoutMs: env.OLLAMA_TIMEOUT_MS,
          logTraffic: env.AI_ROUTER_LOG_VERBOSE,
          logMaxChars: env.OLLAMA_LOG_MAX_CHARS
        })
      : undefined,
    gemini: env.GOOGLE_API_KEY
      ? new GeminiProvider(env.GOOGLE_API_KEY, logger, {
          timeoutMs: env.OLLAMA_TIMEOUT_MS,
          logTraffic: env.AI_ROUTER_LOG_VERBOSE,
          logMaxChars: env.OLLAMA_LOG_MAX_CHARS
        })
      : undefined,
    cloudflare: env.CF_ACCOUNT_ID && env.CF_API_TOKEN
      ? new CloudflareProvider(env.CF_ACCOUNT_ID, env.CF_API_TOKEN, logger, {
          timeoutMs: env.OLLAMA_TIMEOUT_MS,
          logTraffic: env.AI_ROUTER_LOG_VERBOSE,
          logMaxChars: env.OLLAMA_LOG_MAX_CHARS
        })
      : undefined,
    github: env.GITHUB_TOKEN
      ? new GitHubModelsProvider(env.GITHUB_TOKEN, env.GITHUB_MODELS_URL, logger, {
          timeoutMs: env.OLLAMA_TIMEOUT_MS,
          logTraffic: env.AI_ROUTER_LOG_VERBOSE,
          logMaxChars: env.OLLAMA_LOG_MAX_CHARS
        })
      : undefined,
    openai: env.OPENAI_API_KEY
      ? new OpenAiFallbackProvider(env.OPENAI_API_KEY, logger, {
          timeoutMs: env.OLLAMA_TIMEOUT_MS,
          logTraffic: env.AI_ROUTER_LOG_VERBOSE,
          logMaxChars: env.OLLAMA_LOG_MAX_CHARS
        })
      : undefined
  };
}

function toProviderRequest(options: LlmChatOptions): ChatProviderRequest {
  return {
    model: options.model,
    messages: options.messages,
    tools: options.tools,
    format: options.format,
    temperature: options.temperature,
    topP: options.topP,
    maxTokens: options.maxTokens,
    metadata: options.metadata
  };
}

function normalizeUsage(rawUsage: Record<string, unknown> | undefined, latencyMs: number) {
  if (!rawUsage) {
    return {
      totalDurationMs: latencyMs
    };
  }

  const promptTokens = typeof rawUsage.prompt_tokens === "number" ? rawUsage.prompt_tokens : undefined;
  const completionTokens = typeof rawUsage.completion_tokens === "number" ? rawUsage.completion_tokens : undefined;
  const totalTokens = typeof rawUsage.total_tokens === "number"
    ? rawUsage.total_tokens
    : promptTokens !== undefined && completionTokens !== undefined
      ? promptTokens + completionTokens
      : undefined;
  const cachedTokens = typeof rawUsage.prompt_tokens_details === "object" && rawUsage.prompt_tokens_details && typeof (rawUsage.prompt_tokens_details as { cached_tokens?: unknown }).cached_tokens === "number"
    ? (rawUsage.prompt_tokens_details as { cached_tokens: number }).cached_tokens
    : undefined;

  return {
    promptTokens,
    completionTokens,
    totalTokens,
    totalDurationMs: latencyMs,
    cachedTokens
  };
}

function collectCooldowns(state: AiRouterState) {
  const cooldowns: Array<{ provider: string; model: string; cooldownUntil: string }> = [];

  for (const [provider, providerState] of Object.entries(state.providers)) {
    for (const [model, modelState] of Object.entries(providerState.models)) {
      if (modelState.cooldownUntil) {
        cooldowns.push({
          provider,
          model,
          cooldownUntil: modelState.cooldownUntil
        });
      }
    }
  }

  return cooldowns.sort((left, right) => left.cooldownUntil.localeCompare(right.cooldownUntil));
}

function reorderAttemptsForPreferredProvider(attempts: RouterAttempt[], preferred: AiRouterProviderName): RouterAttempt[] {
  const promoted = attempts.filter((attempt) => attempt.providerName === preferred);
  if (!promoted.length) {
    return attempts;
  }

  const others = attempts.filter((attempt) => attempt.providerName !== preferred);
  return [
    ...promoted.map((attempt, index) => ({
      ...attempt,
      reason: index === 0 ? `panel_preferred:${preferred}` : attempt.reason
    })),
    ...others
  ];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

export function isAiRouterClient(value: unknown): value is AiRouterClient {
  return value instanceof AiRouterClient;
}
