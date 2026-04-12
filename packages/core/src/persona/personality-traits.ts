/**
 * Personality Traits — Big Five model
 * Source: AICO personality/models.py PersonalityTraits
 *
 * Hori defaults are hand-tuned to match her character:
 *   - low extraversion  (0.4) — she's not overly chatty
 *   - low agreeableness (0.3) — sarcastic, can be harsh
 *   - medium conscientiousness (0.5) — cares about quality but lazy about effort
 *   - high neuroticism  (0.6) — emotional swings, reacts to provocation
 *   - high openness      (0.7) — open to weird topics, memes, etc.
 */

export interface PersonalityTraits {
  /** 0 = introverted, 1 = extremely extraverted */
  extraversion: number;
  /** 0 = hostile / combative, 1 = extremely accommodating */
  agreeableness: number;
  /** 0 = chaotic, 1 = meticulous */
  conscientiousness: number;
  /** 0 = emotionally stable, 1 = highly reactive */
  neuroticism: number;
  /** 0 = closed-minded, 1 = extremely open */
  openness: number;
}

/** Hori's canonical personality profile */
export const HORI_TRAITS: Readonly<PersonalityTraits> = {
  extraversion: 0.4,
  agreeableness: 0.3,
  conscientiousness: 0.5,
  neuroticism: 0.6,
  openness: 0.7,
};

/** Neutral / generic profile (all 0.5) */
export const NEUTRAL_TRAITS: Readonly<PersonalityTraits> = {
  extraversion: 0.5,
  agreeableness: 0.5,
  conscientiousness: 0.5,
  neuroticism: 0.5,
  openness: 0.5,
};
