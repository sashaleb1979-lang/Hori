import type { BotIntent, ContextBundle, ContextBundleV2, ContextTrace, MemoryLayer, MessageEnvelope } from "@hori/shared";

export class ContextBuilderService {
  buildPromptContext(
    bundle: ContextBundle,
    options: {
      message?: MessageEnvelope;
      intent?: BotIntent;
      maxChars?: number;
      contextV2Enabled?: boolean;
    } = {}
  ) {
    if (options.contextV2Enabled && isContextBundleV2(bundle)) {
      return this.buildPromptContextV2(bundle, options);
    }

    const sections: string[] = [];
    const memoryLayers: MemoryLayer[] = [];

    if (bundle.recentMessages.length) {
      memoryLayers.push("recent_messages");
      const cappedMessages = bundle.recentMessages.slice(-10);
      sections.push(
        "Последние сообщения:\n" +
          cappedMessages.map((message) => `[${message.author}] ${message.content}`).join("\n")
      );
    }

    if (bundle.summaries.length) {
      memoryLayers.push("channel_summaries");
      const cappedSummaries = bundle.summaries.slice(0, 2);
      sections.push("Сводки канала:\n" + cappedSummaries.map((summary) => `- ${summary.summaryShort}`).join("\n"));
    }

    if (bundle.serverMemories.length) {
      memoryLayers.push("server_memory");
      const cappedMemories = bundle.serverMemories.slice(0, 3);
      sections.push(
        "Долгая память сервера:\n" +
          cappedMemories.map((memory) => `- ${memory.key}: ${memory.value}`).join("\n")
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
      memoryLayers,
      trace: {
        version: "v1",
        replyChainCount: 0,
        entityTriggers: [],
        sections: memoryLayers
      } satisfies ContextTrace
    };
  }

  private buildPromptContextV2(
    bundle: ContextBundleV2,
    options: {
      message?: MessageEnvelope;
      intent?: BotIntent;
      maxChars?: number;
    }
  ) {
    const maxChars = options.maxChars ?? 2600;
    const memoryLayers: MemoryLayer[] = [];
    const sectionsUsed: string[] = [];
    const anchorSections: string[] = [];

    if (bundle.replyChain.length) {
      memoryLayers.push("reply_chain");
      sectionsUsed.push("reply_chain");
      anchorSections.push(
        "[REPLY CHAIN]\n" +
          bundle.replyChain.map((message) => formatMessage(message.author, message.content)).join("\n")
      );
    }

    if (bundle.activeTopic) {
      memoryLayers.push("active_topic");
      sectionsUsed.push("active_topic");
      const facts = asStringArray(bundle.activeTopic.summaryFacts)
        .slice(0, 6)
        .map((fact) => `- ${fact}`)
        .join("\n");
      anchorSections.push(
        [
          "[ACTIVE TOPIC]",
          `Тема: ${bundle.activeTopic.title}`,
          `Коротко: ${bundle.activeTopic.summaryShort}`,
          facts ? `Факты:\n${facts}` : "",
          `Confidence: ${bundle.activeTopic.confidence}`
        ]
          .filter(Boolean)
          .join("\n")
      );
    }

    if (bundle.entities.length) {
      sectionsUsed.push("entities");
      anchorSections.push(
        "[ENTITY TRIGGERS]\n" +
          bundle.entities
            .slice(0, 5)
            .map((entity) => `- ${entity.surface}${entity.canonical ? ` -> ${entity.canonical}` : ""} (${entity.score})`)
            .join("\n")
      );
    }

    if (bundle.entityMemories.length) {
      memoryLayers.push("entity_memory");
      sectionsUsed.push("entity_memory");
      anchorSections.push(
        "[ENTITY MEMORY]\n" +
          bundle.entityMemories
            .slice(0, 3)
            .map((memory) => `- ${memory.key}: ${memory.value}`)
            .join("\n")
      );
    }

    if (bundle.userProfile) {
      memoryLayers.push("user_profile");
      sectionsUsed.push("user_profile");
      anchorSections.push(
        `Профиль юзера: ${bundle.userProfile.summaryShort}. Стиль: ${bundle.userProfile.styleTags.join(", ")}. Темы: ${bundle.userProfile.topicTags.join(", ")}. Confidence: ${bundle.userProfile.confidenceScore}.`
      );
    }

    if (bundle.relationship) {
      memoryLayers.push("relationship");
      sectionsUsed.push("relationship");
      anchorSections.push(
        `Отношение к юзеру: tone=${bundle.relationship.toneBias}, roast=${bundle.relationship.roastLevel}, do_not_mock=${bundle.relationship.doNotMock}.`
      );
    }

    if (bundle.summaries.length) {
      memoryLayers.push("channel_summaries");
      sectionsUsed.push("channel_summaries");
      anchorSections.push("Сводки канала:\n" + bundle.summaries.slice(0, 2).map((summary) => `- ${summary.summaryShort}`).join("\n"));
    }

    if (bundle.serverMemories.length) {
      memoryLayers.push("server_memory");
      sectionsUsed.push("server_memory");
      anchorSections.push(
        "Долгая память сервера:\n" +
          bundle.serverMemories
            .slice(0, 3)
            .map((memory) => `- ${memory.key}: ${memory.value}`)
            .join("\n")
      );
    }

    const recentMessages = uniqueRecentMessages(bundle);
    let recentLines = recentMessages.map((message) => formatMessage(message.author, message.content));
    let droppedRecentMessages = 0;

    if (recentLines.length) {
      memoryLayers.push("recent_messages");
      sectionsUsed.push("recent_messages");
    }

    if (bundle.topicWindow.length) {
      memoryLayers.push("topic_window");
      sectionsUsed.push("topic_window");
    }

    const questionAnchor = [
      "[QUESTION ANCHOR]",
      `Intent: ${options.intent ?? "chat"}`,
      options.message ? formatMessage(options.message.displayName ?? options.message.username, options.message.content) : null
    ]
      .filter(Boolean)
      .join("\n");

    const compose = () =>
      [
        "[CONTEXT ANCHORS]",
        anchorSections.length ? anchorSections.join("\n\n") : "Нет сильных якорей контекста.",
        recentLines.length ? "[RECENT CONTEXT]\n" + recentLines.join("\n") : "",
        questionAnchor
      ]
        .filter(Boolean)
        .join("\n\n");

    while (recentLines.length && compose().length > maxChars) {
      recentLines = recentLines.slice(1);
      droppedRecentMessages += 1;
    }

    return {
      contextText: compose(),
      memoryLayers: [...new Set(memoryLayers)],
      trace: {
        version: "v2",
        activeTopicId: bundle.activeTopic?.topicId ?? null,
        replyChainCount: bundle.replyChain.length,
        entityTriggers: bundle.entities.map((entity) => entity.surface),
        truncation: {
          maxChars,
          droppedRecentMessages
        },
        sections: [...new Set(sectionsUsed)]
      } satisfies ContextTrace
    };
  }
}

function isContextBundleV2(bundle: ContextBundle): bundle is ContextBundleV2 {
  return (bundle as ContextBundleV2).version === "v2";
}

function formatMessage(author: string, content: string) {
  return `[${author}] ${content}`.slice(0, 700);
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function uniqueRecentMessages(bundle: ContextBundleV2) {
  const anchorIds = new Set(bundle.replyChain.map((message) => message.id).filter(Boolean));
  const topicIds = new Set(bundle.topicWindow.map((message) => message.id).filter(Boolean));
  const merged = [...bundle.topicWindow, ...bundle.recentMessages];
  const seen = new Set<string>();

  return merged.filter((message) => {
    const key = message.id ?? `${message.author}:${message.createdAt.getTime()}:${message.content}`;

    if ((message.id && anchorIds.has(message.id)) || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return (message.id && topicIds.has(message.id)) || bundle.topicWindow.length === 0 || bundle.recentMessages.includes(message);
  });
}

