import type { LlmChatMessage } from "@hori/shared";

export const COMPACTION_SYSTEM_PROMPT = `Ты суммаризатор диалога. По истории разговора сделай короткое, плотное summary, сохранив:
- ключевые факты, решения и договорённости
- предпочтения и запросы пользователя
- контекст, без которого нельзя продолжить разговор
- имена, даты, числа и конкретные детали
- результаты вызовов инструментов и что именно получилось

Если передан блок <prior_context>, это summaries более ранних отрезков разговора. Используй их только как фон для continuity. Не повторяй и не переформулируй содержимое <prior_context> в ответе.

Выведи только summary нового сегмента разговора. Без вступления, заголовков и пояснений.`;

export interface CompactionPromptMessage {
  role: LlmChatMessage["role"];
  content: string;
}

export function buildCompactionUserPrompt(
  priorSummaries: string[],
  messages: readonly CompactionPromptMessage[],
): string {
  const lines: string[] = [];

  if (priorSummaries.length > 0) {
    lines.push("<prior_context>");
    lines.push(
      "Ниже summaries более ранних частей разговора. Они даны только как справочный контекст, чтобы удерживать ход беседы. Не включай и не повторяй это содержимое в новом summary.",
    );
    lines.push("");
    lines.push(priorSummaries.join("\n---\n"));
    lines.push("</prior_context>");
    lines.push("");
    lines.push("Теперь суммируй только новый сегмент разговора:");
  } else {
    lines.push("Суммируй следующий сегмент разговора:");
  }

  for (const message of messages) {
    const content = message.content.trim();
    if (!content) {
      continue;
    }
    lines.push(`${message.role}: ${content}`);
  }

  return lines.join("\n");
}

export function buildCompactionMessages(
  priorSummaries: string[],
  messages: readonly CompactionPromptMessage[],
): LlmChatMessage[] {
  return [
    { role: "system", content: COMPACTION_SYSTEM_PROMPT },
    { role: "user", content: buildCompactionUserPrompt(priorSummaries, messages) },
  ];
}