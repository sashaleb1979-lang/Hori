/**
 * V7 prompt-spec stubs.
 *
 * Старый prompt-spec.ts удалён. Здесь оставлены только минимальные типы и
 * dummy-значения для совместимости с потребителями, которые ещё не переписаны
 * под новую систему (interaction-router панель, runtime-config-service,
 * orchestrator legacy reads).
 *
 * Это не source of truth для production chat prompt assembly. Текущий runtime
 * contract живёт в ChatOrchestrator и runtime-config-service; этот файл держит
 * только transitional key surface до окончательной нормализации namespace.
 *
 * Эти заглушки будут окончательно удалены в Phase 4 (user prompts) и Phase 9
 * (panel rewrite).
 */

import type { MessageKind } from "@hori/shared";

import { coreText } from "./cores";

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

const MEMORY_SUMMARIZER_PROMPT_DEFAULT =
  "Сделай сжатое резюме диалога на русском. Только факты из текста. Не придумывай. Если данных мало — скажи прямо.";

const AGGRESSION_CHECKER_PROMPT_DEFAULT =
  "Ты модератор. Последнее сообщение пользователя: {last_user_message}\nОтвет Хори: {hori_response}\nЕсли ответ Хори содержит прямую агрессию, угрозы, оскорбления или травлю — ответь AGGRESSIVE. Иначе — OK. Только одно слово.";

const RELATIONSHIP_EVALUATOR_PROMPT_DEFAULT =
  "Ты оцениваешь, как изменилось отношение пользователя к Хори после сессии диалога.\nПредыдущая характеристика: {previous_characteristic}\nДиалог:\n{session_messages}\n\nОтветь строго JSON без лишних полей:\n{\"verdict\":\"A|B|V\",\"characteristic\":\"краткое описание отношений (до 200 символов)\",\"lastChange\":\"что изменилось (до 100 символов)\"}\nverdict: A=стало хуже, B=без изменений, V=стало лучше.";

export function getCorePromptDefaultContent(key: CorePromptKey): string {
  switch (key) {
    case "commonCore":
    case "common_core_base":
      return coreText("core_base");
    case "memorySummarizer":
      return MEMORY_SUMMARIZER_PROMPT_DEFAULT;
    case "aggressionChecker":
      return AGGRESSION_CHECKER_PROMPT_DEFAULT;
    case "relationshipEvaluator":
    case "relationship_base":
      return RELATIONSHIP_EVALUATOR_PROMPT_DEFAULT;
  }
}

export const CORE_PROMPT_DEFINITIONS: Record<CorePromptKey, CorePromptDefinition> = {
  commonCore: {
    key: "commonCore",
    label: "Базовый commonCore",
    title: "Базовый commonCore",
    description: "Главный production-блок stable core prompt. Всегда идёт первым system block в chat path.",
    defaultContent: getCorePromptDefaultContent("commonCore")
  },
  memorySummarizer: {
    key: "memorySummarizer",
    label: "Memory summarizer",
    title: "Memory summarizer",
    description: "Service prompt для сжатого memory summary. Нужен для внутренних summarizer-задач.",
    defaultContent: getCorePromptDefaultContent("memorySummarizer")
  },
  aggressionChecker: {
    key: "aggressionChecker",
    label: "Aggression checker",
    title: "Aggression checker",
    description: "Production prompt для post-check ответа Хори на прямую агрессию.",
    defaultContent: getCorePromptDefaultContent("aggressionChecker")
  },
  relationshipEvaluator: {
    key: "relationshipEvaluator",
    label: "Relationship evaluator",
    title: "Relationship evaluator",
    description: "Production prompt для A/B/V оценки, как изменилась динамика отношений после сессии.",
    defaultContent: getCorePromptDefaultContent("relationshipEvaluator")
  },
  common_core_base: {
    key: "common_core_base",
    label: "Legacy common_core_base",
    title: "Legacy common_core_base",
    description: "Совместимый alias для базового commonCore. Используй только для старых surface-ов.",
    defaultContent: getCorePromptDefaultContent("common_core_base")
  },
  relationship_base: {
    key: "relationship_base",
    label: "Legacy relationship_base",
    title: "Legacy relationship_base",
    description: "Совместимый alias для relationship evaluator prompt. Нужен для старых runtime surface-ов.",
    defaultContent: getCorePromptDefaultContent("relationship_base")
  }
};

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
  commonCore: coreText("core_base"),
  memorySummarizer: "",
  aggressionChecker: "",
  relationshipEvaluator: "",
  memorySummarizerPrompt: MEMORY_SUMMARIZER_PROMPT_DEFAULT,
  aggressionCheckerPrompt: AGGRESSION_CHECKER_PROMPT_DEFAULT,
  relationshipEvaluatorPrompt: RELATIONSHIP_EVALUATOR_PROMPT_DEFAULT
};

export function detectMessageKind(_input: unknown): MessageKind {
  return "casual_address";
}
