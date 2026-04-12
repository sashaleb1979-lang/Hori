/**
 * Busy Engine — task scoring & run/enqueue/drop decision
 * Source: AICO agency/arbiter.py score_goal() (lines 351-540)
 *       + OpenClaw queue-policy concepts
 *
 * Strips curiosity/personality_fit/emotion_boost from AICO.
 * Keeps the 4-factor weighted scoring: priority, origin, freshness, persistence.
 * Adds run/enqueue/drop decision from OpenClaw queue model.
 */

import type { TriggerSource, MessageKind } from "@hori/shared";
import type { QueueLane } from "./priority-queue";

/* ------------------------------------------------------------------ */
/*  Priority band (from AICO PriorityBand)                            */
/* ------------------------------------------------------------------ */

export type PriorityBand = "urgent" | "normal" | "background";

function resolveBand(score: number): PriorityBand {
  if (score >= 0.7) return "urgent";
  if (score >= 0.4) return "normal";
  return "background";
}

/* ------------------------------------------------------------------ */
/*  Scoring weights (from AICO arbiter defaults)                      */
/* ------------------------------------------------------------------ */

export interface ScoringWeights {
  priority: number;
  origin: number;
  freshness: number;
  persistence: number;
}

export const DEFAULT_WEIGHTS: Readonly<ScoringWeights> = {
  priority: 0.35,
  origin: 0.30,
  freshness: 0.20,
  persistence: 0.15,
};

/* ------------------------------------------------------------------ */
/*  Task context for scoring                                          */
/* ------------------------------------------------------------------ */

export interface TaskContext {
  triggerSource: TriggerSource;
  messageKind: MessageKind;
  /** How many minutes ago the message was sent */
  ageMinutes: number;
  /** Did this user repeatedly ask? (mention_count) */
  mentionCount: number;
  /** Is the channel currently busy (another reply in progress)? */
  channelBusy: boolean;
  /** Current queue depth across all lanes */
  queueDepth: number;
}

/* ------------------------------------------------------------------ */
/*  Scored result                                                     */
/* ------------------------------------------------------------------ */

export interface ScoredTask {
  score: number;
  band: PriorityBand;
  lane: QueueLane;
  breakdown: Record<string, number>;
}

/* ------------------------------------------------------------------ */
/*  Origin scores (from AICO origin_scores + Hori trigger mapping)    */
/* ------------------------------------------------------------------ */

const ORIGIN_SCORES: Record<TriggerSource, number> = {
  mention: 0.9,
  reply: 0.85,
  slash: 0.8,
  context_action: 0.75,
  name: 0.7,
  auto_interject: 0.3,
};

/* ------------------------------------------------------------------ */
/*  Priority from messageKind (Hori-specific mapping)                 */
/* ------------------------------------------------------------------ */

const MESSAGE_KIND_PRIORITY: Record<MessageKind, number> = {
  direct_mention: 1.0,
  reply_to_bot: 0.9,
  opinion_question: 0.8,
  info_question: 0.8,
  request_for_explanation: 0.75,
  provocation: 0.7,
  meme_bait: 0.5,
  casual_address: 0.5,
  meta_feedback: 0.45,
  smalltalk_hangout: 0.4,
  command_like_request: 0.6,
  repeated_question: 0.35,
  low_signal_noise: 0.2,
};

/* ------------------------------------------------------------------ */
/*  Score a task (from AICO score_goal, simplified)                   */
/* ------------------------------------------------------------------ */

export function scoreTask(
  ctx: TaskContext,
  weights: ScoringWeights = DEFAULT_WEIGHTS,
): ScoredTask {
  const breakdown: Record<string, number> = {};

  // 1. Priority from messageKind (0-1)
  const priorityScore = MESSAGE_KIND_PRIORITY[ctx.messageKind] ?? 0.5;
  breakdown.priority = priorityScore * weights.priority;

  // 2. Origin from triggerSource (0-1)
  const originScore = ORIGIN_SCORES[ctx.triggerSource] ?? 0.5;
  breakdown.origin = originScore * weights.origin;

  // 3. Freshness — decay over 60 min (from AICO: decay over 168h, we compress)
  const freshnessScore = Math.max(0, 1 - ctx.ageMinutes / 60);
  breakdown.freshness = freshnessScore * weights.freshness;

  // 4. Persistence — repeated mentions boost score (from AICO mention_count)
  const persistenceScore = Math.max(0, Math.min(1, (ctx.mentionCount - 1) * 0.3));
  breakdown.persistence = persistenceScore * weights.persistence;

  const score = breakdown.priority + breakdown.origin + breakdown.freshness + breakdown.persistence;
  const band = resolveBand(score);

  // Map to queue lane
  const lane = resolveQueueLane(ctx.triggerSource, band);

  return { score, band, lane, breakdown };
}

/* ------------------------------------------------------------------ */
/*  Lane resolution                                                   */
/* ------------------------------------------------------------------ */

function resolveQueueLane(trigger: TriggerSource, band: PriorityBand): QueueLane {
  if (trigger === "auto_interject") return "auto_interject";
  if (trigger === "mention" || trigger === "slash" || trigger === "context_action") return "mention";
  if (trigger === "reply" || trigger === "name") return "reply";
  if (band === "background") return "background";
  return "reply";
}

/* ------------------------------------------------------------------ */
/*  Run / enqueue / drop decision (from OpenClaw queue-policy)        */
/* ------------------------------------------------------------------ */

export type RunAction = "run_now" | "enqueue" | "drop";

export interface RunDecision {
  action: RunAction;
  reason: string;
  scored: ScoredTask;
}

/**
 * Decide whether to run immediately, enqueue, or drop.
 * Based on AICO arbiter + OpenClaw queue-policy logic.
 */
export function resolveRunAction(ctx: TaskContext, weights?: ScoringWeights): RunDecision {
  const scored = scoreTask(ctx, weights);

  // Urgent + channel free → run now
  if (scored.band === "urgent" && !ctx.channelBusy) {
    return { action: "run_now", reason: "urgent_channel_free", scored };
  }

  // Urgent but busy → enqueue (will preempt when channel frees)
  if (scored.band === "urgent" && ctx.channelBusy) {
    return { action: "enqueue", reason: "urgent_channel_busy", scored };
  }

  // Normal + channel free + small queue → run now
  if (scored.band === "normal" && !ctx.channelBusy && ctx.queueDepth < 3) {
    return { action: "run_now", reason: "normal_channel_free", scored };
  }

  // Normal but congested → enqueue
  if (scored.band === "normal") {
    return { action: "enqueue", reason: "normal_congested", scored };
  }

  // Background + large queue → drop
  if (scored.band === "background" && ctx.queueDepth >= 5) {
    return { action: "drop", reason: "background_queue_full", scored };
  }

  // Background → enqueue
  return { action: "enqueue", reason: "background_default", scored };
}
