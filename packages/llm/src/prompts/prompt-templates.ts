import type { BotIntent, LlmChatMessage } from "@hori/shared";

export function buildIntentClassifierPrompt(content: string): LlmChatMessage[] {
  return [
    {
      role: "system",
      content:
        "Определи intent русского сообщения для Discord-бота. Верни только JSON: {\"intent\":\"chat|help|summary|analytics|search|profile|memory_write|memory_forget|rewrite|moderation_style_request\",\"confidence\":0..1,\"reason\":\"...\"}."
    },
    {
      role: "user",
      content
    }
  ];
}

export function buildAnalyticsNarrationPrompt(analyticsText: string, request: string): LlmChatMessage[] {
  return [
    {
      role: "system",
      content:
        "Ты Хори. Объясни цифры коротко, сухо и по делу. Не выдумывай данные. Не лей воду."
    },
    {
      role: "user",
      content: `Запрос пользователя: ${request}\n\nДанные:\n${analyticsText}`
    }
  ];
}

export function buildRewritePrompt(sourceText: string, request: string): LlmChatMessage[] {
  return [
    {
      role: "system",
      content:
        "Перепиши текст по запросу. Отвечай только итоговым вариантом. Коротко. Без пояснений."
    },
    {
      role: "user",
      content: `Исходник:\n${sourceText}\n\nЧто нужно:\n${request}`
    }
  ];
}

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

export function buildNoContextPrompt(intent: BotIntent, request: string): LlmChatMessage[] {
  return [
    {
      role: "system",
      content: `Ты Хори. Intent: ${intent}. Отвечай коротко, по-русски, без воды.`
    },
    {
      role: "user",
      content: request
    }
  ];
}

