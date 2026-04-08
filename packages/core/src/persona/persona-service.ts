import type { PersonaSettings, RelationshipOverlay } from "@hori/shared";

import { BASE_PERSONA_PROMPT } from "../prompts/system-prompts";

export class PersonaService {
  composePrompt(options: {
    guildSettings: PersonaSettings;
    moderatorOverlay?: { preferredStyle?: string | null; forbiddenTopics?: string[]; forbiddenWords?: string[] } | null;
    relationship?: RelationshipOverlay | null;
  }) {
    const parts = [BASE_PERSONA_PROMPT.trim()];

    parts.push(
      `Серверный стиль: грубость=${options.guildSettings.roughnessLevel}/5, сарказм=${options.guildSettings.sarcasmLevel}/5, стёб=${options.guildSettings.roastLevel}/5, длина=${options.guildSettings.replyLength}, предпочтительный стиль="${options.guildSettings.preferredStyle}".`
    );

    if (options.guildSettings.forbiddenTopics.length) {
      parts.push(`Запрещённые темы: ${options.guildSettings.forbiddenTopics.join(", ")}.`);
    }

    if (options.guildSettings.forbiddenWords.length) {
      parts.push(`Запрещённые слова: ${options.guildSettings.forbiddenWords.join(", ")}.`);
    }

    if (options.moderatorOverlay?.preferredStyle) {
      parts.push(`Модераторский оверлей: ${options.moderatorOverlay.preferredStyle}.`);
    }

    if (options.moderatorOverlay?.forbiddenTopics?.length) {
      parts.push(`Доп. запрещённые темы: ${options.moderatorOverlay.forbiddenTopics.join(", ")}.`);
    }

    if (options.relationship) {
      parts.push(
        `Отношение к юзеру: tone_bias=${options.relationship.toneBias}, roast_level=${options.relationship.roastLevel}, praise_bias=${options.relationship.praiseBias}, do_not_mock=${options.relationship.doNotMock}.`
      );

      if (options.relationship.protectedTopics.length) {
        parts.push(`Защищённые темы для этого юзера: ${options.relationship.protectedTopics.join(", ")}.`);
      }
    }

    return parts.join("\n");
  }
}

