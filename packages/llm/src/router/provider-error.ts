export const PROVIDER_ERROR_CLASSES = [
  "quota_exhausted",
  "rate_limited",
  "invalid_auth",
  "network_error",
  "provider_unavailable",
  "malformed_response",
  "unknown"
] as const;

export type ProviderErrorClass = (typeof PROVIDER_ERROR_CLASSES)[number];

export interface ProviderErrorInfo {
  class: ProviderErrorClass;
  message: string;
  status?: number;
  provider?: string;
  retryAfterMs?: number;
  fallbackImmediately: boolean;
  retryOnce: boolean;
  setCooldown: boolean;
  alertInLogs: boolean;
}

export interface ProviderErrorOptions {
  provider: string;
  message: string;
  status?: number;
  bodyText?: string;
  code?: string;
  retryAfterMs?: number;
  cause?: unknown;
}

export class ProviderRequestError extends Error {
  readonly provider: string;
  readonly status?: number;
  readonly bodyText?: string;
  readonly code?: string;
  readonly retryAfterMs?: number;

  constructor(options: ProviderErrorOptions) {
    super(options.message);
    this.name = "ProviderRequestError";
    this.provider = options.provider;
    this.status = options.status;
    this.bodyText = options.bodyText;
    this.code = options.code;
    this.retryAfterMs = options.retryAfterMs;
    if (options.cause !== undefined) {
      Object.defineProperty(this, "cause", {
        value: options.cause,
        enumerable: false,
        configurable: true,
        writable: true
      });
    }
  }
}

export function classifyProviderError(error: unknown): ProviderErrorInfo {
  const normalized = normalizeError(error);
  const message = normalized.message.toLowerCase();
  const body = normalized.bodyText?.toLowerCase() ?? "";
  const haystack = `${message}\n${body}`;

  if (normalized.status === 401 || normalized.status === 403 || /invalid[_\s-]?auth|invalid[_\s-]?api[_\s-]?key|unauthoriz|forbidden|bad credentials|token/i.test(haystack)) {
    return buildInfo("invalid_auth", normalized, { retryOnce: false, setCooldown: true, alertInLogs: true });
  }

  if (normalized.status === 429 && /quota|exhaust|billing|daily limit|resource exhausted|insufficient/i.test(haystack)) {
    return buildInfo("quota_exhausted", normalized, { retryOnce: false, setCooldown: true, alertInLogs: true });
  }

  if (normalized.status === 429) {
    return buildInfo("rate_limited", normalized, { retryOnce: false, setCooldown: true, alertInLogs: false });
  }

  if (
    normalized.status === 408 ||
    (normalized.status !== undefined && normalized.status >= 500 && normalized.status < 600) ||
    /service unavailable|temporar|overload|upstream|unavailable/i.test(haystack)
  ) {
    return buildInfo("provider_unavailable", normalized, { retryOnce: true, setCooldown: true, alertInLogs: true });
  }

  if (/timeout|timed out|network|socket|econnreset|fetch failed|connection|connect error|dns/i.test(haystack)) {
    return buildInfo("network_error", normalized, { retryOnce: true, setCooldown: true, alertInLogs: true });
  }

  if (/malformed|invalid json|empty choices|empty response|missing content|unexpected payload|schema/i.test(haystack)) {
    return buildInfo("malformed_response", normalized, { retryOnce: false, setCooldown: false, alertInLogs: true });
  }

  return buildInfo("unknown", normalized, { retryOnce: false, setCooldown: false, alertInLogs: true });
}

function normalizeError(error: unknown) {
  if (error instanceof ProviderRequestError) {
    return {
      provider: error.provider,
      message: error.message,
      status: error.status,
      bodyText: error.bodyText,
      retryAfterMs: error.retryAfterMs
    };
  }

  if (error instanceof Error) {
    const maybeStatus = typeof (error as { status?: unknown }).status === "number"
      ? (error as { status?: number }).status
      : undefined;
    const maybeProvider = typeof (error as { provider?: unknown }).provider === "string"
      ? (error as { provider?: string }).provider
      : undefined;
    const maybeBodyText = typeof (error as { bodyText?: unknown }).bodyText === "string"
      ? (error as { bodyText?: string }).bodyText
      : undefined;
    const maybeRetryAfter = typeof (error as { retryAfterMs?: unknown }).retryAfterMs === "number"
      ? (error as { retryAfterMs?: number }).retryAfterMs
      : undefined;

    return {
      provider: maybeProvider,
      message: error.message,
      status: maybeStatus,
      bodyText: maybeBodyText,
      retryAfterMs: maybeRetryAfter
    };
  }

  return {
    provider: undefined,
    message: String(error),
    status: undefined,
    bodyText: undefined,
    retryAfterMs: undefined
  };
}

function buildInfo(
  kind: ProviderErrorClass,
  normalized: ReturnType<typeof normalizeError>,
  overrides: Pick<ProviderErrorInfo, "retryOnce" | "setCooldown" | "alertInLogs">>
): ProviderErrorInfo {
  return {
    class: kind,
    message: normalized.message,
    status: normalized.status,
    provider: normalized.provider,
    retryAfterMs: normalized.retryAfterMs,
    fallbackImmediately: true,
    retryOnce: overrides.retryOnce,
    setCooldown: overrides.setCooldown,
    alertInLogs: overrides.alertInLogs
  };
}