import { defaultRuntimeTuning } from "@hori/config";
import type { BotIntent, ContextBundle, ContextBundleV2, ContextTrace, MemoryLayer, MessageEnvelope } from "@hori/shared";

const RELATIONSHIP_CONTEXT_HARD_DISABLED = true;

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
  priorityScore?: number;
}

interface RankedRecentMessage {
  message: ContextBundleV2["recentMessages"][number];
  priorityScore: number;
}

const CONTEXT_SECTION_BASE_PRIORITY: Record<string, number> = {
  dialogue_capsule: 1.25,
  active_memory: 1.05,
  entity_memory: 0.96,
  entities: 0.84,
  user_profile: 0.62,
  channel_summaries: 0.44,
  server_memory: 0.38,
  relationship: 0.2,
};

const CONTEXT_TOKEN_STOPWORDS = new Set([
  "а", "без", "бы", "в", "во", "вот", "вы", "да", "для", "его", "ее", "ей", "же", "за", "и", "из", "или", "их", "к", "как", "ко", "ли", "мне", "мы", "на", "не", "но", "ну", "о", "об", "он", "она", "они", "по", "под", "про", "с", "со", "то", "ты", "у", "что", "это", "этот", "эта", "эти", "я"
]);

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

    if (!RELATIONSHIP_CONTEXT_HARD_DISABLED && bundle.relationship) {
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
    const queryTokens = extractContextTokens([
      options.message?.content ?? "",
      bundle.activeTopic?.title ?? "",
      bundle.activeTopic?.summaryShort ?? ""
    ].join(" "));

    const dialogueCapsule = buildDialogueCapsuleSection(bundle, {
      message: options.message,
      messageKind: options.messageKind,
      queryTokens
    });

    if (dialogueCapsule) {
      hotSections.push(dialogueCapsule);
    }

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
        priorityScore: scoreContextSection({
          key: "entities",
          contentParts: bundle.entities.map((entity) => `${entity.surface} ${entity.canonical ?? ""}`),
          queryTokens,
          activeTopic: bundle.activeTopic?.title,
          messageKind: options.messageKind
        }),
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
        priorityScore: scoreContextSection({
          key: "entity_memory",
          contentParts: bundle.entityMemories.map((memory) => `${memory.key} ${memory.value}`),
          queryTokens,
          activeTopic: bundle.activeTopic?.summaryShort,
          messageKind: options.messageKind
        }),
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
        priorityScore: scoreContextSection({
          key: "active_memory",
          contentParts: bundle.activeMemory.entries.map((entry) => `${entry.key} ${entry.value} ${entry.reason}`),
          queryTokens,
          activeTopic: bundle.activeTopic?.summaryShort,
          messageKind: options.messageKind
        }),
        content: "[ACTIVE MEMORY]\n" + activeLines.join("\n")
      });
    }

    if (relevant.has("user_profile") && bundle.userProfile) {
      warmSections.push({
        key: "user_profile",
        memoryLayers: ["user_profile"],
        priorityScore: scoreContextSection({
          key: "user_profile",
          contentParts: [bundle.userProfile.summaryShort, bundle.userProfile.styleTags.join(" "), bundle.userProfile.topicTags.join(" ")],
          queryTokens,
          activeTopic: bundle.activeTopic?.summaryShort,
          messageKind: options.messageKind
        }),
        content: `Профиль юзера: ${bundle.userProfile.summaryShort}. Стиль: ${bundle.userProfile.styleTags.join(", ")}. Темы: ${bundle.userProfile.topicTags.join(", ")}. Confidence: ${bundle.userProfile.confidenceScore}.`
      });
    }

    if (!RELATIONSHIP_CONTEXT_HARD_DISABLED && relevant.has("relationship") && bundle.relationship) {
      warmSections.push({
        key: "relationship",
        memoryLayers: ["relationship"],
        priorityScore: scoreContextSection({
          key: "relationship",
          contentParts: [bundle.relationship.toneBias],
          queryTokens,
          activeTopic: bundle.activeTopic?.summaryShort,
          messageKind: options.messageKind
        }),
        content: `Отношение к юзеру: tone=${bundle.relationship.toneBias}, roast=${bundle.relationship.roastLevel}, do_not_mock=${bundle.relationship.doNotMock}.`
      });
    }

    if (relevant.has("channel_summaries") && bundle.summaries.length) {
      warmSections.push({
        key: "channel_summaries",
        memoryLayers: ["channel_summaries"],
        priorityScore: scoreContextSection({
          key: "channel_summaries",
          contentParts: bundle.summaries.map((summary) => summary.summaryShort),
          queryTokens,
          activeTopic: bundle.activeTopic?.summaryShort,
          messageKind: options.messageKind
        }),
        content: "Сводки канала:\n" + bundle.summaries.slice(0, 2).map((summary) => `- ${summary.summaryShort}`).join("\n")
      });
    }

    if (relevant.has("server_memory") && bundle.serverMemories.length) {
      warmSections.push({
        key: "server_memory",
        memoryLayers: ["server_memory"],
        priorityScore: scoreContextSection({
          key: "server_memory",
          contentParts: bundle.serverMemories.map((memory) => `${memory.key} ${memory.value}`),
          queryTokens,
          activeTopic: bundle.activeTopic?.summaryShort,
          messageKind: options.messageKind
        }),
        content:
          "Долгая память сервера:\n" +
          bundle.serverMemories
            .slice(0, 3)
            .map((memory) => `- ${memory.key}: ${memory.value}`)
            .join("\n")
      });
    }

    const recentMessages = relevant.has("recent_messages") ? uniqueRecentMessages(bundle) : [];
    let rankedRecentMessages = scoreRecentMessages(recentMessages, {
      queryTokens,
      replyChainIds: new Set(bundle.replyChain.map((message) => message.id).filter((id): id is string => Boolean(id))),
      topicWindowIds: new Set(bundle.topicWindow.map((message) => message.id).filter((id): id is string => Boolean(id))),
      activeTopic: bundle.activeTopic?.summaryShort,
    });
    let activeWarmSections = [...warmSections].sort((left, right) => (right.priorityScore ?? 0) - (left.priorityScore ?? 0));
    let droppedRecentMessages = 0;
    let droppedWarmSections = 0;
    const hasTopicWindowContext = rankedRecentMessages.some(({ message }) =>
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
        rankedRecentMessages.length ? "[RECENT CONTEXT]\n" + rankedRecentMessages.map(({ message }) => formatMessage(message.author, message.content)).join("\n") : "",
        activeWarmSections.length ? "[WARM CONTEXT SUPPORT]\n" + activeWarmSections.map((section) => section.content).join("\n\n") : "",
        questionAnchor
      ]
        .filter(Boolean)
        .join("\n\n");

    while (activeWarmSections.length && compose().length > maxChars) {
      const dropIndex = lowestPriorityIndex(activeWarmSections);
      activeWarmSections = activeWarmSections.filter((_, index) => index !== dropIndex);
      droppedWarmSections += 1;
    }

    while (rankedRecentMessages.length && compose().length > maxChars) {
      const dropIndex = lowestPriorityIndex(rankedRecentMessages);
      rankedRecentMessages = rankedRecentMessages
        .filter((_, index) => index !== dropIndex)
        .sort((left, right) => left.message.createdAt.getTime() - right.message.createdAt.getTime());
      droppedRecentMessages += 1;
    }

    const finalMemoryLayers = new Set<MemoryLayer>([
      ...hotSections.flatMap((section) => section.memoryLayers),
      ...(rankedRecentMessages.length ? (["recent_messages"] as MemoryLayer[]) : []),
      ...(rankedRecentMessages.length && hasTopicWindowContext ? (["topic_window"] as MemoryLayer[]) : []),
      ...activeWarmSections.flatMap((section) => section.memoryLayers)
    ]);
    const finalSections = new Set<string>([
      ...hotSections.map((section) => section.key),
      ...(rankedRecentMessages.length ? ["recent_messages"] : []),
      ...(rankedRecentMessages.length && hasTopicWindowContext ? ["topic_window"] : []),
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

function buildDialogueCapsuleSection(
  bundle: ContextBundleV2,
  options: {
    message?: MessageEnvelope;
    messageKind?: string;
    queryTokens: string[];
  }
): ContextSection | null {
  const lastReply = bundle.replyChain[bundle.replyChain.length - 1];
  const topEntities = bundle.entities
    .filter((entity) => entity.score >= 0.78)
    .slice(0, 3)
    .map((entity) => entity.surface);
  const shouldInclude = Boolean(lastReply || bundle.activeTopic || topEntities.length > 0);

  if (!shouldInclude) {
    return null;
  }

  const lines = ["[DIALOGUE CAPSULE]"];

  if (options.messageKind === "reply_to_bot" && lastReply) {
    lines.push("Это продолжение текущей ветки. Не перезапускай тему.");
  }

  if (bundle.activeTopic) {
    lines.push(`Активная тема: ${bundle.activeTopic.title}. ${bundle.activeTopic.summaryShort}`);
  }

  if (lastReply) {
    lines.push(`Последняя опорная реплика: ${formatMessage(lastReply.author, lastReply.content)}`);
  }

  if (topEntities.length) {
    lines.push(`Ключевые зацепки: ${topEntities.join(", ")}`);
  }

  if (options.queryTokens.length) {
    lines.push(`Держись буквального запроса и этих токенов: ${options.queryTokens.slice(0, 6).join(", ")}`);
  }

  return {
    key: "dialogue_capsule",
    memoryLayers: [],
    priorityScore: CONTEXT_SECTION_BASE_PRIORITY.dialogue_capsule,
    content: lines.join("\n")
  };
}

function scoreContextSection(options: {
  key: string;
  contentParts: string[];
  queryTokens: string[];
  activeTopic?: string | null;
  messageKind?: string;
}) {
  const normalized = normalizeContextText(`${options.contentParts.join(" ")} ${options.activeTopic ?? ""}`);
  const overlap = countTokenOverlap(normalized, options.queryTokens);
  const topicalBoost = options.activeTopic && hasTokenOverlap(normalizeContextText(options.activeTopic), options.queryTokens) ? 0.12 : 0;
  const utilityBoost = options.messageKind === "request_for_explanation" || options.messageKind === "info_question" ? 0.06 : 0;

  return Number((
    (CONTEXT_SECTION_BASE_PRIORITY[options.key] ?? 0.3)
    + overlap * 0.18
    + topicalBoost
    + utilityBoost
  ).toFixed(2));
}

function scoreRecentMessages(
  recentMessages: ContextBundleV2["recentMessages"],
  options: {
    queryTokens: string[];
    replyChainIds: Set<string>;
    topicWindowIds: Set<string>;
    activeTopic?: string | null;
  }
): RankedRecentMessage[] {
  const total = recentMessages.length;

  return recentMessages
    .map((message, index) => {
      const normalized = normalizeContextText(message.content);
      const overlap = countTokenOverlap(normalized, options.queryTokens);
      const recencyBoost = total > 1 ? index / (total - 1) : 1;
      const replyBoost = message.id && options.replyChainIds.has(message.id) ? 0.55 : 0;
      const topicBoost = message.id && options.topicWindowIds.has(message.id) ? 0.22 : 0;
      const activeTopicBoost = options.activeTopic && hasTokenOverlap(normalizeContextText(options.activeTopic), extractContextTokens(message.content)) ? 0.08 : 0;

      return {
        message,
        priorityScore: Number((0.2 + recencyBoost * 0.25 + overlap * 0.28 + replyBoost + topicBoost + activeTopicBoost).toFixed(2))
      } satisfies RankedRecentMessage;
    })
    .sort((left, right) => left.message.createdAt.getTime() - right.message.createdAt.getTime());
}

function extractContextTokens(value: string) {
  return normalizeContextText(value)
    .split(" ")
    .filter((token) => token.length >= 3 && !CONTEXT_TOKEN_STOPWORDS.has(token))
    .slice(0, 12);
}

function normalizeContextText(value: string) {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countTokenOverlap(content: string, queryTokens: string[]) {
  if (!queryTokens.length || !content) {
    return 0;
  }

  return queryTokens.filter((token) => content.includes(token)).length;
}

function hasTokenOverlap(content: string, queryTokens: string[]) {
  return countTokenOverlap(content, queryTokens) > 0;
}

function lowestPriorityIndex<T extends { priorityScore?: number }>(items: T[]) {
  let lowestIndex = 0;
  let lowestScore = items[0]?.priorityScore ?? 0;

  for (let index = 1; index < items.length; index += 1) {
    const currentScore = items[index]?.priorityScore ?? 0;
    if (currentScore < lowestScore) {
      lowestScore = currentScore;
      lowestIndex = index;
    }
  }

  return lowestIndex;
}

