/**
 * Emotion State — типы и перечисления для эмоциональной системы.
 *
 * Скопировано из AICO emotion_engine.py (EmotionLabel, AppraisalResult, EmotionalState)
 * и адаптировано под Hori: добавлены 4 специальных лейбла (SUPER_IRONIC, SUPER_AGGRESSIVE,
 * COLD_IGNORE, OVERPLAYFUL) для спецрежимов.
 *
 * Научная база:
 * - Russell (1980) Circumplex Model of Affect (valence × arousal)
 * - Scherer (2009) Component Process Model (CPM)
 * - Kuppens et al. (2010) Emotional inertia
 */

// ============================================================================
// EMOTION LABELS
// ============================================================================

/** Каноничные лейблы эмоций (из AICO + 4 Hori-специфичных) */
export enum EmotionLabel {
  // --- Базовые (из AICO) ---
  NEUTRAL = "neutral",
  CALM = "calm",
  CURIOUS = "curious",
  PLAYFUL = "playful",
  WARM_CONCERN = "warm_concern",
  PROTECTIVE = "protective",
  FOCUSED = "focused",
  ENCOURAGING = "encouraging",
  REASSURING = "reassuring",
  APOLOGETIC = "apologetic",
  TIRED = "tired",
  REFLECTIVE = "reflective",

  // --- Hori-специфичные спецрежимы ---
  SUPER_IRONIC = "super_ironic",
  SUPER_AGGRESSIVE = "super_aggressive",
  COLD_IGNORE = "cold_ignore",
  OVERPLAYFUL = "overplayful",
}

// ============================================================================
// APPRAISAL (CPM Stage 1-4)
// ============================================================================

/** 4-stage CPM appraisal results */
export interface AppraisalResult {
  /** 0.0–1.0: насколько это важно */
  relevance: number;
  /** "supportive_opportunity" | "neutral" | "challenging" */
  goalImpact: string;
  /** "high_capability" | "moderate" | "low" */
  copingCapability: string;
  /** "empathetic_response" | "neutral_response" | "warm_engagement" | "crisis_protocol" | "calm_resolution" */
  socialAppropriateness: string;

  userEmotionDetected?: string;
  crisisIndicators?: boolean;
}

// ============================================================================
// EMOTIONAL STATE
// ============================================================================

/**
 * CPM 5-component emotional state — внутреннее представление.
 * Проецируется в compact dict для LLM prompt conditioning.
 */
export interface EmotionalState {
  timestamp: number; // Date.now()

  // CPM Components
  cognitiveComponent: AppraisalResult;
  physiologicalArousal: number; // 0.0–1.0
  motivationalTendency: "approach" | "withdraw" | "engage" | "neutral";
  motorExpression: "open" | "tense" | "relaxed" | "neutral";
  subjectiveFeeling: EmotionLabel;

  // Compact projection (для фронтенда / LLM)
  moodValence: number;  // -1.0 … 1.0
  moodArousal: number;  // 0.0 … 1.0
  intensity: number;    // 0.0 … 1.0

  // Style parameters (кондиционирование LLM)
  warmth: number;       // 0.0 … 1.0
  energy: number;       // 0.0 … 1.0
  directness: number;   // 0.0 … 1.0
  formality: number;    // 0.0 … 1.0
  engagement: number;   // 0.0 … 1.0

  // Relationship context
  closeness: number;    // 0.0 … 1.0
  careFocus: number;    // 0.0 … 1.0
}

// ============================================================================
// HELPERS
// ============================================================================

/** Конвертация EmotionalState в compact dict для LLM prompt / логов */
export function toCompactDict(state: EmotionalState) {
  return {
    timestamp: new Date(state.timestamp).toISOString(),
    mood: {
      valence: round2(state.moodValence),
      arousal: round2(state.moodArousal),
    },
    label: {
      primary: state.subjectiveFeeling,
      intensity: round2(state.intensity),
    },
    style: {
      warmth: round2(state.warmth),
      energy: round2(state.energy),
      directness: round2(state.directness),
      formality: round2(state.formality),
      engagement: round2(state.engagement),
    },
    relationship: {
      closeness: round2(state.closeness),
      careFocus: round2(state.careFocus),
    },
  };
}

/** Нейтральное базовое состояние */
export function createNeutralState(): EmotionalState {
  return {
    timestamp: Date.now(),
    cognitiveComponent: {
      relevance: 0.5,
      goalImpact: "neutral",
      copingCapability: "high_capability",
      socialAppropriateness: "neutral_response",
    },
    physiologicalArousal: 0.3,
    motivationalTendency: "neutral",
    motorExpression: "neutral",
    subjectiveFeeling: EmotionLabel.CALM,
    moodValence: 0.0,
    moodArousal: 0.3,
    intensity: 0.3,
    warmth: 0.6,
    energy: 0.4,
    directness: 0.5,
    formality: 0.3,
    engagement: 0.6,
    closeness: 0.5,
    careFocus: 0.7,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
