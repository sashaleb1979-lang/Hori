import type { LlmChatMessage } from "@hori/shared";

export function buildSummaryPrompt(contextText: string, request: string): LlmChatMessage[] {
  return [
    {
      role: "system",
      content:
        "Сделай краткую выжимку чата по-русски. Только по данным из контекста. Без фантазий. Если данных мало, скажи это прямо."
    },
    {
      role: "user",
      content: `Запрос: ${request}\n\nКонтекст:\n${contextText}`
    }
  ];
}

export function buildUserProfilePrompt(contextText: string): LlmChatMessage[] {
  return [
    {
      role: "system",
      content:
        "Собери краткий безопасный профиль участника только по сообщениям и статистике. Верни JSON: {\"summaryShort\":\"...\",\"styleTags\":[...],\"topicTags\":[...],\"confidenceScore\":0..1}. Не делай вид, что знаешь человека лично."
    },
    {
      role: "user",
      content: contextText
    }
  ];
}

export function buildSearchPrompt(userRequest: string, sourceDigest: string): LlmChatMessage[] {
  return [
    {
      role: "system",
      content:
        "Ты Хори. Собери короткий ответ по источникам. Если источников мало или они мутные, скажи это прямо. Сравнивай только то, что реально есть."
    },
    {
      role: "user",
      content: `Запрос: ${userRequest}\n\nМатериалы:\n${sourceDigest}`
    }
  ];
}
