/**
 * Emotion Defaults — конфигурация эмоционального движка.
 *
 * Скопировано 1:1 из AICO config/defaults/emotion.yaml и конвертировано в TS.
 */

export interface EmotionInertiaConfig {
  enabled: boolean;
  /** Влияние предыдущего состояния (0.0–1.0, healthy range: 0.3–0.5) */
  weight: number;
  /** Влияние текущей оценки (0.0–1.0, в сумме с weight ≈ 1.0) */
  reactivity: number;
  /** Затухание влияния предыдущего состояния за каждый ход */
  decayPerTurn: number;
  /** Сохранять поддерживающий тон после стрессовых эпизодов */
  supportiveContextBias: boolean;
}

export interface EmotionConfig {
  /** Чувствительность CPM appraisal (0.0–1.0) */
  appraisalSensitivity: number;
  /** Сила эмоциональной регуляции (0.0–1.0) */
  regulationStrength: number;
  /** Усиление arousal при экзистенциальных угрозах (0.25 = +25%) */
  threatArousalBoost: number;
  /** Конфиг инерции */
  inertia: EmotionInertiaConfig;
  /** Максимум записей в истории состояний */
  maxHistorySize: number;
}

export const EMOTION_DEFAULTS: EmotionConfig = {
  appraisalSensitivity: 0.7,
  regulationStrength: 0.3,
  threatArousalBoost: 0.25,
  inertia: {
    enabled: true,
    weight: 0.4,
    reactivity: 0.6,
    decayPerTurn: 0.1,
    supportiveContextBias: true,
  },
  maxHistorySize: 100,
};
