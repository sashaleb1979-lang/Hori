import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_RELATIONSHIP_DELTAS,
  RELATIONSHIP_DELTAS_SETTING_KEY,
  RELATIONSHIP_DELTA_LABELS_RU,
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

describe("V6 relationship deltas", () => {
  it("returns defaults when no setting persisted", async () => {
    const prisma = {
      runtimeSetting: {
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn().mockResolvedValue(null)
      }
    } as unknown as AppPrismaClient;
    const svc = new RuntimeConfigService(prisma, makeEnv());
    const deltas = await svc.getRelationshipDeltas();
    expect(deltas).toEqual(DEFAULT_RELATIONSHIP_DELTAS);
    const status = await svc.getRelationshipDeltasStatus();
    expect(status.source).toBe("default");
  });

  it("merges partial JSON override on top of defaults", async () => {
    const updatedAt = new Date("2026-05-01T10:00:00Z");
    const prisma = {
      runtimeSetting: {
        findMany: vi.fn().mockResolvedValue([
          {
            key: RELATIONSHIP_DELTAS_SETTING_KEY,
            value: JSON.stringify({ session_evaluator_v: -1.0, mod_manual: 0.25, garbage: "x" }),
            updatedBy: "owner-1",
            updatedAt
          }
        ])
      }
    } as unknown as AppPrismaClient;
    const svc = new RuntimeConfigService(prisma, makeEnv());
    const deltas = await svc.getRelationshipDeltas();
    expect(deltas.session_evaluator_v).toBe(-1.0);
    expect(deltas.mod_manual).toBe(0.25);
    expect(deltas.session_evaluator_a).toBe(DEFAULT_RELATIONSHIP_DELTAS.session_evaluator_a);
    expect("garbage" in deltas).toBe(false);
  });

  it("falls back to defaults on malformed JSON", async () => {
    const prisma = {
      runtimeSetting: {
        findMany: vi.fn().mockResolvedValue([
          { key: RELATIONSHIP_DELTAS_SETTING_KEY, value: "{not json", updatedBy: null, updatedAt: new Date() }
        ])
      }
    } as unknown as AppPrismaClient;
    const svc = new RuntimeConfigService(prisma, makeEnv());
    const deltas = await svc.getRelationshipDeltas();
    expect(deltas).toEqual(DEFAULT_RELATIONSHIP_DELTAS);
  });

  it("setRelationshipDelta upserts merged JSON and rejects non-finite", async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const prisma = {
      runtimeSetting: {
        findMany: vi.fn().mockResolvedValue([]),
        upsert
      }
    } as unknown as AppPrismaClient;
    const svc = new RuntimeConfigService(prisma, makeEnv());

    await expect(svc.setRelationshipDelta("aggression_event", Number.NaN)).rejects.toThrow();

    const next = await svc.setRelationshipDelta("aggression_event", -2.0, "owner-7");
    expect(next.aggression_event).toBe(-2.0);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { key: RELATIONSHIP_DELTAS_SETTING_KEY },
      create: expect.objectContaining({
        key: RELATIONSHIP_DELTAS_SETTING_KEY,
        updatedBy: "owner-7"
      })
    }));
  });

  it("resetRelationshipDeltas wipes runtime setting and returns defaults", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      runtimeSetting: { findMany: vi.fn().mockResolvedValue([]), deleteMany }
    } as unknown as AppPrismaClient;
    const svc = new RuntimeConfigService(prisma, makeEnv());
    const deltas = await svc.resetRelationshipDeltas();
    expect(deltas).toEqual(DEFAULT_RELATIONSHIP_DELTAS);
    expect(deleteMany).toHaveBeenCalledWith({ where: { key: RELATIONSHIP_DELTAS_SETTING_KEY } });
  });

  it("exposes RU labels for every source", () => {
    for (const key of Object.keys(DEFAULT_RELATIONSHIP_DELTAS)) {
      expect(RELATIONSHIP_DELTA_LABELS_RU[key as keyof typeof DEFAULT_RELATIONSHIP_DELTAS]).toBeDefined();
    }
  });
});
