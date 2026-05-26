import { describe, expect, it, vi } from "vitest";

import {
  AGGRESSION_REPLACEMENTS_SETTING_KEY,
  DEFAULT_AGGRESSION_REPLACEMENTS,
  DEFAULT_FLASH_TROLLING_CONFIG,
  DEFAULT_MEDIA_REACTION_CONFIG,
  DEFAULT_RELATIONSHIP_DELTAS,
  FLASH_TROLLING_CONFIG_SETTING_KEY,
  MEDIA_REACTION_CONFIG_SETTING_KEY,
  RELATIONSHIP_DELTAS_SETTING_KEY,
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

function makeRuntimeSettingPrisma() {
  const rows = new Map<string, { key: string; value: string; updatedBy: string | null; updatedAt: Date }>();

  const prisma = {
    runtimeSetting: {
      findMany: vi.fn(async ({ where }: { where?: { key?: { in?: string[] } } }) => {
        const keys = where?.key?.in;
        const values = [...rows.values()];
        return keys ? values.filter((row) => keys.includes(row.key)) : values;
      }),
      upsert: vi.fn(async ({ where, update, create }: {
        where: { key: string };
        update: { value: string; updatedBy: string | null; updatedAt?: Date };
        create: { key: string; value: string; updatedBy: string | null };
      }) => {
        const next = {
          key: where.key,
          value: update?.value ?? create.value,
          updatedBy: update?.updatedBy ?? create.updatedBy ?? null,
          updatedAt: update?.updatedAt ?? new Date()
        };
        rows.set(where.key, next);
        return next;
      }),
      deleteMany: vi.fn(async ({ where }: { where: { key: string } }) => {
        const existed = rows.delete(where.key);
        return { count: existed ? 1 : 0 };
      })
    }
  } as unknown as AppPrismaClient;

  return {
    prisma,
    readRow(key: string) {
      return rows.get(key) ?? null;
    }
  };
}

describe("RuntimeConfigService aggression runtime settings", () => {
  it("setRelationshipDeltas merges a partial batch with defaults and ignores non-finite values", async () => {
    const store = makeRuntimeSettingPrisma();
    const svc = new RuntimeConfigService(store.prisma, makeEnv());

    const result = await svc.setRelationshipDeltas({
      session_evaluator_a: 2,
      mod_manual: Number.NaN
    }, "owner-1");

    expect(result.session_evaluator_a).toBe(2);
    expect(result.session_evaluator_b).toBe(DEFAULT_RELATIONSHIP_DELTAS.session_evaluator_b);
    expect(result.mod_manual).toBe(DEFAULT_RELATIONSHIP_DELTAS.mod_manual);
    expect(JSON.parse(store.readRow(RELATIONSHIP_DELTAS_SETTING_KEY)?.value ?? "{}")).toMatchObject({
      session_evaluator_a: 2,
      mod_manual: 0
    });
  });

  it("setAggressionReplacementTexts merges partial updates and preserves defaults for blank fields", async () => {
    const store = makeRuntimeSettingPrisma();
    const svc = new RuntimeConfigService(store.prisma, makeEnv());

    const result = await svc.setAggressionReplacementTexts({
      stage2: "запомнила.",
      timeout: "   "
    }, "owner-2");

    expect(result).toEqual({
      ...DEFAULT_AGGRESSION_REPLACEMENTS,
      stage2: "запомнила."
    });

    const status = await svc.getAggressionReplacementTextsStatus();
    expect(status).toMatchObject({
      source: "runtime_setting",
      value: {
        ...DEFAULT_AGGRESSION_REPLACEMENTS,
        stage2: "запомнила."
      },
      updatedBy: "owner-2"
    });
    expect(store.readRow(AGGRESSION_REPLACEMENTS_SETTING_KEY)).not.toBeNull();
  });

  it("setMediaReactionConfig clamps values and persists the merged config", async () => {
    const store = makeRuntimeSettingPrisma();
    const svc = new RuntimeConfigService(store.prisma, makeEnv());

    const result = await svc.setMediaReactionConfig({
      chance: 3,
      minRelationshipScore: 9,
      cooldownSec: -5
    }, "owner-3");

    expect(result).toEqual({
      ...DEFAULT_MEDIA_REACTION_CONFIG,
      chance: 1,
      minRelationshipScore: 4,
      cooldownSec: 0
    });

    const status = await svc.getMediaReactionConfigStatus();
    expect(status).toMatchObject({
      source: "runtime_setting",
      value: {
        ...DEFAULT_MEDIA_REACTION_CONFIG,
        chance: 1,
        minRelationshipScore: 4,
        cooldownSec: 0
      },
      updatedBy: "owner-3"
    });
    expect(store.readRow(MEDIA_REACTION_CONFIG_SETTING_KEY)).not.toBeNull();
  });

  it("setFlashTrollingConfig persists a sanitized merge", async () => {
    const store = makeRuntimeSettingPrisma();
    const svc = new RuntimeConfigService(store.prisma, makeEnv());

    const result = await svc.setFlashTrollingConfig({
      enabled: true,
      intervalMinutes: 5000,
      weights: {
        question: 25
      },
      channelAllowlist: [" channel-1 ", "", "channel-1", "channel-2"]
    }, "owner-4");

    expect(result).toEqual({
      ...DEFAULT_FLASH_TROLLING_CONFIG,
      enabled: true,
      intervalMinutes: 1440,
      weights: {
        ...DEFAULT_FLASH_TROLLING_CONFIG.weights,
        question: 25
      },
      channelAllowlist: ["channel-1", "channel-2"]
    });

    const status = await svc.getFlashTrollingConfigStatus();
    expect(status).toMatchObject({
      source: "runtime_setting",
      value: {
        ...DEFAULT_FLASH_TROLLING_CONFIG,
        enabled: true,
        intervalMinutes: 1440,
        weights: {
          ...DEFAULT_FLASH_TROLLING_CONFIG.weights,
          question: 25
        },
        channelAllowlist: ["channel-1", "channel-2"]
      },
      updatedBy: "owner-4"
    });
    expect(store.readRow(FLASH_TROLLING_CONFIG_SETTING_KEY)).not.toBeNull();
  });
});