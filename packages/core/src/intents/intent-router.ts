import type { BotIntent, IntentResult, MessageEnvelope } from "@hori/shared";

const PATTERNS: Array<{
  intent: Exclude<BotIntent, "chat" | "ignore">;
  requiresSearch?: boolean;
  regex: RegExp;
  reason: string;
}> = [
  { intent: "help", regex: /^(help|помощь|что умеешь|\?)$/i, reason: "help keyword" },
  {
    intent: "summary",
    regex: /(кратко|что было|пока меня не было|о чем спорили|что решили|перескажи)/i,
    reason: "summary pattern"
  },
  {
    intent: "analytics",
    regex: /(кто больше всех писал|топ за|кто активнее|какие каналы самые активные|пики активности|статистика)/i,
    reason: "analytics pattern"
  },
  {
    intent: "search",
    regex: /(найди|свежую инфу|проверь это|посмотри что там|сравни .*источник)/i,
    reason: "search pattern",
    requiresSearch: true
  },
  {
    intent: "memory_write",
    regex: /^запомни\b/i,
    reason: "memory write pattern"
  },
  {
    intent: "memory_recall",
    regex: /^вспомни\b/i,
    reason: "memory recall pattern"
  },
  {
    intent: "memory_forget",
    regex: /^забудь\b/i,
    reason: "memory forget pattern"
  },
  {
    intent: "rewrite",
    regex: /(скажи короче|скажи жёстче|скажи жестче|скажи проще|без воды|перепиши нормально)/i,
    reason: "rewrite pattern"
  },
  {
    intent: "profile",
    regex: /(что он имел в виду|что она имела в виду|что за человек|профиль|какой у него стиль)/i,
    reason: "profile pattern"
  },
  {
    intent: "moderation_style_request",
    regex: /(будь мягче|будь жестче|не трогай его|не трогай её|подкалывай)/i,
    reason: "moderation style request pattern"
  }
];

function stripBotName(content: string, botName: string) {
  const normalized = content.trim();
  const escapedName = botName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  return normalized
    .replace(new RegExp(`^${escapedName}[,:!\\s-]*`, "i"), "")
    .replace(/^<@\d+>\s*/i, "")
    .trim();
}

export class IntentRouter {
  route(message: MessageEnvelope, botName: string): IntentResult {
    const cleanedContent = stripBotName(message.content, botName);

    if (!message.explicitInvocation && !message.triggerSource) {
      return {
        intent: "ignore",
        confidence: 1,
        reason: "message is not addressed to bot",
        cleanedContent,
        requiresSearch: false
      };
    }

    if (!cleanedContent.length) {
      return {
        intent: "help",
        confidence: 0.98,
        reason: "empty invocation defaults to help",
        cleanedContent,
        requiresSearch: false
      };
    }

    for (const entry of PATTERNS) {
      if (entry.regex.test(cleanedContent)) {
        return {
          intent: entry.intent,
          confidence: 0.85,
          reason: entry.reason,
          cleanedContent,
          requiresSearch: entry.requiresSearch ?? false
        };
      }
    }

    return {
      intent: "chat",
      confidence: 0.65,
      reason: "default chat fallback",
      cleanedContent,
      requiresSearch: false
    };
  }
}

