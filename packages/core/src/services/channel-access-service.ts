/**
 * V6 Phase H: Channel access matrix.
 *
 * 4 режима для канала:
 *  - `default`  — стандартная логика (отвечает на mention + по триггерам).
 *  - `muted`    — отвечает ТОЛЬКО на explicit mention; никаких proactive/flash.
 *  - `active`   — повышенная инициативность (для приоритетных каналов).
 *  - `ignored`  — бот игнорирует канал полностью.
 *
 * Конфигурация — Map channelId → mode. Хранится в RuntimeSetting JSON
 * (см. CHANNEL_ACCESS_SETTING_KEY в RuntimeConfigService).
 */

export type ChannelAccessRuleMode = "default" | "muted" | "active" | "ignored";

export const CHANNEL_ACCESS_MODES: ReadonlyArray<ChannelAccessRuleMode> = [
  "default",
  "muted",
  "active",
  "ignored"
];

export interface ChannelAccessRule {
  channelId: string;
  mode: ChannelAccessRuleMode;
}

export interface ChannelAccessDecision {
  mode: ChannelAccessRuleMode;
  allowed: boolean;
  requiresMention: boolean;
  proactivityBoost: boolean;
}

export class ChannelAccessService {
  private readonly rules: Map<string, ChannelAccessRuleMode> = new Map();

  constructor(rules: ReadonlyArray<ChannelAccessRule> = []) {
    for (const rule of rules) {
      this.rules.set(rule.channelId, rule.mode);
    }
  }

  setRule(channelId: string, mode: ChannelAccessRuleMode): void {
    this.rules.set(channelId, mode);
  }

  removeRule(channelId: string): void {
    this.rules.delete(channelId);
  }

  list(): ChannelAccessRule[] {
    return Array.from(this.rules.entries()).map(([channelId, mode]) => ({ channelId, mode }));
  }

  getMode(channelId: string): ChannelAccessRuleMode {
    return this.rules.get(channelId) ?? "default";
  }

  evaluate(channelId: string, options: { isExplicitMention?: boolean } = {}): ChannelAccessDecision {
    const mode = this.getMode(channelId);
    if (mode === "ignored") {
      return { mode, allowed: false, requiresMention: true, proactivityBoost: false };
    }
    if (mode === "muted") {
      return {
        mode,
        allowed: !!options.isExplicitMention,
        requiresMention: true,
        proactivityBoost: false
      };
    }
    if (mode === "active") {
      return { mode, allowed: true, requiresMention: false, proactivityBoost: true };
    }
    return { mode: "default", allowed: true, requiresMention: false, proactivityBoost: false };
  }
}

export function isChannelAccessRuleMode(value: unknown): value is ChannelAccessRuleMode {
  return typeof value === "string" && (CHANNEL_ACCESS_MODES as ReadonlyArray<string>).includes(value);
}
