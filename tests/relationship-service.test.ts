import { afterEach, describe, expect, it, vi } from "vitest";

import { RelationshipService } from "@hori/memory";
import type { AppPrismaClient } from "@hori/shared";

function makeInMemoryPrisma() {
  const records = new Map<string, Record<string, unknown>>();
  return {
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
}

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

  it("derives live overlay tone from stored vector signals", async () => {
    const prisma = {
      relationshipProfile: {
        async findUnique() {
          return {
            id: "rel_1",
            guildId: "guild-1",
            userId: "user-1",
            toneBias: "neutral",
            roastLevel: 1,
            praiseBias: 0,
            interruptPriority: 0,
            doNotMock: false,
            doNotInitiate: false,
            protectedTopics: [],
            closeness: 0.82,
            trustLevel: 0.79,
            familiarity: 0.88,
            interactionCount: 14,
            proactivityPreference: 0.76,
            topicBoundaries: {},
          };
        },
        async upsert() {
          throw new Error("not used");
        },
      },
    } as unknown as AppPrismaClient;

    const service = new RelationshipService(prisma);
    const relationship = await service.getRelationship("guild-1", "user-1");

    expect(relationship?.toneBias).toBe("friendly");
    expect(relationship?.praiseBias).toBeGreaterThan(0);
    expect(relationship?.interruptPriority).toBeGreaterThan(0);
  });

  it("V6 level API: setLevel maps integer to relationshipState and getLevel reads it back", async () => {
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

    // default
    expect(await service.getLevel("g", "u")).toBe(0);

    // each integer level −1..4
    for (const level of [-1, 0, 1, 2, 3, 4]) {
      await service.setLevel("g", "u", level);
      expect(await service.getLevel("g", "u")).toBe(level);
    }

    // out-of-range clamps; below 0 rounds floor.
    await service.setLevel("g", "u", -5);
    expect(await service.getLevel("g", "u")).toBe(-1);
    await service.setLevel("g", "u", 99);
    expect(await service.getLevel("g", "u")).toBe(4);
    await service.setLevel("g", "u", -0.4);
    expect(await service.getLevel("g", "u")).toBe(-1);
    await service.setLevel("g", "u", 1.9);
    expect(await service.getLevel("g", "u")).toBe(1);
  });

  describe("V6 Phase B: aggression decay invariants", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("Stage 4 timeout → escalationStage drops to 3 immediately", async () => {
      const service = new RelationshipService(makeInMemoryPrisma());
      // simulate Stage 4: 4 markers → currentStage=4
      for (let i = 0; i < 4; i++) {
        await service.noteAggressionMarker("g", "u");
      }
      const before = await service.getVector("g", "u");
      expect(before.escalationStage).toBe(4);

      const after = await service.confirmAggression("g", "u", { timedOut: true });
      // immediate post-timeout drop to 3
      expect(after.escalationStage).toBe(3);
      expect(after.relationshipState).toBe("cold_lowest");
      expect(after.relationshipScore).toBe(-1);
      expect(after.coldPermanent).toBe(true);
    });

    it("After 24h post-aggressive escalation decays from 3 → 2 (not 0)", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-05-10T10:00:00Z"));

      const service = new RelationshipService(makeInMemoryPrisma());
      for (let i = 0; i < 4; i++) {
        await service.noteAggressionMarker("g", "u");
      }
      await service.confirmAggression("g", "u", { timedOut: true });
      // now stage=3, escalationUpdatedAt = 2026-05-10T10:00Z

      vi.setSystemTime(new Date("2026-05-11T10:30:00Z")); // +24.5h
      const decayed = await service.getVector("g", "u");
      expect(decayed.escalationStage).toBe(2);
      // cold_lowest persists, coldPermanent stays
      expect(decayed.relationshipState).toBe("cold_lowest");
      expect(decayed.coldPermanent).toBe(true);
    });

    it("Stage 1 (warning only, no aggression confirm) → full reset to 0 after 24h", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-05-10T10:00:00Z"));

      const service = new RelationshipService(makeInMemoryPrisma());
      await service.noteAggressionMarker("g", "u"); // stage=1
      const stage1 = await service.getVector("g", "u");
      expect(stage1.escalationStage).toBe(1);
      expect(stage1.coldPermanent).toBe(false);

      vi.setSystemTime(new Date("2026-05-11T11:00:00Z")); // +25h
      const decayed = await service.getVector("g", "u");
      expect(decayed.escalationStage).toBe(0);
    });

    it("Recovery (score from negative → 0+) clears escalation and coldPermanent", async () => {
      const service = new RelationshipService(makeInMemoryPrisma());
      for (let i = 0; i < 4; i++) {
        await service.noteAggressionMarker("g", "u");
      }
      await service.confirmAggression("g", "u", { timedOut: true });
      const cold = await service.getVector("g", "u");
      expect(cold.relationshipScore).toBe(-1);
      expect(cold.coldPermanent).toBe(true);

      // 3 successive A verdicts: each +0.5 / 2 marks. Need score to cross from -1 to ≥0.
      // applySessionVerdict A: positiveMarks +1; at 2 marks → score +=0.5; reset.
      // To go -1 → 0, we need +1.0 = 2 cycles of (A,A). So 4 A verdicts.
      for (let i = 0; i < 4; i++) {
        await service.applySessionVerdict("g", "u", "A");
      }
      const recovered = await service.getVector("g", "u");
      expect(recovered.relationshipScore).toBeGreaterThanOrEqual(0);
      expect(recovered.coldPermanent).toBe(false);
      expect(recovered.escalationStage).toBe(0);
      expect(recovered.relationshipState).not.toBe("cold_lowest");
    });
  });
});