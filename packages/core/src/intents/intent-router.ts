import type { BotIntent, IntentResult, MessageEnvelope } from "@hori/shared";

/**
 * V6 Phase D: Sigil registry — каждый знак имеет постоянный entry, panel может
 * включать/выключать через RuntimeConfigService key `intents.sigils.enabled`.
 *
 * `?` включён по умолчанию (search). Остальные — reserved-slots: shape известен,
 * но они отключены пока не реализована соответствующая обработка.
 */
export interface SigilDefinition {
  char: string;
  intent: Exclude<BotIntent, "chat" | "ignore">;
  requiresSearch: boolean;
  enabledByDefault: boolean;
  /** Reserved sigils пока не имеют обработчика — включать только когда intent готов. */
  reserved: boolean;
  label: string;
  description: string;
  reason: string;
}

export const SIGIL_REGISTRY: ReadonlyArray<SigilDefinition> = [
  {
    char: "?",
    intent: "search",
    requiresSearch: true,
    enabledByDefault: true,
    reserved: false,
    label: "Question / Search",
    description: "Web-search + развёрнутый ответ. Включён по умолчанию.",
    reason: "sigil:?"
  },
  {
    char: "!",
    intent: "rewrite",
    requiresSearch: false,
    enabledByDefault: false,
    reserved: true,
    label: "Force rewrite",
    description: "(reserved) Перезапросить с другим стилем. По умолчанию выключен.",
    reason: "sigil:!"
  },
  {
    char: "*",
    intent: "summary",
    requiresSearch: false,
    enabledByDefault: false,
    reserved: true,
    label: "Summary marker",
    description: "(reserved) Кратко пересказать. По умолчанию выключен.",
    reason: "sigil:*"
  },
  {
    char: ">",
    intent: "profile",
    requiresSearch: false,
    enabledByDefault: false,
    reserved: true,
    label: "Profile inspect",
    description: "(reserved) Посмотреть профиль автора цитаты. По умолчанию выключен.",
    reason: "sigil:>"
  },
  {
    char: "^",
    intent: "analytics",
    requiresSearch: false,
    enabledByDefault: false,
    reserved: true,
    label: "Activity stats",
    description: "(reserved) Быстрая активность канала. По умолчанию выключен.",
    reason: "sigil:^"
  }
];

export interface IntentRouterOptions {
  /** Override per-guild enabled set. `undefined` = use defaults. */
  enabledSigils?: ReadonlyArray<string>;
}

function buildActiveSigils(options: IntentRouterOptions | undefined): SigilDefinition[] {
  if (!options?.enabledSigils) {
    return SIGIL_REGISTRY.filter((entry) => entry.enabledByDefault).slice();
  }
  const allowed = new Set(options.enabledSigils);
  return SIGIL_REGISTRY.filter((entry) => allowed.has(entry.char));
}


const PATTERNS: Array<{
  intent: Exclude<BotIntent, "chat" | "ignore">;
  requiresSearch?: boolean;
  regex: RegExp;
  reason: string;
}> = [
  { intent: "help", regex: /^(help|помощь|что умеешь)$/i, reason: "help keyword" },
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
  private readonly activeSigils: SigilDefinition[];

  constructor(options?: IntentRouterOptions) {
    this.activeSigils = buildActiveSigils(options);
  }

  /** Текущий набор активных sigils — для панели/диагностики. */
  getActiveSigils(): ReadonlyArray<SigilDefinition> {
    return this.activeSigils;
  }

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

    // V6 Phase D: sigil-роутинг — проверяем первый не-пробельный символ.
    const firstChar = cleanedContent[0];
    const sigil = this.activeSigils.find((entry) => entry.char === firstChar);
    if (sigil) {
      const stripped = cleanedContent.slice(1).trim();
      // Голый знак без текста → fallback на help/chat (не запускаем search впустую).
      if (stripped.length === 0) {
        return {
          intent: "help",
          confidence: 0.95,
          reason: `sigil ${sigil.char} without payload → help`,
          cleanedContent,
          requiresSearch: false
        };
      }
      return {
        intent: sigil.intent,
        confidence: 0.95,
        reason: sigil.reason,
        cleanedContent: stripped,
        requiresSearch: sigil.requiresSearch,
        sigil: sigil.char
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

