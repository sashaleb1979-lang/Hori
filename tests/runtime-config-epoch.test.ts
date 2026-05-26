import { afterEach, describe, expect, it, vi } from "vitest";

import { loadEnv } from "@hori/config";
import { RuntimeConfigService, SlashAdminService } from "@hori/core";
import type { AppPrismaClient } from "@hori/shared";

function makeEnv() {
  return loadEnv({
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/hori",
    REDIS_URL: "redis://localhost:6379",
    LLM_PROVIDER: "openai"
  });
}

function createRuntimeSettingPrisma() {
  const store = new Map<string, { key: string; value: string; updatedBy: string | null; updatedAt: Date }>();

  const prisma = {
    runtimeSetting: {
      findMany: vi.fn(async ({ where }: { where?: { key?: { in?: string[] } } }) => {
        const keys = where?.key?.in;
        const rows = [...store.values()];
        return keys ? rows.filter((row) => keys.includes(row.key)) : rows;
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
        store.set(where.key, next);
        return next;
      }),
      deleteMany: vi.fn(async ({ where }: { where?: { key?: string } }) => {
        if (where?.key) {
          store.delete(where.key);
        } else {
          store.clear();
        }
        return { count: 1 };
      })
    }
  } as unknown as AppPrismaClient;

  return { prisma, store };
}

describe("RuntimeConfigService core epoch", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("persists and reuses the current core epoch state", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-13T10:30:00.000Z"));

    const { prisma } = createRuntimeSettingPrisma();
    const svc = new RuntimeConfigService(prisma, makeEnv());

    const first = await svc.getCoreEpochState();
    const second = await svc.getCoreEpochState();

    expect(first.epochId).toBe(second.epochId);
    expect(first.frontId).toBe(second.frontId);
    expect(prisma.runtimeSetting.upsert).toHaveBeenCalledTimes(1);
  });

  it("rotates to a requested front and can reset back to auto schedule", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-13T10:30:00.000Z"));

    const { prisma } = createRuntimeSettingPrisma();
    const svc = new RuntimeConfigService(prisma, makeEnv());

    const rotated = await svc.rotateCoreEpoch("forensic_snark", "owner-1");
    expect(rotated.frontId).toBe("forensic_snark");

    const reset = await svc.resetCoreEpoch("owner-1");
    expect(reset.epochId).toContain(reset.frontId);
    expect(reset.expiresAt.getTime()).toBeGreaterThan(reset.startedAt.getTime());
  });
});

describe("SlashAdminService runtime status", () => {
  it("includes core epoch, sleep state and current channel session in runtime status", async () => {
    const runtimeConfig = {
      getRuntimeSettings: vi.fn().mockResolvedValue({
        memoryMode: "OFF",
        relationshipGrowthMode: "FULL_AUTO",
        stylePresetMode: "manual_only",
        maxTimeoutMinutes: 15
      }),
      getCoreEpochState: vi.fn().mockResolvedValue({
        epochId: "forensic_snark:2026-05-13T10:00:00.000Z",
        frontId: "forensic_snark",
        startedAt: new Date("2026-05-13T10:00:00.000Z"),
        expiresAt: new Date("2026-05-13T12:00:00.000Z"),
        frontText: "Эпоха: forensic snark."
      })
    };
    const sessionBuffer = {
      getGuildSleepUntil: vi.fn().mockResolvedValue(new Date("2026-05-13T11:00:00.000Z")),
      getChannelSessionState: vi.fn().mockResolvedValue({
        sessionSince: new Date("2026-05-13T10:05:00.000Z"),
        lastActivityAt: new Date("2026-05-13T10:12:00.000Z"),
        compactionCount: 1,
        hasCompaction: true,
        participants: ["user-1", "user-2"],
        sleepUntil: new Date("2026-05-13T11:00:00.000Z")
      })
    };
    const admin = new SlashAdminService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      runtimeConfig as never,
      undefined,
      undefined,
      undefined,
      undefined,
      sessionBuffer as never
    );

    const status = await admin.runtimeModesStatus("guild-1", "channel-1");

    expect(status).toContain("memoryMode=OFF");
    expect(status).toContain("coreEpoch=forensic_snark until=05-13T12:00Z");
    expect(status).toContain("sleepUntil=05-13T11:00Z");
    expect(status).toContain("channelSession since=05-13T10:05Z last=05-13T10:12Z");
    expect(status).toContain("channelParticipants=2");
    expect(status).toContain("channelCompactions=1");
  });
});