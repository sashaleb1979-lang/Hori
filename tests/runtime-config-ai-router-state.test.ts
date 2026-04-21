import { describe, expect, it, vi } from "vitest";

import { loadEnv } from "@hori/config";
import { createEmptyAiRouterState } from "@hori/llm";
import type { AppPrismaClient } from "@hori/shared";

import { AI_ROUTER_STATE_SETTING_KEY, RuntimeConfigService } from "../packages/core/src/services/runtime-config-service";

describe("RuntimeConfigService ai router state", () => {
  it("returns empty state when runtime setting is missing or invalid", async () => {
    const serviceMissing = new RuntimeConfigService(createPrisma([]), createEnv());
    const serviceInvalid = new RuntimeConfigService(createPrisma([
      { key: AI_ROUTER_STATE_SETTING_KEY, value: "{not-json", updatedBy: null, updatedAt: new Date() }
    ]), createEnv());

    await expect(serviceMissing.getAiRouterState()).resolves.toEqual(createEmptyAiRouterState());

    const invalid = await serviceInvalid.getAiRouterState();
    expect(invalid.providers).toEqual({});
    expect(invalid.recentRoutes).toEqual([]);
    expect(typeof invalid.updatedAt).toBe("string");
  });

  it("persists ai router state without invalidating routing cache", async () => {
    const upsert = vi.fn().mockResolvedValue(undefined);
    const prisma = createPrisma([], upsert);
    const service = new RuntimeConfigService(prisma, createEnv());
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

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { key: AI_ROUTER_STATE_SETTING_KEY },
      update: expect.objectContaining({
        value: JSON.stringify(state),
        updatedBy: "owner-1"
      })
    }));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("updates ai router state from current persisted JSON", async () => {
    const current = {
      providers: {},
      recentRoutes: [{ requestId: "req-1", provider: "gemini", model: "gemini-2.5-flash", timestamp: "2026-04-21T10:00:00.000Z", fallbackDepth: 0, routedFrom: [], success: true }],
      updatedAt: "2026-04-21T10:00:00.000Z"
    };
    const upsert = vi.fn().mockResolvedValue(undefined);
    const prisma = createPrisma([
      { key: AI_ROUTER_STATE_SETTING_KEY, value: JSON.stringify(current), updatedBy: null, updatedAt: new Date() }
    ], upsert);
    const service = new RuntimeConfigService(prisma, createEnv());

    const next = await service.updateAiRouterState((state) => ({
      ...state,
      recentRoutes: [...state.recentRoutes, { requestId: "req-2", provider: "cloudflare", model: "@cf/zai-org/glm-4.7-flash", timestamp: "2026-04-21T10:05:00.000Z", fallbackDepth: 1, routedFrom: ["gemini:gemini-2.5-flash"], success: true }],
      updatedAt: "2026-04-21T10:05:00.000Z"
    }));

    expect(next.recentRoutes).toHaveLength(2);
    expect(next.recentRoutes[1]?.provider).toBe("cloudflare");
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        value: JSON.stringify(next)
      })
    }));
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

function createPrisma(rows: Array<{ key: string; value: string; updatedBy: string | null; updatedAt: Date }>, upsert = vi.fn().mockResolvedValue(undefined)) {
  const runtimeSetting = {
    findMany: vi.fn(async (args?: { where?: { key?: { in?: string[] } } }) => {
      const keys = args?.where?.key?.in;
      if (!keys?.length) {
        return rows;
      }

      return rows.filter((row) => keys.includes(row.key));
    }),
    upsert
  };

  return {
    runtimeSetting,
    featureFlag: { findMany: vi.fn().mockResolvedValue([]) },
    guild: { findUnique: vi.fn().mockResolvedValue(null) },
    channelConfig: { findUnique: vi.fn().mockResolvedValue(null) }
  } as unknown as AppPrismaClient;
}