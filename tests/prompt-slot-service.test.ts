import { describe, expect, it } from "vitest";

import { PromptSlotService, SLOT_ACTIVE_WINDOW_MS, SLOT_COOLDOWN_MS } from "@hori/memory";
import type { AppPrismaClient } from "@hori/shared";

interface SlotRow {
  id: string;
  guildId: string;
  channelId: string | null;
  ownerUserId: string;
  ownerLevel: number;
  title: string | null;
  content: string;
  activatedAt: Date | null;
  cooldownUntil: Date | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function makePrisma() {
  const rows: SlotRow[] = [];
  let counter = 1;
  return {
    rows,
    prisma: {
      horiPromptSlot: {
        async findMany(args: any) {
          const w = args.where ?? {};
          return rows.filter((r) => {
            if (w.guildId && r.guildId !== w.guildId) return false;
            if (typeof w.active === "boolean" && r.active !== w.active) return false;
            if (w.NOT?.id && r.id === w.NOT.id) return false;
            if (w.OR) {
              const okOR = (w.OR as any[]).some((cond) => {
                if ("channelId" in cond) return r.channelId === cond.channelId;
                return false;
              });
              if (!okOR) return false;
            }
            return true;
          });
        },
        async findUnique(args: any) {
          return rows.find((r) => r.id === args.where.id) ?? null;
        },
        async create(args: any) {
          const now = new Date();
          const row: SlotRow = {
            id: `slot_${counter++}`,
            guildId: args.data.guildId,
            channelId: args.data.channelId ?? null,
            ownerUserId: args.data.ownerUserId,
            ownerLevel: args.data.ownerLevel,
            title: args.data.title ?? null,
            content: args.data.content,
            activatedAt: null,
            cooldownUntil: null,
            active: false,
            createdAt: now,
            updatedAt: now
          };
          rows.push(row);
          return row;
        },
        async update(args: any) {
          const r = rows.find((row) => row.id === args.where.id);
          if (!r) throw new Error("not found");
          Object.assign(r, args.data, { updatedAt: new Date() });
          return r;
        },
        async updateMany() {
          return { count: 0 };
        },
        async delete(args: any) {
          const idx = rows.findIndex((row) => row.id === args.where.id);
          const r = rows[idx];
          rows.splice(idx, 1);
          return r;
        }
      }
    } as unknown as AppPrismaClient
  };
}

describe("V6 Phase E: PromptSlotService", () => {
  it("activates a slot and exposes 10-min active window + 6h cooldown", async () => {
    const { prisma } = makePrisma();
    const svc = new PromptSlotService(prisma);
    const slot = await svc.create({
      guildId: "g",
      channelId: "c",
      ownerUserId: "owner-1",
      ownerLevel: 2,
      content: "hello"
    });
    const activated = await svc.activate(slot.id);
    expect(activated.active).toBe(true);
    expect(activated.activatedAt).toBeInstanceOf(Date);

    const active = await svc.getActiveSlot("g", "c");
    expect(active?.id).toBe(slot.id);

    // Far past active window → auto-deactivates.
    const expired = await svc.getActiveSlot("g", "c", new Date(activated.activatedAt!.getTime() + SLOT_ACTIVE_WINDOW_MS + 1000));
    expect(expired).toBeNull();

    // Constants sanity
    expect(SLOT_ACTIVE_WINDOW_MS).toBe(10 * 60 * 1000);
    expect(SLOT_COOLDOWN_MS).toBe(6 * 60 * 60 * 1000);
  });

  it("preempting another user's slot requires initiatorLevel >= ownerLevel", async () => {
    const { prisma } = makePrisma();
    const svc = new PromptSlotService(prisma);
    const a = await svc.create({ guildId: "g", channelId: "c", ownerUserId: "u-A", ownerLevel: 3, content: "A" });
    await svc.activate(a.id);
    const b = await svc.create({ guildId: "g", channelId: "c", ownerUserId: "u-B", ownerLevel: 1, content: "B" });
    await expect(svc.activate(b.id, { initiatorLevel: 1 })).rejects.toThrow(/cannot preempt/);
    const c = await svc.create({ guildId: "g", channelId: "c", ownerUserId: "u-C", ownerLevel: 4, content: "C" });
    const activated = await svc.activate(c.id, { initiatorLevel: 4 });
    expect(activated.active).toBe(true);
  });
});
