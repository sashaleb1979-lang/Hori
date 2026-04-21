import type { ProviderErrorClass } from "./provider-error";

export const AI_ROUTER_RECENT_ROUTE_LIMIT = 20;

export interface AiRouterModelState {
  requestsToday: number;
  windowKey?: string;
  dailyLimit?: number;
  cooldownUntil?: string;
  recentFailureCount: number;
  reservations?: Record<string, string>;
  lastSuccessfulRequestAt?: string;
  lastRateLimitAt?: string;
  lastErrorClass?: ProviderErrorClass;
}

export interface AiRouterProviderState {
  fallbackCount: number;
  lastSuccessfulRequestAt?: string;
  lastRateLimitAt?: string;
  lastErrorClass?: ProviderErrorClass;
  models: Record<string, AiRouterModelState>;
}

export interface AiRouterRecentRoute {
  requestId: string;
  provider: string;
  model: string;
  timestamp: string;
  fallbackDepth: number;
  routedFrom: string[];
  success: boolean;
  reason?: string;
  errorClass?: ProviderErrorClass;
}

export interface AiRouterState {
  providers: Record<string, AiRouterProviderState>;
  recentRoutes: AiRouterRecentRoute[];
  updatedAt: string;
}

export interface AiRouterStateStore {
  getState(): Promise<AiRouterState>;
  setState(state: AiRouterState): Promise<void>;
  updateState(updater: (current: AiRouterState) => AiRouterState | Promise<AiRouterState>): Promise<AiRouterState>;
}

export function createEmptyAiRouterState(now = new Date()): AiRouterState {
  return {
    providers: {},
    recentRoutes: [],
    updatedAt: now.toISOString()
  };
}

export function getOrCreateProviderState(state: AiRouterState, provider: string): AiRouterProviderState {
  const existing = state.providers[provider];
  if (existing) {
    return existing;
  }

  const created: AiRouterProviderState = {
    fallbackCount: 0,
    models: {}
  };
  state.providers[provider] = created;
  return created;
}

export function getOrCreateModelState(providerState: AiRouterProviderState, model: string): AiRouterModelState {
  const existing = providerState.models[model];
  if (existing) {
    return existing;
  }

  const created: AiRouterModelState = {
    requestsToday: 0,
    recentFailureCount: 0,
    reservations: {}
  };
  providerState.models[model] = created;
  return created;
}

export class InMemoryAiRouterStateStore implements AiRouterStateStore {
  private state: AiRouterState;

  constructor(initialState: AiRouterState = createEmptyAiRouterState()) {
    this.state = initialState;
  }

  async getState(): Promise<AiRouterState> {
    return structuredClone(this.state);
  }

  async setState(state: AiRouterState): Promise<void> {
    this.state = structuredClone(state);
  }

  async updateState(updater: (current: AiRouterState) => AiRouterState | Promise<AiRouterState>): Promise<AiRouterState> {
    const next = await updater(structuredClone(this.state));
    this.state = structuredClone(next);
    return structuredClone(this.state);
  }
}