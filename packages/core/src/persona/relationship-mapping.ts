/**
 * V7 relationship → ACTIVE_CORE mapping.
 *
 * Relationship value: -1..4 (целое).
 * - −1 (или ниже)        → core_annoyed
 * -  0                    → core_base
 * -  1                    → core_warm
 * -  2                    → core_close
 * -  3                    → core_teasing
 * -  4                    → core_sweet
 *
 * core_serious — отдельный путь: выбирается явно для модерации/инструкций,
 * не из value (через флаг moderatorContext).
 *
 * Округление: ниже нуля — всегда вниз. Выше нуля — округление вниз
 * (целочисленный шаг через достижение абсолютного порога 1.0, 2.0, 3.0, 4.0).
 */

import type { CoreId } from "./cores";

export type RelationshipValue = number;

export interface PickCoreContext {
  moderatorContext?: boolean;
}

export function pickCore(value: RelationshipValue, ctx: PickCoreContext = {}): CoreId {
  if (ctx.moderatorContext) return "core_serious";

  if (!Number.isFinite(value)) return "core_base";

  if (value < 0) return "core_annoyed";

  const stage = Math.floor(value);

  switch (stage) {
    case 0:
      return "core_base";
    case 1:
      return "core_warm";
    case 2:
      return "core_close";
    case 3:
      return "core_teasing";
    default:
      return "core_sweet";
  }
}

/**
 * Применить delta к текущему value с правилами округления.
 * Возвращает новое целочисленное значение для записи в БД.
 */
export function applyRelationshipDelta(
  currentValue: number,
  rawDelta: number,
  options: { fractionalProgress?: number } = {}
): { newValue: number; newProgress: number; coreChanged: boolean } {
  const safeCurrent = Number.isFinite(currentValue) ? currentValue : 0;
  const safeDelta = Number.isFinite(rawDelta) ? rawDelta : 0;
  const safeProgress = Number.isFinite(options.fractionalProgress ?? 0) ? options.fractionalProgress ?? 0 : 0;

  const previousCore = pickCore(safeCurrent);

  // Ниже нуля: округление вниз. Каждое отрицательное событие уменьшает на 1 минимум.
  if (safeCurrent < 0 || safeDelta < 0) {
    const newValue = Math.floor(safeCurrent + safeDelta);
    return {
      newValue,
      newProgress: 0,
      coreChanged: pickCore(newValue) !== previousCore
    };
  }

  // Выше нуля: накопление дробного прогресса до целого порога.
  const accumulated = safeProgress + safeDelta;
  const wholeSteps = Math.floor(accumulated);
  const remainder = accumulated - wholeSteps;
  const newValue = Math.max(0, Math.min(4, safeCurrent + wholeSteps));

  return {
    newValue,
    newProgress: remainder,
    coreChanged: pickCore(newValue) !== previousCore
  };
}
