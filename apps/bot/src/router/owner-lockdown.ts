import {
  loadOwnerLockdownState,
  persistOwnerLockdownState,
  type OwnerLockdownState
} from "@hori/shared";

import type { BotRuntime } from "../bootstrap";

const LOCKDOWN_CACHE_TTL_MS = 1500;

let cachedState: (OwnerLockdownState & { expiresAtMs: number }) | null = null;

export function isBotOwner(runtime: BotRuntime, userId: string) {
  return runtime.env.DISCORD_OWNER_IDS.includes(userId);
}

export async function getOwnerLockdownState(runtime: BotRuntime, force = false): Promise<OwnerLockdownState> {
  if (!force && cachedState && cachedState.expiresAtMs > Date.now()) {
    return cachedState;
  }

  const state = await loadOwnerLockdownState(runtime.prisma, runtime.logger);
  cachedState = { ...state, expiresAtMs: Date.now() + LOCKDOWN_CACHE_TTL_MS };
  return state;
}

export async function setOwnerLockdownState(
  runtime: BotRuntime,
  enabled: boolean,
  updatedBy: string
): Promise<OwnerLockdownState> {
  await persistOwnerLockdownState(runtime.prisma, enabled, updatedBy);

  const state: OwnerLockdownState = {
    enabled,
    updatedBy,
    updatedAt: new Date()
  };
  cachedState = { ...state, expiresAtMs: Date.now() + LOCKDOWN_CACHE_TTL_MS };

  return state;
}

export async function shouldIgnoreForOwnerLockdown(runtime: BotRuntime, userId: string) {
  if (isBotOwner(runtime, userId)) {
    return false;
  }

  if (!runtime.env.DISCORD_OWNER_IDS.length) {
    return false;
  }

  const state = await getOwnerLockdownState(runtime);
  return state.enabled;
}
