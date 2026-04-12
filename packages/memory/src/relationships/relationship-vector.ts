/**
 * Relationship Vector — merged model
 * Source: AICO personality/models.py RelationshipVector
 *       + existing Hori RelationshipOverlay
 *
 * Adds closeness / trust / familiarity / proactivity signals
 * from AICO on top of Hori's existing per-user tuning knobs.
 */

import type { RelationshipOverlay } from "@hori/shared";

/* ------------------------------------------------------------------ */
/*  AICO-derived numeric signals (0..1 float)                         */
/* ------------------------------------------------------------------ */

export interface RelationshipSignals {
  /** 0 = distant stranger, 1 = very close friend */
  closeness: number;
  /** 0 = no trust, 1 = full trust */
  trustLevel: number;
  /** 0 = first encounter, 1 = long-time regular */
  familiarity: number;
  /** Total interactions tracked */
  interactionCount: number;
  /** How much proactive messaging the user tolerates (0 = never, 1 = welcome) */
  proactivityPreference: number;
  /** Per-topic boundaries: topic name → allowed (true) or banned (false) */
  topicBoundaries: Record<string, boolean>;
}

/* ------------------------------------------------------------------ */
/*  Full relationship vector = overlay + signals                      */
/* ------------------------------------------------------------------ */

export interface RelationshipVector extends RelationshipOverlay, RelationshipSignals {
  userId: string;
  guildId: string;
}

/* ------------------------------------------------------------------ */
/*  Defaults                                                          */
/* ------------------------------------------------------------------ */

export const DEFAULT_SIGNALS: RelationshipSignals = {
  closeness: 0.5,
  trustLevel: 0.5,
  familiarity: 0.5,
  interactionCount: 0,
  proactivityPreference: 0.5,
  topicBoundaries: {},
};

export function createDefaultVector(
  userId: string,
  guildId: string,
  overlay?: RelationshipOverlay | null,
  signals?: Partial<RelationshipSignals>,
): RelationshipVector {
  return {
    userId,
    guildId,
    // Hori overlay defaults
    toneBias: overlay?.toneBias ?? "neutral",
    roastLevel: overlay?.roastLevel ?? 3,
    praiseBias: overlay?.praiseBias ?? 0,
    interruptPriority: overlay?.interruptPriority ?? 0,
    doNotMock: overlay?.doNotMock ?? false,
    doNotInitiate: overlay?.doNotInitiate ?? false,
    protectedTopics: [...(overlay?.protectedTopics ?? [])],
    // AICO signal defaults
    closeness: signals?.closeness ?? DEFAULT_SIGNALS.closeness,
    trustLevel: signals?.trustLevel ?? DEFAULT_SIGNALS.trustLevel,
    familiarity: signals?.familiarity ?? DEFAULT_SIGNALS.familiarity,
    interactionCount: signals?.interactionCount ?? DEFAULT_SIGNALS.interactionCount,
    proactivityPreference: signals?.proactivityPreference ?? DEFAULT_SIGNALS.proactivityPreference,
    topicBoundaries: { ...(signals?.topicBoundaries ?? DEFAULT_SIGNALS.topicBoundaries) },
  };
}

/* ------------------------------------------------------------------ */
/*  Decay / update helpers (from AICO inertia logic)                  */
/* ------------------------------------------------------------------ */

/** Clamp a value to [0, 1] */
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Nudge closeness based on interaction sentiment.
 * Positive interactions pull closer, negative push away.
 * Delta is scaled so it takes ~50 positive interactions to go 0.5 → 0.9.
 */
export function nudgeCloseness(current: number, sentiment: number): number {
  const delta = sentiment * 0.008;
  return clamp01(current + delta);
}

export function nudgeTrustLevel(current: number, sentiment: number): number {
  const delta = sentiment >= 0 ? sentiment * 0.006 : sentiment * 0.01;
  return clamp01(current + delta);
}

/**
 * Increment familiarity — asymptotic approach to 1.0
 * Each interaction adds diminishing returns.
 */
export function incrementFamiliarity(current: number, count: number): number {
  const targetFromCount = 0.5 + clamp01(1 - 1 / (1 + count * 0.02)) * 0.5;
  return clamp01(Math.max(current, targetFromCount));
}
