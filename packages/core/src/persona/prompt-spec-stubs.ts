/**
 * V7 prompt-spec stubs.
 *
 * Старый prompt-spec.ts удалён. Здесь оставлены только минимальные типы и
 * dummy-значения для совместимости с потребителями, которые ещё не переписаны
 * под новую систему (interaction-router панель, runtime-config-service,
 * orchestrator legacy reads).
 *
 * Эти заглушки будут окончательно удалены в Phase 4 (user prompts) и Phase 9
 * (panel rewrite).
 */

import type { MessageKind } from "@hori/shared";

// Широкий union ключей: новые camelCase + legacy snake_case, которые ещё реально используются.
export const CORE_PROMPT_KEYS = [
  "commonCore",
  "memorySummarizer",
  "aggressionChecker",
  "relationshipEvaluator",
  "common_core_base",
  "relationship_base"
] as const;

export type CorePromptKey = (typeof CORE_PROMPT_KEYS)[number];

export function isCorePromptKey(value: unknown): value is CorePromptKey {
  return typeof value === "string" && (CORE_PROMPT_KEYS as readonly string[]).includes(value);
}

export interface CorePromptDefinition {
  key: CorePromptKey;
  label: string;
  title: string;
  description: string;
  defaultContent: string;
}

export const CORE_PROMPT_DEFINITIONS: Record<CorePromptKey, CorePromptDefinition> = CORE_PROMPT_KEYS.reduce(
  (acc, key) => {
    acc[key] = { key, label: key, title: key, description: "", defaultContent: "" };
    return acc;
  },
  {} as Record<CorePromptKey, CorePromptDefinition>
);

export function getCorePromptDefaultContent(key: CorePromptKey): string {
  return CORE_PROMPT_DEFINITIONS[key]?.defaultContent ?? "";
}

export interface CorePromptTemplates {
  commonCore: string;
  memorySummarizer: string;
  aggressionChecker: string;
  relationshipEvaluator: string;
  // *Prompt fields: читаются orchestrator-ом (aggressionChecker, memorySummarizer) и worker-ом (relationshipEvaluator).
  memorySummarizerPrompt: string;
  aggressionCheckerPrompt: string;
  relationshipEvaluatorPrompt: string;
}

export const DEFAULT_CORE_PROMPT_TEMPLATES: CorePromptTemplates = {
  commonCore: "",
  memorySummarizer: "",
  aggressionChecker: "",
  relationshipEvaluator: "",
  memorySummarizerPrompt:
    "Сделай сжатое резюме диалога на русском. Только факты из текста. Не придумывай. Если данных мало — скажи прямо.",
  aggressionCheckerPrompt:
    "Ты модератор. Последнее сообщение пользователя: {last_user_message}\nОтвет Хори: {hori_response}\nЕсли ответ Хори содержит прямую агрессию, угрозы, оскорбления или травлю — ответь AGGRESSIVE. Иначе — OK. Только одно слово.",
  relationshipEvaluatorPrompt:
    "Ты оцениваешь, как изменилось отношение пользователя к Хори после сессии диалога.\nПредыдущая характеристика: {previous_characteristic}\nДиалог:\n{session_messages}\n\nОтветь строго JSON без лишних полей:\n{\"verdict\":\"A|B|V\",\"characteristic\":\"краткое описание отношений (до 200 символов)\",\"lastChange\":\"что изменилось (до 100 символов)\"}\nverdict: A=стало хуже, B=без изменений, V=стало лучше."
};

export function detectMessageKind(_input: unknown): MessageKind {
  return "casual_address";
}
