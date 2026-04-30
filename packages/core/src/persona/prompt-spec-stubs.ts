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

// Широкий union ключей: новые camelCase + V6 legacy snake_case.
export const CORE_PROMPT_KEYS = [
  "commonCore",
  "memorySummarizer",
  "aggressionChecker",
  "relationshipEvaluator",
  "sigil_question",
  "sigil_force_rewrite",
  "sigil_summary",
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
  sigil_question: string;
  sigil_force_rewrite: string;
  sigil_summary: string;
  // legacy V6 *Prompt fields (читаются orchestrator-ом и worker-ом до Phase 4-6).
  memorySummarizerPrompt: string;
  aggressionCheckerPrompt: string;
  relationshipEvaluatorPrompt: string;
}

export const DEFAULT_CORE_PROMPT_TEMPLATES: CorePromptTemplates = {
  commonCore: "",
  memorySummarizer: "",
  aggressionChecker: "",
  relationshipEvaluator: "",
  sigil_question: "",
  sigil_force_rewrite: "",
  sigil_summary: "",
  memorySummarizerPrompt: "",
  aggressionCheckerPrompt: "",
  relationshipEvaluatorPrompt: ""
};

export function corePromptKeyForSigil(sigil: string | null | undefined): CorePromptKey | null {
  if (!sigil) return null;
  switch (sigil) {
    case "?":
      return "sigil_question";
    case "!":
      return "sigil_force_rewrite";
    case "*":
      return "sigil_summary";
    default:
      return null;
  }
}

export function buildSigilOverlayBlock(_sigil: string | null | undefined, _templates?: CorePromptTemplates): string {
  return "";
}

export function buildRestoredContextBlock(_data: unknown): string {
  return "";
}

export function detectMessageKind(_input: unknown): MessageKind {
  return "casual_address";
}
