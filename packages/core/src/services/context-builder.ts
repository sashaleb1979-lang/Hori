import { defaultRuntimeTuning } from "@hori/config";
import type { BotIntent, ContextBundle, ContextBundleV2, ContextTrace, MemoryLayer, MessageEnvelope } from "@hori/shared";

// ---------------------------------------------------------------------------
// Selective context: which categories matter for each messageKind.
// Categories not listed are skipped → fewer input tokens for cheap messages.
// ---------------------------------------------------------------------------

const CONTEXT_CATEGORIES_BY_KIND: Record<string, Set<string>> = {
  direct_mention:    new Set(["reply_chain", "active_topic", "recent_messages"]),
  opinion_question:  new Set(["active_topic", "user_profile", "relationship", "recent_messages", "entities", "entity_memory"]),
  info_question:     new Set(["reply_chain", "active_topic", "entities", "recent_messages"]),
  provocation:       new Set(["user_profile", "relationship", "recent_messages"]),
  meta_feedback:     new Set(["user_profile", "relationship", "reply_chain"]),
  casual_address:    new Set(["reply_chain", "recent_messages"]),
  smalltalk_hangout: new Set(["recent_messages"]),
  meme_bait:         new Set(["relationship", "recent_messages"]),
  reply_to_bot:      new Set(["reply_chain", "active_topic", "user_profile", "recent_messages"]),
  request_for_explanation: new Set(["reply_chain", "active_topic", "entities", "entity_memory", "server_memory", "recent_messages"]),
  command_like_request: new Set(["reply_chain", "active_topic", "user_profile", "recent_messages"]),
};

// Full set — used when messageKind is unknown or for non-chat intents.
const ALL_CATEGORIES = new Set([
  "reply_chain", "active_topic", "entities", "entity_memory", "active_memory",
  "user_profile", "relationship", "channel_summaries", "server_memory", "recent_messages"
]);

function relevantCategories(messageKind?: string): Set<string> {
  if (!messageKind) return ALL_CATEGORIES;
  return CONTEXT_CATEGORIES_BY_KIND[messageKind] ?? ALL_CATEGORIES;
}

interface ContextSection {
  key: string;
  content: string;
  memoryLayers: MemoryLayer[];
}

export class ContextBuilderService {
  buildPromptContext(
    bundle: ContextBundle,
    options: {
      message?: MessageEnvelope;
      intent?: BotIntent;
      maxChars?: number;
      contextV2Enabled?: boolean;
      messageKind?: string;
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
      messageKind?: string;
    }
  ) {
    const maxChars = options.maxChars ?? defaultRuntimeTuning.CONTEXT_V2_MAX_CHARS;
    const relevant = relevantCategories(options.messageKind);
    const hotSections: ContextSection[] = [];
    const warmSections: ContextSection[] = [];

    if (relevant.has("reply_chain") && bundle.replyChain.length) {
      hotSections.push({
        key: "reply_chain",
        memoryLayers: ["reply_chain"],
        content:
          "[REPLY CHAIN]\n" +
          bundle.replyChain.map((message) => formatMessage(message.author, message.content)).join("\n")
      });
    }

    if (relevant.has("active_topic") && bundle.activeTopic) {
      const facts = asStringArray(bundle.activeTopic.summaryFacts)
        .slice(0, 6)
        .map((fact) => `- ${fact}`)
        .join("\n");
      hotSections.push({
        key: "active_topic",
        memoryLayers: ["active_topic"],
        content: [
          "[ACTIVE TOPIC]",
          `Тема: ${bundle.activeTopic.title}`,
          `Коротко: ${bundle.activeTopic.summaryShort}`,
          facts ? `Факты:\n${facts}` : "",
          `Confidence: ${bundle.activeTopic.confidence}`
        ]
          .filter(Boolean)
          .join("\n")
      });
    }

    if (relevant.has("entities") && bundle.entities.length) {
      warmSections.push({
        key: "entities",
        memoryLayers: [],
        content:
          "[ENTITY TRIGGERS]\n" +
          bundle.entities
            .slice(0, 5)
            .map((entity) => `- ${entity.surface}${entity.canonical ? ` -> ${entity.canonical}` : ""} (${entity.score})`)
            .join("\n")
      });
    }

    if (relevant.has("entity_memory") && bundle.entityMemories.length) {
      warmSections.push({
        key: "entity_memory",
        memoryLayers: ["entity_memory"],
        content:
          "[ENTITY MEMORY]\n" +
          bundle.entityMemories
            .slice(0, 3)
            .map((memory) => `- ${memory.key}: ${memory.value}`)
            .join("\n")
      });
    }

    if (relevant.has("active_memory") && bundle.activeMemory?.entries.length) {
      const activeLines = bundle.activeMemory.entries.slice(0, 8).map((entry) => {
        if (entry.scope === "message") {
          return `- [similar message/${entry.reason}/${entry.score}] ${entry.value}`;
        }

        return `- [${entry.scope}/${entry.type}/${entry.reason}/${entry.score}] ${entry.key}: ${entry.value}`;
      });

      const scopes = new Set(bundle.activeMemory.entries.map((entry) => entry.scope));
      warmSections.push({
        key: "active_memory",
        memoryLayers: [
          "active_memory",
          ...(scopes.has("user") ? ["user_memory" as const] : []),
          ...(scopes.has("channel") ? ["channel_memory" as const] : []),
          ...(scopes.has("event") ? ["event_memory" as const] : []),
          ...(scopes.has("message") ? ["similar_messages" as const] : [])
        ],
        content: "[ACTIVE MEMORY]\n" + activeLines.join("\n")
      });
    }

    if (relevant.has("user_profile") && bundle.userProfile) {
      warmSections.push({
        key: "user_profile",
        memoryLayers: ["user_profile"],
        content: `Профиль юзера: ${bundle.userProfile.summaryShort}. Стиль: ${bundle.userProfile.styleTags.join(", ")}. Темы: ${bundle.userProfile.topicTags.join(", ")}. Confidence: ${bundle.userProfile.confidenceScore}.`
      });
    }

    if (relevant.has("relationship") && bundle.relationship) {
      warmSections.push({
        key: "relationship",
        memoryLayers: ["relationship"],
        content: `Отношение к юзеру: tone=${bundle.relationship.toneBias}, roast=${bundle.relationship.roastLevel}, do_not_mock=${bundle.relationship.doNotMock}.`
      });
    }

    if (relevant.has("channel_summaries") && bundle.summaries.length) {
      warmSections.push({
        key: "channel_summaries",
        memoryLayers: ["channel_summaries"],
        content: "Сводки канала:\n" + bundle.summaries.slice(0, 2).map((summary) => `- ${summary.summaryShort}`).join("\n")
      });
    }

    if (relevant.has("server_memory") && bundle.serverMemories.length) {
      warmSections.push({
        key: "server_memory",
        memoryLayers: ["server_memory"],
        content:
          "Долгая память сервера:\n" +
          bundle.serverMemories
            .slice(0, 3)
            .map((memory) => `- ${memory.key}: ${memory.value}`)
            .join("\n")
      });
    }

    const recentMessages = relevant.has("recent_messages") ? uniqueRecentMessages(bundle) : [];
    let recentLines = recentMessages.map((message) => formatMessage(message.author, message.content));
    let activeWarmSections = [...warmSections];
    let droppedRecentMessages = 0;
    let droppedWarmSections = 0;
    const hasTopicWindowContext = recentMessages.some((message) =>
      bundle.topicWindow.some((topicMessage) => (topicMessage.id && message.id ? topicMessage.id === message.id : topicMessage === message))
    );

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
        hotSections.length ? hotSections.map((section) => section.content).join("\n\n") : "Нет сильных якорей контекста.",
        recentLines.length ? "[RECENT CONTEXT]\n" + recentLines.join("\n") : "",
        activeWarmSections.length ? "[WARM CONTEXT SUPPORT]\n" + activeWarmSections.map((section) => section.content).join("\n\n") : "",
        questionAnchor
      ]
        .filter(Boolean)
        .join("\n\n");

    while (activeWarmSections.length && compose().length > maxChars) {
      activeWarmSections = activeWarmSections.slice(0, -1);
      droppedWarmSections += 1;
    }

    while (recentLines.length && compose().length > maxChars) {
      recentLines = recentLines.slice(1);
      droppedRecentMessages += 1;
    }

    const finalMemoryLayers = new Set<MemoryLayer>([
      ...hotSections.flatMap((section) => section.memoryLayers),
      ...(recentLines.length ? (["recent_messages"] as MemoryLayer[]) : []),
      ...(recentLines.length && hasTopicWindowContext ? (["topic_window"] as MemoryLayer[]) : []),
      ...activeWarmSections.flatMap((section) => section.memoryLayers)
    ]);
    const finalSections = new Set<string>([
      ...hotSections.map((section) => section.key),
      ...(recentLines.length ? ["recent_messages"] : []),
      ...(recentLines.length && hasTopicWindowContext ? ["topic_window"] : []),
      ...activeWarmSections.map((section) => section.key)
    ]);

    return {
      contextText: compose(),
      memoryLayers: [...finalMemoryLayers],
      trace: {
        version: "v2",
        activeTopicId: bundle.activeTopic?.topicId ?? null,
        replyChainCount: bundle.replyChain.length,
        entityTriggers: bundle.entities.map((entity) => entity.surface),
        truncation: {
          maxChars,
          droppedRecentMessages,
          droppedWarmSections
        },
        sections: [...finalSections]
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

