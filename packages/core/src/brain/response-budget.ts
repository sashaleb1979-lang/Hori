/**
 * Response Budget — маппинг 3 контуров (A / B / C).
 *
 * Контур A: 0 токенов — emoji, стикер, шаблонная фраза. БЕЗ LLM.
 * Контур B: fast model (~50 токенов) — короткий контекстный ответ.
 * Контур C: smart model (полный pipeline) — глубокий ответ с persona + emotion.
 *
 * quiet_hours из AICO agency.yaml: ночью (22:00–08:00) → контур A.
 */

// ============================================================================
// CONTOUR TYPE
// ============================================================================

export type Contour = "A" | "B" | "C";

export interface ContourDecision {
  contour: Contour;
  reason: string;
}

// ============================================================================
// MESSAGE KIND → CONTOUR MAPPING
// ============================================================================

/** Типы сообщений, уже определённые в Hori messageKinds.ts */
const CONTOUR_C_KINDS = new Set([
  "direct_mention",
  "opinion_question",
  "info_question",
  "provocation",
  "meta_feedback",
]);

const CONTOUR_B_KINDS = new Set([
  "casual_address",
  "smalltalk_hangout",
  "meme_bait",
  "reply_to_bot",
]);

const CONTOUR_A_KINDS = new Set([
  "low_signal_noise",
  "repeated_question",
]);

// ============================================================================
// QUIET HOURS CHECK
// ============================================================================

/**
 * Проверка тихих часов (из AICO agency.yaml).
 * start/end в формате "HH:MM", текущий час.
 */
export function isQuietHours(
  currentHour: number,
  start = 22,
  end = 8,
): boolean {
  if (start > end) {
    // Overnight: 22..23, 0..7
    return currentHour >= start || currentHour < end;
  }
  return currentHour >= start && currentHour < end;
}

// ============================================================================
// RESOLVE CONTOUR
// ============================================================================

/**
 * Определить контур обработки для входящего сообщения.
 *
 * Приоритет:
 * 1. quiet_hours → A (ночью только шаблоны)
 * 2. messageKind → C / B / A
 * 3. fallback → B
 */
export function resolveContour(params: {
  messageKind: string;
  currentHour: number;
  quietHoursEnabled?: boolean;
  isAutoInterject?: boolean;
}): ContourDecision {
  const { messageKind, currentHour, quietHoursEnabled = true, isAutoInterject = false } = params;

  // Quiet hours → контур A (без LLM)
  if (quietHoursEnabled && isQuietHours(currentHour)) {
    return { contour: "A", reason: "quiet_hours" };
  }

  // Auto-interject всегда B (не тратим smart model)
  if (isAutoInterject) {
    return { contour: "B", reason: "auto_interject" };
  }

  // Message kind mapping
  if (CONTOUR_C_KINDS.has(messageKind)) {
    return { contour: "C", reason: `kind:${messageKind}` };
  }
  if (CONTOUR_B_KINDS.has(messageKind)) {
    return { contour: "B", reason: `kind:${messageKind}` };
  }
  if (CONTOUR_A_KINDS.has(messageKind)) {
    return { contour: "A", reason: `kind:${messageKind}` };
  }

  // Fallback → B
  return { contour: "B", reason: "fallback" };
}

// ============================================================================
// CONTOUR A TEMPLATES — шаблонные ответы без LLM
// ============================================================================

const CONTOUR_A_TEMPLATES = [
  "ага",
  "угу",
  "хм",
  "ясно",
  "ок",
  "лол",
  "ну ок",
  "👀",
  "😐",
  "🤔",
  "💀",
  "🗿",
];

/** Выбрать случайный шаблон для контура A */
export function pickContourAResponse(): string {
  return CONTOUR_A_TEMPLATES[Math.floor(Math.random() * CONTOUR_A_TEMPLATES.length)];
}
