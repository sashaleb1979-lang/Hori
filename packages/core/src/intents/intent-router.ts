import type { BotIntent, IntentResult, MessageEnvelope } from "@hori/shared";

/**
 * V7 IntentRouter.
 *
 * Только два режима:
 *  1. **chat** — всё остальное.
 *  2. **сигил** — отдельные intent-ветки.
 *
 * Активны сейчас:
 *  - `?` (sigil) → search
 *
 * Зарезервированы (panel может включить позже):
 *  - `*` (sigil) → отложен (knowledge-base поиск по тегам)
 *  - `!` (sigil) → reserved
 *
 * Русские команды `запомни/вспомни/забудь` теперь живут в bot-layer slot UX
 * и не входят в core routing contract.
 *
 * Все V6 intents (analytics/summary/profile/rewrite/help/moderation_style_request)
 * больше не маршрутизируются — они сначала становятся chat, а соответствующее
 * поведение реализуется напрямую в chat handler через core/память (если вообще
 * нужно). Тип `BotIntent` в shared сохраняет старые значения для совместимости
 * до Phase 1C.
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
    char: "*",
    intent: "search",
    requiresSearch: false,
    enabledByDefault: false,
    reserved: true,
    label: "Knowledge tag search",
    description: "(reserved) Поиск по тегам в knowledge base. По умолчанию выключен.",
    reason: "sigil:*"
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
        intent: "chat",
        confidence: 0.95,
        reason: "empty invocation → chat",
        cleanedContent,
        requiresSearch: false
      };
    }

    // Sigil-роутинг — проверяем первый не-пробельный символ.
    const firstChar = cleanedContent[0];
    const sigil = this.activeSigils.find((entry) => entry.char === firstChar);
    if (sigil) {
      const stripped = cleanedContent.slice(1).trim();
      if (stripped.length === 0) {
        return {
          intent: "chat",
          confidence: 0.9,
          reason: `sigil ${sigil.char} without payload → chat`,
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
    // Фолбэк — chat.
    return {
      intent: "chat",
      confidence: 0.7,
      reason: "fallback → chat",
      cleanedContent,
      requiresSearch: false
    };
  }
}
