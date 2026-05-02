/**
 * V5.1 Phase B: Prompt-Slot Service
 *
 * Prompt-слоты заменяют user memory cards:
 *  - Владелец создаёт слот с коротким контекстом или инструкцией.
 *  - При активации слот активен 10 минут.
 *  - После окончания активного окна — 6 часов cooldown.
 *  - В каждый момент в канале активен максимум один слот:
 *    приоритет channel-specific > global; среди равных — самый свежий.
 *  - ownerLevel (снэпшот уровня отношений владельца на момент активации)
 *    используется для разрешения конфликтов: только пользователь
 *    с уровнем ≥ ownerLevel может перебить чужой активный слот.
 *
 * Команды бота и UI добавляются отдельной итерацией.
 */

import type { AppPrismaClient } from "@hori/shared";

export const SLOT_ACTIVE_WINDOW_MS = 10 * 60 * 1000;
export const SLOT_COOLDOWN_MS = 6 * 60 * 60 * 1000;

/** Максимум активных слотов по уровню отношений (-1..4). */
export const SLOT_LIMITS_BY_LEVEL: Record<number, number> = {
  [-1]: 0,
  0: 2,
  1: 3,
  2: 4,
  3: 5,
  4: 6
};

export interface PromptSlotRecord {
  id: string;
  guildId: string;
  channelId: string | null;
  ownerUserId: string;
  ownerLevel: number;
  title: string | null;
  content: string;
  trigger: string | null;
  activatedAt: Date | null;
  cooldownUntil: Date | null;
  active: boolean;
  strength: number;
  lastDeactivatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface CreateSlotInput {
  guildId: string;
  channelId?: string | null;
  ownerUserId: string;
  ownerLevel: number;
  title?: string | null;
  content: string;
  trigger?: string | null;
}

interface ActivateSlotOptions {
  /** Уровень пользователя, инициирующего активацию (для перебивания чужих слотов). */
  initiatorLevel?: number;
  /** Если true — игнорирует cooldown (например, для админ-команды). */
  forceIgnoreCooldown?: boolean;
}

export class PromptSlotService {
  constructor(private readonly prisma: AppPrismaClient) {}

  private get slots() {
    return (this.prisma as unknown as {
      horiPromptSlot: {
        findMany(args: unknown): Promise<PromptSlotRecord[]>;
        findUnique(args: unknown): Promise<PromptSlotRecord | null>;
        findFirst(args: unknown): Promise<PromptSlotRecord | null>;
        create(args: unknown): Promise<PromptSlotRecord>;
        update(args: unknown): Promise<PromptSlotRecord>;
        updateMany(args: unknown): Promise<{ count: number }>;
        delete(args: unknown): Promise<PromptSlotRecord>;
      };
    }).horiPromptSlot;
  }

  /** Создать слот (без автоактивации). */
  async create(input: CreateSlotInput): Promise<PromptSlotRecord> {
    const content = input.content.trim();
    if (!content) {
      throw new Error("PromptSlot.content is empty");
    }
    return this.slots.create({
      data: {
        guildId: input.guildId,
        channelId: input.channelId ?? null,
        ownerUserId: input.ownerUserId,
        ownerLevel: input.ownerLevel,
        title: input.title ?? null,
        content,
        trigger: input.trigger ? input.trigger.trim().toLowerCase() : null
      }
    });
  }

  /**
   * Получить активный слот для канала.
   * Приоритет: channel-specific (channelId=channel) > global (channelId=null).
   * Если активный слот истёк по 10-минутному окну — он автоматически
   * деактивируется и cooldown выставляется на 6 часов.
   */
  async getActiveSlot(guildId: string, channelId: string, now: Date = new Date()): Promise<PromptSlotRecord | null> {
    const candidates = await this.slots.findMany({
      where: {
        guildId,
        active: true,
        OR: [{ channelId }, { channelId: null }]
      },
      orderBy: [{ activatedAt: "desc" }]
    });

    if (!candidates.length) return null;

    // Сортировка: channel-specific впереди global, дальше — по activatedAt desc.
    const sorted = [...candidates].sort((a, b) => {
      if (a.channelId !== null && b.channelId === null) return -1;
      if (a.channelId === null && b.channelId !== null) return 1;
      const aTs = a.activatedAt?.getTime() ?? 0;
      const bTs = b.activatedAt?.getTime() ?? 0;
      return bTs - aTs;
    });

    for (const slot of sorted) {
      if (!slot.activatedAt) continue;
      const expiresAt = slot.activatedAt.getTime() + SLOT_ACTIVE_WINDOW_MS;
      if (now.getTime() <= expiresAt) {
        return slot;
      }
      // Истёк — переводим в cooldown.
      await this.deactivate(slot.id, now);
    }
    return null;
  }

  /** Активировать слот. Проверяет cooldown и (если есть активный чужой слот) уровень инициатора. */
  async activate(slotId: string, options: ActivateSlotOptions = {}): Promise<PromptSlotRecord> {
    const now = new Date();
    const slot = await this.slots.findUnique({ where: { id: slotId } });
    if (!slot) {
      throw new Error(`PromptSlot ${slotId} not found`);
    }

    if (!options.forceIgnoreCooldown && slot.cooldownUntil && slot.cooldownUntil > now) {
      throw new Error(
        `PromptSlot ${slotId} is on cooldown until ${slot.cooldownUntil.toISOString()}`
      );
    }

    // Перебивание чужого активного слота (в том же канале или global) — только при initiatorLevel >= ownerLevel.
    const conflicting = await this.slots.findMany({
      where: {
        guildId: slot.guildId,
        active: true,
        OR: [{ channelId: slot.channelId ?? null }, { channelId: null }],
        NOT: { id: slot.id }
      }
    });
    for (const other of conflicting) {
      if (other.ownerUserId === slot.ownerUserId) {
        // Свой слот — деактивируем без проверки уровня.
        await this.deactivate(other.id, now);
        continue;
      }
      const initiatorLevel = options.initiatorLevel ?? slot.ownerLevel;
      if (initiatorLevel < other.ownerLevel) {
        throw new Error(
          `PromptSlot ${slotId} cannot preempt slot ${other.id}: initiator level ${initiatorLevel} < owner level ${other.ownerLevel}`
        );
      }
      await this.deactivate(other.id, now);
    }

    return this.slots.update({
      where: { id: slotId },
      data: {
        active: true,
        activatedAt: now,
        cooldownUntil: null
      }
    });
  }

  /** Деактивировать слот: active=false, cooldown=now+6h, lastDeactivatedAt=now. */
  async deactivate(slotId: string, now: Date = new Date()): Promise<PromptSlotRecord> {
    return this.slots.update({
      where: { id: slotId },
      data: {
        active: false,
        cooldownUntil: new Date(now.getTime() + SLOT_COOLDOWN_MS),
        lastDeactivatedAt: now
      }
    });
  }

  async listForOwner(guildId: string, ownerUserId: string): Promise<PromptSlotRecord[]> {
    return this.slots.findMany({
      where: { guildId, ownerUserId },
      orderBy: [{ updatedAt: "desc" }]
    });
  }

  async delete(slotId: string): Promise<void> {
    await this.slots.delete({ where: { id: slotId } });
  }

  /** Удалить все слоты пользователя на сервере. */
  async deleteAllForUser(guildId: string, userId: string): Promise<number> {
    const all = await this.slots.findMany({ where: { guildId, ownerUserId: userId } });
    for (const s of all) {
      await this.slots.delete({ where: { id: s.id } });
    }
    return all.length;
  }

  /** Получить лимит слотов по уровню отношений. */
  getLimit(level: number): number {
    const clamped = Math.max(-1, Math.min(4, Math.round(level)));
    return SLOT_LIMITS_BY_LEVEL[clamped] ?? 2;
  }

  /** Проверить, может ли пользователь создать ещё один слот. */
  async canCreate(guildId: string, userId: string, level: number): Promise<boolean> {
    const limit = this.getLimit(level);
    if (limit <= 0) return false;
    const existing = await this.slots.findMany({ where: { guildId, ownerUserId: userId } });
    return existing.length < limit;
  }

  /** Принудительно активировать слот (игнорирует cooldown и preemption). */
  async forceActivate(slotId: string): Promise<PromptSlotRecord> {
    return this.activate(slotId, { forceIgnoreCooldown: true, initiatorLevel: 999 });
  }

  /** Обновить силу слота (0=слабый, 1=обычный, 2=жёсткий). */
  async setStrength(slotId: string, strength: 0 | 1 | 2): Promise<PromptSlotRecord> {
    return this.slots.update({
      where: { id: slotId },
      data: { strength }
    });
  }

  /** Обновить содержимое и/или название слота. */
  async updateContent(slotId: string, content: string, title?: string | null): Promise<PromptSlotRecord> {
    const trimmed = content.trim();
    if (!trimmed) {
      throw new Error("PromptSlot.content is empty");
    }
    return this.slots.update({
      where: { id: slotId },
      data: {
        content: trimmed,
        ...(title !== undefined ? { title } : {})
      }
    });
  }

  /**
   * Найти слот пользователя, чей trigger встречается в тексте сообщения.
   * Слот должен быть не активным и не на cooldown.
   * Совпадение — case-insensitive, без учёта границ слова (trigger может быть
   * любой подстрокой или фразой).
   */
  async findByTriggerInMessage(
    guildId: string,
    userId: string,
    messageContent: string
  ): Promise<PromptSlotRecord | null> {
    const now = new Date();
    const candidates = await this.slots.findMany({
      where: {
        guildId,
        ownerUserId: userId,
        active: false,
        trigger: { not: null }
      }
    });
    const lowerContent = messageContent.toLowerCase();
    for (const slot of candidates) {
      if (!slot.trigger) continue;
      if (slot.cooldownUntil && slot.cooldownUntil > now) continue;
      if (lowerContent.includes(slot.trigger)) return slot;
    }
    return null;
  }
}
