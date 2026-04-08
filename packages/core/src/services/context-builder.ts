import type { ContextBundle, MemoryLayer } from "@hori/shared";

export class ContextBuilderService {
  buildPromptContext(bundle: ContextBundle) {
    const sections: string[] = [];
    const memoryLayers: MemoryLayer[] = [];

    if (bundle.recentMessages.length) {
      memoryLayers.push("recent_messages");
      sections.push(
        "Последние сообщения:\n" +
          bundle.recentMessages.map((message) => `[${message.author}] ${message.content}`).join("\n")
      );
    }

    if (bundle.summaries.length) {
      memoryLayers.push("channel_summaries");
      sections.push("Сводки канала:\n" + bundle.summaries.map((summary) => `- ${summary.summaryShort}`).join("\n"));
    }

    if (bundle.serverMemories.length) {
      memoryLayers.push("server_memory");
      sections.push(
        "Долгая память сервера:\n" +
          bundle.serverMemories.map((memory) => `- ${memory.key}: ${memory.value}`).join("\n")
      );
    }

    if (bundle.userProfile) {
      memoryLayers.push("user_profile");
      sections.push(
        `Профиль юзера: ${bundle.userProfile.summaryShort}. Теги стиля: ${bundle.userProfile.styleTags.join(", ")}. Теги тем: ${bundle.userProfile.topicTags.join(", ")}. Confidence: ${bundle.userProfile.confidenceScore}.`
      );
    }

    if (bundle.relationship) {
      memoryLayers.push("relationship");
      sections.push(
        `Отношение к юзеру: tone=${bundle.relationship.toneBias}, roast=${bundle.relationship.roastLevel}, do_not_mock=${bundle.relationship.doNotMock}.`
      );
    }

    return {
      contextText: sections.join("\n\n"),
      memoryLayers
    };
  }
}

