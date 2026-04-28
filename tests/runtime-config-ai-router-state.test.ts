import { describe, expect, it, vi } from "vitest";

import { loadEnv } from "@hori/config";
import { createEmptyAiRouterState } from "@hori/llm";
import type { AppPrismaClient } from "@hori/shared";

import {
  AI_ROUTER_STATE_SETTING_KEY,
  PREFERRED_CHAT_PROVIDER_SETTING_KEY,
  RuntimeConfigService
} from "../packages/core/src/services/runtime-config-service";

describe("RuntimeConfigService ai router state", () => {
  it("returns empty state when runtime setting is missing or invalid", async () => {
    const missingState = createPrisma([]);
    const invalidState = createPrisma([
      { key: AI_ROUTER_STATE_SETTING_KEY, value: "{not-json", updatedBy: null, updatedAt: new Date() }
    ]);
    const serviceMissing = new RuntimeConfigService(missingState.prisma, createEnv());
    const serviceInvalid = new RuntimeConfigService(invalidState.prisma, createEnv());

    const missing = await serviceMissing.getAiRouterState();
    expect(missing.providers).toEqual({});
    expect(missing.recentRoutes).toEqual([]);
    expect(typeof missing.updatedAt).toBe("string");

    const invalid = await serviceInvalid.getAiRouterState();
    expect(invalid.providers).toEqual({});
    expect(invalid.recentRoutes).toEqual([]);
    expect(typeof invalid.updatedAt).toBe("string");
  });

  it("persists ai router state without invalidating routing cache", async () => {
    const prismaState = createPrisma([]);
    const service = new RuntimeConfigService(prismaState.prisma, createEnv());
    const invalidateSpy = vi.spyOn(service, "invalidate");
    const state = {
      providers: {
        gemini: {
          fallbackCount: 1,
          models: {
            "gemini-2.5-flash": {
              requestsToday: 7,
              recentFailureCount: 0,
              cooldownUntil: undefined,
              windowKey: "2026-04-21"
            }
          }
        }
      },
      recentRoutes: [],
      updatedAt: "2026-04-21T10:00:00.000Z"
    };

    await service.setAiRouterState(state, "owner-1");

    expect(prismaState.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaState.tx.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("FOR UPDATE"),
      AI_ROUTER_STATE_SETTING_KEY
    );
    expect(prismaState.tx.runtimeSetting.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { key: AI_ROUTER_STATE_SETTING_KEY },
      data: expect.objectContaining({
        updatedBy: "owner-1"
      })
    }));

    const storedValue = prismaState.tx.runtimeSetting.update.mock.calls[0]?.[0]?.data?.value;
    expect(JSON.parse(storedValue)).toEqual({
      providers: {
        gemini: {
          fallbackCount: 1,
          models: {
            "gemini-2.5-flash": {
              requestsToday: 7,
              windowKey: "2026-04-21",
              recentFailureCount: 0,
              reservations: {}
            }
          }
        }
      },
      recentRoutes: [],
      updatedAt: "2026-04-21T10:00:00.000Z"
    });
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("updates ai router state from current persisted JSON", async () => {
    const current = {
      providers: {},
      recentRoutes: [{ requestId: "req-1", provider: "gemini", model: "gemini-2.5-flash", timestamp: "2026-04-21T10:00:00.000Z", fallbackDepth: 0, routedFrom: [], success: true }],
      updatedAt: "2026-04-21T10:00:00.000Z"
    };
    const prismaState = createPrisma([
      { key: AI_ROUTER_STATE_SETTING_KEY, value: JSON.stringify(current), updatedBy: null, updatedAt: new Date() }
    ]);
    const service = new RuntimeConfigService(prismaState.prisma, createEnv());

    const next = await service.updateAiRouterState((state) => ({
      ...state,
      recentRoutes: [...state.recentRoutes, { requestId: "req-2", provider: "cloudflare", model: "@cf/zai-org/glm-4.7-flash", timestamp: "2026-04-21T10:05:00.000Z", fallbackDepth: 1, routedFrom: ["gemini:gemini-2.5-flash"], success: true }],
      updatedAt: "2026-04-21T10:05:00.000Z"
    }));

    expect(next.recentRoutes).toHaveLength(2);
    expect(next.recentRoutes[1]?.provider).toBe("cloudflare");
    expect(prismaState.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaState.tx.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("FOR UPDATE"),
      AI_ROUTER_STATE_SETTING_KEY
    );
    expect(prismaState.tx.runtimeSetting.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        value: JSON.stringify(next)
      })
    }));
  });

  it("stores and resets preferred chat provider", async () => {
    const prismaState = createPrisma([]);
    const service = new RuntimeConfigService(prismaState.prisma, createEnv());

    const status = await service.setPreferredChatProvider("openai", "owner-1");

    expect(status).toMatchObject({
      value: "openai",
      source: "runtime_setting",
      updatedBy: "owner-1"
    });
    expect(prismaState.runtimeSetting.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { key: PREFERRED_CHAT_PROVIDER_SETTING_KEY },
      create: expect.objectContaining({
        key: PREFERRED_CHAT_PROVIDER_SETTING_KEY,
        value: "openai"
      })
    }));

    const reset = await service.resetPreferredChatProvider();
    expect(reset).toEqual({ value: "auto", source: "default" });
    expect(prismaState.runtimeSetting.deleteMany).toHaveBeenCalledWith({
      where: { key: PREFERRED_CHAT_PROVIDER_SETTING_KEY }
    });
  });
});

function createEnv() {
  return loadEnv({
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/hori",
    REDIS_URL: "redis://localhost:6379",
    AI_PROVIDER: "router",
    OPENAI_API_KEY: "openai-key"
  });
}

function createPrisma(initialRows: Array<{ key: string; value: string; updatedBy: string | null; updatedAt: Date }>) {
  const rows = [...initialRows];

  const runtimeSetting = {
    findMany: vi.fn(async (args?: { where?: { key?: { in?: string[] } } }) => {
      const keys = args?.where?.key?.in;
      if (!keys?.length) {
        return rows;
      }

      return rows.filter((row) => keys.includes(row.key));
    }),
    findUnique: vi.fn(async (args: { where: { key: string } }) => rows.find((row) => row.key === args.where.key) ?? null),
    upsert: vi.fn(async (args: {
      where: { key: string };
      update: { value: string; updatedBy: string | null; updatedAt: Date };
      create: { key: string; value: string; updatedBy: string | null };
    }) => {
      const existing = rows.find((row) => row.key === args.where.key);
      if (existing) {
        existing.value = args.update.value;
        existing.updatedBy = args.update.updatedBy;
        existing.updatedAt = args.update.updatedAt;
        return existing;
      }

      const created = {
        key: args.create.key,
        value: args.create.value,
        updatedBy: args.create.updatedBy,
        updatedAt: new Date()
      };
      rows.push(created);
      return created;
    }),
    deleteMany: vi.fn(async (args: { where: { key: string } }) => {
      const before = rows.length;
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        if (rows[index]?.key === args.where.key) {
          rows.splice(index, 1);
        }
      }
      return { count: before - rows.length };
    }),
    update: vi.fn(async (args: { where: { key: string }; data: { value: string; updatedBy: string | null; updatedAt: Date } }) => {
      const existing = rows.find((row) => row.key === args.where.key);
      if (!existing) {
        throw new Error(`Missing row ${args.where.key}`);
      }

      existing.value = args.data.value;
      existing.updatedBy = args.data.updatedBy;
      existing.updatedAt = args.data.updatedAt;
      return existing;
    })
  };

  const tx = {
    runtimeSetting,
    $executeRawUnsafe: vi.fn(async (_sql: string, key: string, value: string, updatedBy: string | null) => {
      if (!rows.some((row) => row.key === key)) {
        rows.push({ key, value, updatedBy, updatedAt: new Date() });
      }

      return 1;
    }),
    $queryRawUnsafe: vi.fn(async (_sql: string, key: string) => {
      return rows.filter((row) => row.key === key).map((row) => ({ value: row.value }));
    })
  };

  const prisma = {
    runtimeSetting,
    $transaction: vi.fn(async (callback: (input: typeof tx) => Promise<unknown>) => callback(tx)),
    featureFlag: { findMany: vi.fn().mockResolvedValue([]) },
    guild: { findUnique: vi.fn().mockResolvedValue(null) },
    channelConfig: { findUnique: vi.fn().mockResolvedValue(null) }
  } as unknown as AppPrismaClient;

  return {
    prisma,
    tx,
    runtimeSetting,
    rows
  };
}
