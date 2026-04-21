import {
  AI_ROUTER_RECENT_ROUTE_LIMIT,
  createEmptyAiRouterState,
  getOrCreateModelState,
  getOrCreateProviderState,
  type AiRouterRecentRoute,
  type AiRouterState,
  type AiRouterStateStore
} from "./ai-router-state";
import type { ProviderErrorClass } from "./provider-error";

export const GEMINI_RESET_TIMEZONE = "America/Los_Angeles";
export const UTC_RESET_TIMEZONE = "UTC";

const DEFAULT_GEMINI_COOLDOWN_MS = 15 * 60 * 1000;
const DEFAULT_TRANSIENT_COOLDOWN_MS = 60 * 1000;
const MAX_TRANSIENT_COOLDOWN_MS = 15 * 60 * 1000;

export interface AiRouterQuotaConfig {
  geminiFlashModel: string;
  geminiProModel: string;
  geminiFlashDailyLimit: number;
  geminiProDailyLimit: number;
  cloudflareCooldownMs: number;
  githubCooldownMs: number;
  openaiCooldownMs: number;
  geminiCooldownMs?: number;
  transientCooldownMs?: number;
}

export interface AiRouterAvailability {
  allowed: boolean;
  reason?: "cooldown" | "daily_limit_reached";
  requestsToday: number;
  dailyLimit?: number;
  remainingToday?: number;
  cooldownUntil?: string;
  resetAt?: string;
  recentFailureCount: number;
}

export interface AiRouterFailureRecord {
  provider: string;
  model: string;
  classification: ProviderErrorClass;
  requestId: string;
  routedFrom: string[];
  fallbackDepth: number;
  reason?: string;
  retryAfterMs?: number;
  now?: Date;
}

export interface AiRouterSuccessRecord {
  provider: string;
  model: string;
  requestId: string;
  routedFrom: string[];
  fallbackDepth: number;
  reason?: string;
  now?: Date;
}

export class AiRouterQuotaManager {
  constructor(
    private readonly store: AiRouterStateStore,
    private readonly config: AiRouterQuotaConfig
  ) {}

  async canUse(provider: string, model: string, now = new Date()): Promise<AiRouterAvailability> {
    let result: AiRouterAvailability = {
      allowed: true,
      requestsToday: 0,
      recentFailureCount: 0
    };

    await this.store.updateState((state) => {
      const normalized = this.normalizeState(state, now);
      const policy = this.getPolicy(provider, model, now);
      const providerState = getOrCreateProviderState(normalized, provider);
      const modelState = getOrCreateModelState(providerState, model);

      this.applyWindow(modelState, policy, now);
      const cooldownUntil = modelState.cooldownUntil ? new Date(modelState.cooldownUntil) : null;
      const resetAt = policy.resetTimeZone ? getNextResetAt(now, policy.resetTimeZone) : undefined;

      if (policy.dailyLimit !== undefined && modelState.requestsToday >= policy.dailyLimit) {
        if (!modelState.cooldownUntil || new Date(modelState.cooldownUntil) < now) {
          modelState.cooldownUntil = resetAt?.toISOString();
        }

        result = {
          allowed: false,
          reason: "daily_limit_reached",
          requestsToday: modelState.requestsToday,
          dailyLimit: policy.dailyLimit,
          remainingToday: 0,
          cooldownUntil: modelState.cooldownUntil,
          resetAt: resetAt?.toISOString(),
          recentFailureCount: modelState.recentFailureCount
        };
        normalized.updatedAt = now.toISOString();
        return normalized;
      }

      if (cooldownUntil && cooldownUntil > now) {
        result = {
          allowed: false,
          reason: "cooldown",
          requestsToday: modelState.requestsToday,
          dailyLimit: policy.dailyLimit,
          remainingToday: policy.dailyLimit !== undefined ? Math.max(0, policy.dailyLimit - modelState.requestsToday) : undefined,
          cooldownUntil: modelState.cooldownUntil,
          resetAt: resetAt?.toISOString(),
          recentFailureCount: modelState.recentFailureCount
        };
        normalized.updatedAt = now.toISOString();
        return normalized;
      }

      result = {
        allowed: true,
        requestsToday: modelState.requestsToday,
        dailyLimit: policy.dailyLimit,
        remainingToday: policy.dailyLimit !== undefined ? Math.max(0, policy.dailyLimit - modelState.requestsToday) : undefined,
        cooldownUntil: modelState.cooldownUntil,
        resetAt: resetAt?.toISOString(),
        recentFailureCount: modelState.recentFailureCount
      };
      normalized.updatedAt = now.toISOString();
      return normalized;
    });

    return result;
  }

  async recordSuccess(record: AiRouterSuccessRecord): Promise<AiRouterState> {
    const now = record.now ?? new Date();

    return this.store.updateState((state) => {
      const normalized = this.normalizeState(state, now);
      const policy = this.getPolicy(record.provider, record.model, now);
      const providerState = getOrCreateProviderState(normalized, record.provider);
      const modelState = getOrCreateModelState(providerState, record.model);

      this.applyWindow(modelState, policy, now);

      modelState.requestsToday += 1;
      modelState.dailyLimit = policy.dailyLimit;
      modelState.cooldownUntil = undefined;
      modelState.recentFailureCount = 0;
      modelState.lastErrorClass = undefined;
      modelState.lastSuccessfulRequestAt = now.toISOString();
      providerState.lastSuccessfulRequestAt = now.toISOString();

      if (record.fallbackDepth > 0) {
        providerState.fallbackCount += 1;
      }

      pushRecentRoute(normalized, {
        requestId: record.requestId,
        provider: record.provider,
        model: record.model,
        timestamp: now.toISOString(),
        fallbackDepth: record.fallbackDepth,
        routedFrom: record.routedFrom,
        success: true,
        reason: record.reason
      });

      normalized.updatedAt = now.toISOString();
      return normalized;
    });
  }

  async recordFailure(record: AiRouterFailureRecord): Promise<AiRouterState> {
    const now = record.now ?? new Date();

    return this.store.updateState((state) => {
      const normalized = this.normalizeState(state, now);
      const policy = this.getPolicy(record.provider, record.model, now);
      const providerState = getOrCreateProviderState(normalized, record.provider);
      const modelState = getOrCreateModelState(providerState, record.model);

      this.applyWindow(modelState, policy, now);

      modelState.recentFailureCount += 1;
      modelState.lastErrorClass = record.classification;
      providerState.lastErrorClass = record.classification;

      if (record.classification === "rate_limited" || record.classification === "quota_exhausted") {
        modelState.lastRateLimitAt = now.toISOString();
        providerState.lastRateLimitAt = now.toISOString();
      }

      const cooldownUntil = this.getCooldownUntil({
        policy,
        modelState,
        classification: record.classification,
        retryAfterMs: record.retryAfterMs,
        now
      });
      if (cooldownUntil) {
        modelState.cooldownUntil = cooldownUntil.toISOString();
      }

      pushRecentRoute(normalized, {
        requestId: record.requestId,
        provider: record.provider,
        model: record.model,
        timestamp: now.toISOString(),
        fallbackDepth: record.fallbackDepth,
        routedFrom: record.routedFrom,
        success: false,
        reason: record.reason,
        errorClass: record.classification
      });

      normalized.updatedAt = now.toISOString();
      return normalized;
    });
  }

  async getState(now = new Date()): Promise<AiRouterState> {
    return this.store.updateState((state) => this.normalizeState(state, now));
  }

  private normalizeState(state: AiRouterState, now: Date): AiRouterState {
    const next = state.providers ? state : createEmptyAiRouterState(now);

    for (const [provider, providerState] of Object.entries(next.providers)) {
      for (const [model, modelState] of Object.entries(providerState.models)) {
        this.applyWindow(modelState, this.getPolicy(provider, model, now), now);

        if (modelState.cooldownUntil && new Date(modelState.cooldownUntil) <= now) {
          modelState.cooldownUntil = undefined;
        }
      }
    }

    next.recentRoutes = next.recentRoutes.slice(-AI_ROUTER_RECENT_ROUTE_LIMIT);
    next.updatedAt = now.toISOString();
    return next;
  }

  private applyWindow(modelState: ReturnType<typeof getOrCreateModelState>, policy: ProviderQuotaPolicy, now: Date) {
    const windowKey = formatWindowKey(now, policy.resetTimeZone);
    if (modelState.windowKey && modelState.windowKey !== windowKey) {
      modelState.requestsToday = 0;
      modelState.recentFailureCount = 0;
      modelState.cooldownUntil = undefined;
      modelState.lastErrorClass = undefined;
    }

    modelState.windowKey = windowKey;
    if (policy.dailyLimit !== undefined) {
      modelState.dailyLimit = policy.dailyLimit;
    }
  }

  private getPolicy(provider: string, model: string, now: Date): ProviderQuotaPolicy {
    if (provider === "gemini") {
      const isPro = model === this.config.geminiProModel;
      return {
        provider,
        model,
        dailyLimit: isPro ? this.config.geminiProDailyLimit : this.config.geminiFlashDailyLimit,
        resetTimeZone: GEMINI_RESET_TIMEZONE,
        baseCooldownMs: this.config.geminiCooldownMs ?? DEFAULT_GEMINI_COOLDOWN_MS,
        transientCooldownMs: this.config.transientCooldownMs ?? DEFAULT_TRANSIENT_COOLDOWN_MS,
        now
      };
    }

    if (provider === "cloudflare") {
      return {
        provider,
        model,
        resetTimeZone: UTC_RESET_TIMEZONE,
        baseCooldownMs: this.config.cloudflareCooldownMs,
        transientCooldownMs: this.config.transientCooldownMs ?? DEFAULT_TRANSIENT_COOLDOWN_MS,
        now
      };
    }

    if (provider === "github") {
      return {
        provider,
        model,
        resetTimeZone: UTC_RESET_TIMEZONE,
        baseCooldownMs: this.config.githubCooldownMs,
        transientCooldownMs: this.config.transientCooldownMs ?? DEFAULT_TRANSIENT_COOLDOWN_MS,
        now
      };
    }

    return {
      provider,
      model,
      resetTimeZone: UTC_RESET_TIMEZONE,
      baseCooldownMs: this.config.openaiCooldownMs,
      transientCooldownMs: this.config.transientCooldownMs ?? DEFAULT_TRANSIENT_COOLDOWN_MS,
      now
    };
  }

  private getCooldownUntil(input: {
    policy: ProviderQuotaPolicy;
    modelState: ReturnType<typeof getOrCreateModelState>;
    classification: ProviderErrorClass;
    retryAfterMs?: number;
    now: Date;
  }) {
    if (input.classification === "quota_exhausted") {
      if (input.policy.dailyLimit !== undefined) {
        return getNextResetAt(input.now, input.policy.resetTimeZone);
      }

      return new Date(input.now.getTime() + input.policy.baseCooldownMs);
    }

    if (input.classification === "rate_limited") {
      return new Date(input.now.getTime() + Math.max(input.retryAfterMs ?? 0, input.policy.baseCooldownMs));
    }

    if (input.classification === "invalid_auth") {
      return new Date(input.now.getTime() + input.policy.baseCooldownMs);
    }

    if (input.classification === "network_error" || input.classification === "provider_unavailable") {
      const cooldownMs = Math.min(
        input.policy.transientCooldownMs * Math.pow(2, Math.max(0, input.modelState.recentFailureCount - 1)),
        MAX_TRANSIENT_COOLDOWN_MS
      );
      return new Date(input.now.getTime() + cooldownMs);
    }

    return undefined;
  }
}

interface ProviderQuotaPolicy {
  provider: string;
  model: string;
  dailyLimit?: number;
  resetTimeZone: string;
  baseCooldownMs: number;
  transientCooldownMs: number;
  now: Date;
}

function pushRecentRoute(state: AiRouterState, route: AiRouterRecentRoute) {
  state.recentRoutes = [...state.recentRoutes, route].slice(-AI_ROUTER_RECENT_ROUTE_LIMIT);
}

function formatWindowKey(date: Date, timeZone: string) {
  const parts = getTimeZoneParts(date, timeZone);
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function getNextResetAt(date: Date, timeZone: string) {
  const parts = getTimeZoneParts(date, timeZone);
  const nextDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);

  return zonedPartsToUtc(
    {
      year: nextDate.getUTCFullYear(),
      month: nextDate.getUTCMonth() + 1,
      day: nextDate.getUTCDate(),
      hour: 0,
      minute: 0,
      second: 0
    },
    timeZone
  );
}

function getTimeZoneParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  const lookup = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  ) as Record<string, number>;

  return {
    year: lookup.year,
    month: lookup.month,
    day: lookup.day,
    hour: lookup.hour,
    minute: lookup.minute,
    second: lookup.second
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = getTimeZoneParts(date, timeZone);
  const utcGuess = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return utcGuess - date.getTime();
}

function zonedPartsToUtc(
  parts: { year: number; month: number; day: number; hour: number; minute: number; second: number },
  timeZone: string
) {
  const utcGuess = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const offset = getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  return new Date(utcGuess - offset);
}