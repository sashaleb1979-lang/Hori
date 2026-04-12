/**
 * Emotion Engine — инерция, circumplex mapping, стилевые параметры.
 *
 * Скопировано из AICO emotion_engine.py (lines 700-960):
 * - _generate_cpm_emotional_state()  → generateEmotionalState()
 * - _map_valence_arousal_to_label()  → mapValenceArousalToLabel()
 * - Emotional inertia (Kuppens et al. 2010)
 * - Savoring (Bryant & Veroff 2007)
 * - Threat override (LeDoux 1996)
 *
 * Убрано: NATS publish, protobuf, gRPC — всё заменено на чистый return.
 */

import {
  type AppraisalResult,
  type EmotionalState,
  EmotionLabel,
  createNeutralState,
} from "./emotion-state";

import { EMOTION_DEFAULTS, type EmotionConfig } from "@hori/config";

// ============================================================================
// ENGINE STATE
// ============================================================================

export interface EmotionEngineState {
  previousState: EmotionalState | null;
  turnsSinceStateChange: number;
}

export function createEngineState(): EmotionEngineState {
  return { previousState: null, turnsSinceStateChange: 0 };
}

// ============================================================================
// CIRCUMPLEX MAPPING — Russell (1980)
// ============================================================================

/**
 * Map valence × arousal → EmotionLabel.
 * Скопировано 1:1 из AICO _map_valence_arousal_to_label.
 */
export function mapValenceArousalToLabel(
  valence: number,
  arousal: number,
  appraisal: AppraisalResult,
): EmotionLabel {
  // Crisis override
  if (appraisal.crisisIndicators) {
    return EmotionLabel.PROTECTIVE;
  }

  // High arousal (>0.6)
  if (arousal > 0.6) {
    if (valence > 0.5) return EmotionLabel.PLAYFUL;
    if (valence > 0.2) return EmotionLabel.CURIOUS;
    if (valence < -0.3) return EmotionLabel.WARM_CONCERN;
    if (valence < -0.1) return EmotionLabel.FOCUSED;
    return EmotionLabel.ENCOURAGING;
  }

  // Moderate arousal (0.4–0.6)
  if (arousal > 0.4) {
    if (valence > 0.4) return EmotionLabel.CURIOUS;
    if (valence > 0.2) return EmotionLabel.CALM;
    if (valence < -0.2) return EmotionLabel.REASSURING;
    return EmotionLabel.CALM;
  }

  // Low arousal (<0.4)
  if (valence > 0.3) return EmotionLabel.CALM;
  if (valence < -0.3) return EmotionLabel.REFLECTIVE;
  return EmotionLabel.CALM;
}

// ============================================================================
// STYLE MAPPING — feeling → LLM conditioning params
// ============================================================================

interface StyleParams {
  warmth: number;
  energy: number;
  directness: number;
  engagement: number;
}

/**
 * Маппинг EmotionLabel → стилевые параметры для LLM.
 * Скопировано 1:1 из AICO _generate_cpm_emotional_state style block.
 */
export function mapFeelingToStyle(feeling: EmotionLabel): StyleParams {
  if (feeling === EmotionLabel.WARM_CONCERN || feeling === EmotionLabel.PROTECTIVE) {
    return { warmth: 0.85, energy: 0.65, directness: 0.5, engagement: 0.85 };
  }
  if (feeling === EmotionLabel.REASSURING) {
    return { warmth: 0.8, energy: 0.5, directness: 0.6, engagement: 0.75 };
  }
  if (feeling === EmotionLabel.PLAYFUL || feeling === EmotionLabel.CURIOUS) {
    return { warmth: 0.7, energy: 0.7, directness: 0.6, engagement: 0.8 };
  }

  // --- Hori-специфичные спецрежимы ---
  if (feeling === EmotionLabel.SUPER_IRONIC) {
    return { warmth: 0.3, energy: 0.6, directness: 0.9, engagement: 0.7 };
  }
  if (feeling === EmotionLabel.SUPER_AGGRESSIVE) {
    return { warmth: 0.1, energy: 0.9, directness: 1.0, engagement: 0.9 };
  }
  if (feeling === EmotionLabel.COLD_IGNORE) {
    return { warmth: 0.1, energy: 0.2, directness: 0.3, engagement: 0.1 };
  }
  if (feeling === EmotionLabel.OVERPLAYFUL) {
    return { warmth: 0.8, energy: 0.95, directness: 0.4, engagement: 0.95 };
  }

  // Default baseline
  return { warmth: 0.6, energy: 0.45, directness: 0.5, engagement: 0.6 };
}

// ============================================================================
// CORE: generateEmotionalState
// ============================================================================

/**
 * Генерация CPM 5-component emotional state из appraisal + sentiment.
 *
 * Скопировано из AICO _generate_cpm_emotional_state:
 * 1. Target valence/arousal из appraisal + sentiment
 * 2. Regulation (CPM Stage 3)
 * 3. Savoring amplification (Bryant & Veroff 2007)
 * 4. Emotional inertia (Kuppens et al. 2010)
 * 5. Circumplex mapping → label
 * 6. Style mapping → LLM params
 */
export function generateEmotionalState(
  appraisal: AppraisalResult,
  sentimentData: { valence: number; confidence: number },
  engine: EmotionEngineState,
  cfg: EmotionConfig = EMOTION_DEFAULTS,
): EmotionalState {
  const previousFeeling = engine.previousState?.subjectiveFeeling;
  const sentimentValence = sentimentData.valence;
  const confidence = sentimentData.confidence;

  // --- 1. Target valence/arousal from appraisal ---
  let valence: number;
  let arousal: number;
  let motivationalTendency: EmotionalState["motivationalTendency"];

  switch (appraisal.socialAppropriateness) {
    case "crisis_protocol":
      valence = sentimentValence * 0.8;
      arousal = 0.8;
      motivationalTendency = "approach";
      break;
    case "empathetic_response":
      valence = sentimentValence < 0
        ? Math.max(-1.0, sentimentValence * 1.3)
        : Math.min(1.0, sentimentValence * 0.6);
      arousal = appraisal.relevance > 0.65 ? 0.65 : 0.5;
      motivationalTendency = "approach";
      break;
    case "calm_resolution":
      valence = sentimentValence * 0.7;
      arousal = 0.4;
      motivationalTendency = "neutral";
      break;
    case "warm_engagement":
      valence = sentimentValence > 0
        ? Math.min(1.0, sentimentValence * 1.2)
        : sentimentValence;
      arousal = 0.7;
      motivationalTendency = "engage";
      break;
    default:
      valence = sentimentValence;
      arousal = 0.35;
      motivationalTendency = "neutral";
  }

  // --- 2. Regulation (CPM Stage 3 — coping potential) ---
  arousal = arousal * (1.0 - cfg.regulationStrength * 0.3);

  // --- 3. Threat arousal boost ---
  let threatDetected = false;
  if (
    appraisal.goalImpact === "supportive_opportunity" &&
    appraisal.relevance > 0.65 &&
    sentimentValence < -0.3 &&
    confidence > 0.4
  ) {
    arousal *= 1.0 + cfg.threatArousalBoost;
    threatDetected = true;
  }

  // --- 4. Savoring (Bryant & Veroff 2007) ---
  if (
    ["engaging_opportunity", "supportive_opportunity", "resolution_opportunity"].includes(appraisal.goalImpact) &&
    sentimentValence > 0.4 &&
    confidence > 0.35
  ) {
    valence *= 1.15;
    arousal *= 1.20;
  }

  // --- 5. Emotional inertia (Kuppens et al. 2010) ---
  if (cfg.inertia.enabled && engine.previousState) {
    let effectiveInertia = cfg.inertia.weight * (1.0 - cfg.inertia.decayPerTurn * engine.turnsSinceStateChange);
    effectiveInertia = Math.max(0.0, effectiveInertia);

    // Threat override — reduce inertia to 30% (LeDoux 1996)
    if (threatDetected) {
      effectiveInertia *= 0.3;
    }

    const effectiveReactivity = 1.0 - effectiveInertia;

    // Leaky integrator blend
    valence = valence * effectiveReactivity + engine.previousState.moodValence * effectiveInertia;
    arousal = arousal * effectiveReactivity + engine.previousState.moodArousal * effectiveInertia;
  }

  // --- 6. Circumplex mapping ---
  const feeling = mapValenceArousalToLabel(valence, arousal, appraisal);

  // --- 7. Style mapping ---
  const style = mapFeelingToStyle(feeling);

  // --- Build state ---
  const state: EmotionalState = {
    timestamp: Date.now(),
    cognitiveComponent: appraisal,
    physiologicalArousal: arousal,
    motivationalTendency,
    motorExpression: style.engagement > 0.7 ? "open" : "neutral",
    subjectiveFeeling: feeling,
    moodValence: valence,
    moodArousal: arousal,
    intensity: appraisal.relevance,
    warmth: style.warmth,
    energy: style.energy,
    directness: style.directness,
    formality: 0.3,
    engagement: style.engagement,
    closeness: 0.5,
    careFocus: 0.7,
  };

  // Update engine state
  engine.previousState = state;
  if (previousFeeling && previousFeeling !== state.subjectiveFeeling) {
    engine.turnsSinceStateChange = 0;
  } else {
    engine.turnsSinceStateChange += 1;
  }

  return state;
}
