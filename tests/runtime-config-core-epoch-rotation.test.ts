import { describe, expect, it, vi } from "vitest";

import { RuntimeConfigService } from "@hori/core";
import { loadEnv } from "@hori/config";
import type { AppPrismaClient } from "@hori/shared";

function makeEnv() {
  return loadEnv({
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/hori",
    REDIS_URL: "redis://localhost:6379",
    LLM_PROVIDER: "openai"
  });
}

function createRuntimeSettingsPrisma() {
  const store = new Map<string, { value: string; updatedBy: string | null; updatedAt: Date }>();

  const runtimeSetting = {
    findMany: vi.fn(async ({ where }: { where?: { key?: { in?: string[] } } }) => {
      const keys = where?.key?.in;
      if (!keys) {
        return [...store.entries()].map(([key, row]) => ({ key, ...row }));
      }

      return keys.flatMap((key) => {
        const row = store.get(key);
        return row ? [{ key, ...row }] : [];
      });
    }),
    upsert: vi.fn(async ({ where, update, create }: {
      where: { key: string };
      update?: { value: string; updatedBy: string | null };
      create: { value: string; updatedBy: string | null };
    }) => {
      const next = {
        value: update?.value ?? create.value,
        updatedBy: update?.updatedBy ?? create.updatedBy ?? null,
        updatedAt: new Date("2026-05-26T12:00:00.000Z")
      };
      store.set(where.key, next);
      return { key: where.key, ...next };
    }),
    deleteMany: vi.fn(async ({ where }: { where?: { key?: string } }) => {
      if (where?.key) {
        return { count: store.delete(where.key) ? 1 : 0 };
      }

      const count = store.size;
      store.clear();
      return { count };
    })
  };

  return {
    prisma: {
      runtimeSetting
    } as unknown as AppPrismaClient,
    store
  };
}

describe("RuntimeConfigService core epoch rotation config", () => {
  it("returns the built-in front catalog and default frequency when no overrides exist", async () => {
    const { prisma } = createRuntimeSettingsPrisma();
    const service = new RuntimeConfigService(prisma, makeEnv());

    const status = await service.getCoreEpochRotationStatus(new Date("2026-05-26T10:00:00.000Z"));

    expect(status.durationMinutes).toBe(120);
    expect(status.durationSource).toBe("default");
    expect(status.activeFrontId).toBe("dry_echo");
    expect(status.fronts.map((front) => front.id)).toEqual([
      "dry_echo",
      "low_voltage",
      "forensic_snark",
      "quiet_paranoia"
    ]);
    expect(status.fronts.every((front) => front.enabled)).toBe(true);
  });

  it("supports custom fronts and applies rotation duration immediately", async () => {
    const { prisma } = createRuntimeSettingsPrisma();
    const service = new RuntimeConfigService(prisma, makeEnv());

    const custom = await service.upsertCoreEpochFront({
      label: "Ночная ирония",
      content: "Эпоха: ночная ирония. Сухо, поздно и чуть язвительнее обычного."
    }, "owner-1");

    const fronts = await service.listCoreEpochFronts();
    for (const front of fronts) {
      if (front.builtIn) {
        await service.setCoreEpochFrontEnabled(front.id, false, "owner-1");
      }
    }

    const rotation = await service.setCoreEpochDurationMinutes(45, "owner-1");
    const state = await service.rotateCoreEpoch(custom.id, "owner-1");

    expect(rotation.durationMinutes).toBe(45);
    expect(rotation.durationSource).toBe("runtime_setting");
    expect(rotation.fronts.find((front) => front.id === custom.id)).toMatchObject({
      label: "Ночная ирония",
      enabled: true,
      builtIn: false,
      source: "runtime_setting"
    });
    expect(state.frontId).toBe(custom.id);
    expect(state.frontText).toContain("ночная ирония");
    expect(state.expiresAt.getTime() - state.startedAt.getTime()).toBe(45 * 60 * 1000);
  });

  it("rejects disabling the last enabled front", async () => {
    const { prisma } = createRuntimeSettingsPrisma();
    const service = new RuntimeConfigService(prisma, makeEnv());

    const fronts = await service.listCoreEpochFronts();
    for (const front of fronts.slice(0, fronts.length - 1)) {
      await service.setCoreEpochFrontEnabled(front.id, false, "owner-1");
    }

    await expect(service.setCoreEpochFrontEnabled(fronts[fronts.length - 1]!.id, false, "owner-1"))
      .rejects
      .toThrow("хотя бы один включённый core front");
  });
});