/**
 * Activation Policy — решение «отвечать ли на сообщение».
 *
 * Скопировано из OpenClaw channels/mention-gating.ts + channels/allow-from.ts
 * и адаптировано под Discord-only (убраны multi-channel абстракции Slack/etc).
 *
 * Оригинальная архитектура OpenClaw: facts/policy → decision.
 */

// ============================================================================
// IMPLICIT MENTION KINDS
// ============================================================================

/**
 * Виды неявного упоминания бота (из OpenClaw InboundImplicitMentionKind).
 * Убран "native" (multi-channel), оставлены Discord-специфичные.
 */
export type ImplicitMentionKind =
  | "reply_to_bot"
  | "quoted_bot"
  | "bot_thread_participant"
  | "name_in_text";

// ============================================================================
// MENTION FACTS & POLICY — OpenClaw pattern
// ============================================================================

/** Факты о входящем сообщении (что произошло) */
export interface MentionFacts {
  /** Можем ли мы вообще детектить упоминания в этом канале */
  canDetectMention: boolean;
  /** Прямой @mention бота */
  wasMentioned: boolean;
  /** Есть ли любой @mention кого-либо в сообщении */
  hasAnyMention?: boolean;
  /** Какие неявные упоминания обнаружены */
  implicitMentionKinds?: readonly ImplicitMentionKind[];
}

/** Политика канала (как реагировать) */
export interface MentionPolicy {
  /** Это групповой канал (не DM) */
  isGroup: boolean;
  /** Требовать ли явного упоминания для ответа */
  requireMention: boolean;
  /** Какие виды неявных упоминаний разрешены */
  allowedImplicitMentionKinds?: readonly ImplicitMentionKind[];
  /** Разрешены ли текстовые команды */
  allowTextCommands: boolean;
  /** Есть ли в сообщении управляющая команда */
  hasControlCommand: boolean;
  /** Авторизован ли отправитель для команд */
  commandAuthorized: boolean;
}

// ============================================================================
// MENTION DECISION
// ============================================================================

/** Результат решения «отвечать ли» */
export interface MentionDecision {
  /** Было ли эффективное упоминание (прямое или неявное) */
  effectiveWasMentioned: boolean;
  /** Пропустить это сообщение (не отвечать) */
  shouldSkip: boolean;
  /** Обнаружено неявное упоминание */
  implicitMention: boolean;
  /** Какие именно неявные упоминания совпали */
  matchedImplicitMentionKinds: ImplicitMentionKind[];
  /** Bypass mention requirement через команду */
  shouldBypassMention: boolean;
}

// ============================================================================
// CORE LOGIC — скопировано из OpenClaw resolveInboundMentionDecision
// ============================================================================

/** Фильтр неявных упоминаний по разрешённым видам */
function resolveMatchedImplicitKinds(
  inputKinds: readonly ImplicitMentionKind[] | undefined,
  allowedKinds: readonly ImplicitMentionKind[] | undefined,
): ImplicitMentionKind[] {
  if (!inputKinds || inputKinds.length === 0) return [];
  const allowed = allowedKinds ? new Set(allowedKinds) : null;
  const matched: ImplicitMentionKind[] = [];
  for (const kind of inputKinds) {
    if (allowed && !allowed.has(kind)) continue;
    if (!matched.includes(kind)) matched.push(kind);
  }
  return matched;
}

/**
 * Главная функция: facts + policy → MentionDecision.
 * Скопировано из OpenClaw resolveInboundMentionDecision.
 */
export function resolveActivation(facts: MentionFacts, policy: MentionPolicy): MentionDecision {
  // Bypass: группа + requireMention + нет прямого mention + есть авторизованная команда
  const shouldBypassMention =
    policy.isGroup &&
    policy.requireMention &&
    !facts.wasMentioned &&
    !(facts.hasAnyMention ?? false) &&
    policy.allowTextCommands &&
    policy.commandAuthorized &&
    policy.hasControlCommand;

  const matchedImplicitMentionKinds = resolveMatchedImplicitKinds(
    facts.implicitMentionKinds,
    policy.allowedImplicitMentionKinds,
  );

  const implicitMention = matchedImplicitMentionKinds.length > 0;
  const effectiveWasMentioned = facts.wasMentioned || implicitMention || shouldBypassMention;
  const shouldSkip = policy.requireMention && facts.canDetectMention && !effectiveWasMentioned;

  return {
    effectiveWasMentioned,
    shouldSkip,
    implicitMention,
    matchedImplicitMentionKinds,
    shouldBypassMention,
  };
}

// ============================================================================
// ALLOW-FROM — скопировано из OpenClaw allow-from.ts
// ============================================================================

export interface AllowList {
  entries: string[];
  hasWildcard: boolean;
  hasEntries: boolean;
}

/**
 * Проверка разрешён ли отправитель.
 * Скопировано 1:1 из OpenClaw isSenderIdAllowed.
 */
export function isSenderAllowed(
  allow: AllowList,
  senderId: string | undefined,
  allowWhenEmpty: boolean,
): boolean {
  if (!allow.hasEntries) return allowWhenEmpty;
  if (allow.hasWildcard) return true;
  if (!senderId) return false;
  return allow.entries.includes(senderId);
}

/** Создать AllowList из массива ID */
export function buildAllowList(ids: string[]): AllowList {
  return {
    entries: ids,
    hasWildcard: ids.includes("*"),
    hasEntries: ids.length > 0,
  };
}

// ============================================================================
// HELPER: implicitMentionKindWhen — из OpenClaw
// ============================================================================

export function implicitMentionKindWhen(
  kind: ImplicitMentionKind,
  enabled: boolean,
): ImplicitMentionKind[] {
  return enabled ? [kind] : [];
}
