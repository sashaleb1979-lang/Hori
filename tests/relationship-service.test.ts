import { describe, expect, it } from "vitest";

import { RelationshipService } from "@hori/memory";
import type { AppPrismaClient } from "@hori/shared";

describe("RelationshipService", () => {
  it("persists vector signals across getVector calls", async () => {
    const records = new Map<string, Record<string, unknown>>();

    const prisma = {
      relationshipProfile: {
        async findUnique(args: { where: { guildId_userId: { guildId: string; userId: string } } }) {
          const key = `${args.where.guildId_userId.guildId}:${args.where.guildId_userId.userId}`;
          return (records.get(key) ?? null) as Record<string, unknown> | null;
        },
        async upsert(args: {
          where: { guildId_userId: { guildId: string; userId: string } };
          update: Record<string, unknown>;
          create: Record<string, unknown>;
        }) {
          const key = `${args.where.guildId_userId.guildId}:${args.where.guildId_userId.userId}`;
          const existing = records.get(key);
          const next = existing
            ? { ...existing, ...args.update }
            : { id: "rel_1", ...args.create, updatedAt: new Date() };
          records.set(key, next);
          return next;
        },
      },
    } as unknown as AppPrismaClient;

    const service = new RelationshipService(prisma);

    const updated = await service.recordInteraction("guild-1", "user-1", 1);
    const reloaded = await service.getVector("guild-1", "user-1");

    expect(updated.interactionCount).toBe(1);
    expect(reloaded.interactionCount).toBe(1);
    expect(reloaded.closeness).toBeCloseTo(updated.closeness, 5);
    expect(reloaded.trustLevel).toBeCloseTo(updated.trustLevel, 5);
    expect(reloaded.familiarity).toBeCloseTo(updated.familiarity, 5);
    expect(reloaded.familiarity).toBeGreaterThan(0.5);
  });
});