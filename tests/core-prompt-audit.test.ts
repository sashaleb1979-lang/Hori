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

describe("V6 Phase I: core prompt override audit log", () => {
  it("setCorePromptTemplate writes an audit row with previous/new values", async () => {
    const auditCreate = vi.fn().mockResolvedValue({});
    let stored: { value: string; updatedBy: string | null } | null = null;
    const prisma = {
      runtimeSetting: {
        findUnique: vi.fn(async ({ where }: { where: { key: string } }) => {
          if (!stored) return null;
          return { key: where.key, value: stored.value, updatedBy: stored.updatedBy, updatedAt: new Date() };
        }),
        findMany: vi.fn(async () => (stored ? [{ key: "prompt.core.guild-1.relationship_base", value: stored.value, updatedBy: stored.updatedBy, updatedAt: new Date() }] : [])),
        upsert: vi.fn(async ({ where, update, create }: { where: { key: string }; update: { value: string; updatedBy: string | null }; create: { value: string; updatedBy: string | null } }) => {
          stored = { value: update?.value ?? create.value, updatedBy: update?.updatedBy ?? create.updatedBy ?? null };
          return { key: where.key, value: stored.value, updatedBy: stored.updatedBy };
        }),
        deleteMany: vi.fn(async () => {
          stored = null;
          return { count: 1 };
        })
      },
      runtimeSettingAudit: {
        create: auditCreate,
        findMany: vi.fn().mockResolvedValue([])
      }
    } as unknown as AppPrismaClient;

    const svc = new RuntimeConfigService(prisma, makeEnv());
    await svc.setCorePromptTemplate("guild-1", "relationship_base", "Hello v1", "user-A");
    await svc.setCorePromptTemplate("guild-1", "relationship_base", "Hello v2", "user-B");
    await svc.resetCorePromptTemplate("guild-1", "relationship_base", "user-C");

    expect(auditCreate).toHaveBeenCalledTimes(3);
    const calls = auditCreate.mock.calls.map((c: unknown[]) => (c[0] as { data: Record<string, unknown> }).data);
    expect(calls[0]).toMatchObject({ action: "create", previousValue: null, newValue: "Hello v1", updatedBy: "user-A" });
    expect(calls[1]).toMatchObject({ action: "update", previousValue: "Hello v1", newValue: "Hello v2", updatedBy: "user-B" });
    expect(calls[2]).toMatchObject({ action: "reset", previousValue: "Hello v2", newValue: null, updatedBy: "user-C" });
  });

  it("listCorePromptAuditTrail maps rows and parses prompt key", async () => {
    const prisma = {
      runtimeSetting: { findMany: vi.fn().mockResolvedValue([]) },
      runtimeSettingAudit: {
        findMany: vi.fn(async () => [
          {
            id: "a1",
            key: "prompt.core.guild-1.relationship_base",
            guildId: "guild-1",
            previousValue: null,
            newValue: "x",
            action: "create",
            updatedBy: "u1",
            createdAt: new Date("2026-01-01")
          },
          {
            id: "a2",
            key: "prompt.core.guild-1.unknown_key",
            guildId: "guild-1",
            previousValue: "old",
            newValue: null,
            action: "reset",
            updatedBy: null,
            createdAt: new Date("2026-01-02")
          }
        ])
      }
    } as unknown as AppPrismaClient;
    const svc = new RuntimeConfigService(prisma, makeEnv());
    const audit = await svc.listCorePromptAuditTrail("guild-1");
    expect(audit).toHaveLength(2);
    expect(audit[0]).toMatchObject({ id: "a1", key: "relationship_base", action: "create", updatedBy: "u1" });
    expect(audit[1]).toMatchObject({ id: "a2", key: null, action: "reset" });
  });

  it("listCorePromptAuditTrail returns [] if model not present", async () => {
    const prisma = {
      runtimeSetting: { findMany: vi.fn().mockResolvedValue([]) }
    } as unknown as AppPrismaClient;
    const svc = new RuntimeConfigService(prisma, makeEnv());
    expect(await svc.listCorePromptAuditTrail("guild-1")).toEqual([]);
  });
});
