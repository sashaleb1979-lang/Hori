import { describe, expect, it, vi } from "vitest";

import { RelationshipService } from "@hori/memory";

describe("RelationshipService.listPromptHooks", () => {
  it("returns persisted hooks when they exist", async () => {
    const prisma = {
      relationshipProfile: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn()
      },
      relationshipHook: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "hook-1",
            guildId: "guild-1",
            userId: "user-1",
            label: "profile",
            detail: "любит быстрый темп",
            useTag: "snappy",
            avoidTag: null,
            confidence: 0.9,
            freshness: "fresh"
          }
        ])
      }
    };

    const service = new RelationshipService(prisma as never);
    const hooks = await service.listPromptHooks("guild-1", "user-1", 5);

    expect(hooks).toEqual([
      {
        id: "hook-1",
        label: "profile",
        detail: "любит быстрый темп",
        useTag: "snappy",
        avoidTag: null,
        confidence: 0.9,
        freshness: "fresh"
      }
    ]);
    expect(prisma.relationshipProfile.findUnique).not.toHaveBeenCalled();
  });

  it("falls back to relationship characteristic and lastChange", async () => {
    const prisma = {
      relationshipProfile: {
        findUnique: vi.fn().mockResolvedValue({
          guildId: "guild-1",
          userId: "user-1",
          toneBias: "neutral",
          roastLevel: 1,
          praiseBias: 0,
          interruptPriority: 0,
          doNotMock: false,
          doNotInitiate: false,
          protectedTopics: [],
          relationshipState: "warm",
          relationshipScore: 0.5,
          positiveMarks: 1,
          escalationStage: 0,
          characteristic: "любит сухие и быстрые ответы",
          lastChange: "последние пару реплаев лучше без давления"
        }),
        upsert: vi.fn()
      },
      relationshipHook: {
        findMany: vi.fn().mockResolvedValue([])
      }
    };

    const service = new RelationshipService(prisma as never);
    const hooks = await service.listPromptHooks("guild-1", "user-1", 5);

    expect(hooks).toEqual([
      {
        id: "derived:characteristic:user-1",
        label: "profile",
        detail: "любит сухие и быстрые ответы",
        confidence: 0.45,
        freshness: "steady"
      },
      {
        id: "derived:lastChange:user-1",
        label: "recent",
        detail: "последние пару реплаев лучше без давления",
        confidence: 0.35,
        freshness: "fresh"
      }
    ]);
  });

  it("merges incoming prompt hooks with persisted ones and keeps the strongest set", async () => {
    const prisma = {
      relationshipProfile: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn()
      },
      relationshipHook: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "hook-1",
            guildId: "guild-1",
            userId: "user-1",
            label: "profile",
            detail: "любит быстрый темп",
            useTag: "snappy",
            avoidTag: null,
            confidence: 0.6,
            freshness: "steady"
          },
          {
            id: "hook-2",
            guildId: "guild-1",
            userId: "user-1",
            label: "habit",
            detail: "часто упирается в один тезис",
            useTag: "stubborn_claim",
            avoidTag: null,
            confidence: 0.5,
            freshness: "stale"
          }
        ]),
        deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
        createMany: vi.fn().mockResolvedValue({ count: 2 })
      }
    };

    const service = new RelationshipService(prisma as never);
    const hooks = await service.mergePromptHooks("guild-1", "user-1", [
      {
        label: "profile",
        detail: "любит очень быстрый и колкий темп",
        useTag: "snappy",
        avoidTag: null,
        confidence: 0.9,
        freshness: "fresh"
      },
      {
        label: "recent",
        detail: "последние сцены лучше не давить до стены",
        useTag: "pressure",
        avoidTag: "pile_on",
        confidence: 0.7,
        freshness: "fresh"
      }
    ]);

    expect(hooks).toHaveLength(3);
    expect(hooks[0]).toMatchObject({
      label: "profile",
      detail: "любит очень быстрый и колкий темп",
      confidence: 0.9,
      freshness: "fresh"
    });
    expect(prisma.relationshipHook.deleteMany).toHaveBeenCalledWith({ where: { guildId: "guild-1", userId: "user-1" } });
    expect(prisma.relationshipHook.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ label: "profile" }),
          expect.objectContaining({ label: "recent" })
        ])
      })
    );
  });
});