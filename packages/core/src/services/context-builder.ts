import type { BotIntent, ContextBundle, ContextTrace, MemoryLayer, MessageEnvelope } from "@hori/shared";

// V7: контекст сведён к одному источнику — recent_messages.
// Никаких dialogue capsule / active_topic / entities / entity_memory /
// active_memory / user_profile / channel_summaries / server_memory / relationship.
// Большая модель сама вытащит смысл из последних сообщений.

const RECENT_MESSAGES_LIMIT = 20;
const DEFAULT_MAX_CHARS = 4000;

export class ContextBuilderService {
  buildPromptContext(
    bundle: ContextBundle,
    options: {
      message?: MessageEnvelope;
      intent?: BotIntent;
      maxChars?: number;
      messageKind?: string;
    } = {}
  ) {
    const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
    const memoryLayers: MemoryLayer[] = [];
    const sections: string[] = [];

    if (bundle.recentMessages.length) {
      memoryLayers.push("recent_messages");
      const cappedMessages = bundle.recentMessages.slice(-RECENT_MESSAGES_LIMIT);
      const block =
        "[RECENT CONTEXT]\n" +
        cappedMessages.map((message) => `[${message.author}] ${message.content}`.slice(0, 700)).join("\n");
      sections.push(block);
    }

    let contextText = sections.join("\n\n");

    if (contextText.length > maxChars) {
      contextText = contextText.slice(0, maxChars);
    }

    return {
      contextText,
      memoryLayers,
      trace: {
        version: "v1",
        replyChainCount: 0,
        entityTriggers: [],
        sections: memoryLayers
      } satisfies ContextTrace
    };
  }
}
