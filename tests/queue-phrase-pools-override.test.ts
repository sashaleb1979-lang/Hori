import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_QUEUE_PHRASE_POOLS,
  QueuePhrasePoolService,
  QUEUE_PHRASE_POOLS_SETTING_KEY,
  RuntimeConfigService
} from "@hori/core";
import { loadEnv } from "@hori/config";
import type { AppPrismaClient } from "@hori/shared";

function makeEnv() {
  return loadEnv({
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/hori",
    REDIS_URL: "redis://localhost:6379",
    LLM_PROVIDER: "openai"
  });
}

describe("V6 Phase F: QueuePhrasePoolService panel-tunability", () => {
  it("DEFAULT_QUEUE_PHRASE_POOLS exposes 6 buckets non-empty", () => {
    for (const stage of ["initial", "followup"] as const) {
      for (const bucket of ["warm", "neutral", "cold"] as const) {
        expect(DEFAULT_QUEUE_PHRASE_POOLS[stage][bucket].length).toBeGreaterThan(0);
      }
    }
  });

  it("setPools merges partial override and clears anti-repeat cache", () => {
    const svc = new QueuePhrasePoolService();
    svc.setPools({ initial: { cold: ["custom-cold-A", "custom-cold-B"] } });
    const pools = svc.getPools();
    expect(pools.initial.cold).toEqual(["custom-cold-A", "custom-cold-B"]);
    // other buckets unchanged
    expect(pools.initial.warm.length).toBe(DEFAULT_QUEUE_PHRASE_POOLS.initial.warm.length);
    expect(pools.followup.warm.length).toBe(DEFAULT_QUEUE_PHRASE_POOLS.followup.warm.length);

    const pick = svc.pickPhrase({ guildId: "g", userId: "u", score: -1, stage: "initial" });
    expect(["custom-cold-A", "custom-cold-B"]).toContain(pick);
  });

  it("setPools filters empty / non-string entries", () => {
    const svc = new QueuePhrasePoolService();
    svc.setPools({ initial: { warm: ["ok", "  ", "" as string, 5 as unknown as string] } });
    expect(svc.getPools().initial.warm).toEqual(["ok"]);
  });

  it("score routing maps to correct bucket", () => {
    const svc = new QueuePhrasePoolService({
      initial: { warm: ["W"], neutral: ["N"], cold: ["C"] },
      followup: { warm: ["fW"], neutral: ["fN"], cold: ["fC"] }
    });
    expect(svc.pickPhrase({ guildId: "g", userId: "u", score: 2, stage: "initial" })).toBe("W");
    expect(svc.pickPhrase({ guildId: "g", userId: "u", score: 0, stage: "initial" })).toBe("N");
    expect(svc.pickPhrase({ guildId: "g", userId: "u", score: -0.5, stage: "initial" })).toBe("C");
    expect(svc.pickPhrase({ guildId: "g", userId: "u", score: 4, stage: "followup" })).toBe("fW");
  });
});

describe("V6 Phase F: RuntimeConfigService queue pool override", () => {
  it("returns null when not set", async () => {
    const prisma = {
      runtimeSetting: { findMany: vi.fn().mockResolvedValue([]) }
    } as unknown as AppPrismaClient;
    const svc = new RuntimeConfigService(prisma, makeEnv());
    expect(await svc.getQueuePhrasePoolsOverride()).toBeNull();
  });

  it("parses & sanitizes JSON override (drops empty arrays / wrong types)", async () => {
    const prisma = {
      runtimeSetting: {
        findMany: vi.fn().mockResolvedValue([
          {
            key: QUEUE_PHRASE_POOLS_SETTING_KEY,
            value: JSON.stringify({
              initial: { warm: ["a", "b"], neutral: [], cold: [123, "ok"] },
              followup: { warm: "wrong" },
              garbage: { warm: ["x"] }
            }),
            updatedBy: null,
            updatedAt: new Date()
          }
        ])
      }
    } as unknown as AppPrismaClient;
    const svc = new RuntimeConfigService(prisma, makeEnv());
    const result = await svc.getQueuePhrasePoolsOverride();
    expect(result).toEqual({
      initial: { warm: ["a", "b"], cold: ["ok"] }
    });
  });

  it("setQueuePhrasePoolsOverride upserts sanitized payload", async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const prisma = {
      runtimeSetting: { findMany: vi.fn().mockResolvedValue([]), upsert }
    } as unknown as AppPrismaClient;
    const svc = new RuntimeConfigService(prisma, makeEnv());
    const out = await svc.setQueuePhrasePoolsOverride(
      { initial: { warm: ["one", " "] } },
      "owner-1"
    );
    expect(out).toEqual({ initial: { warm: ["one"] } });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { key: QUEUE_PHRASE_POOLS_SETTING_KEY }
    }));
  });
});
