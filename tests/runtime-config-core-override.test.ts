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

describe("RuntimeConfigService core override safety", () => {
  it("ensures user row exists before writing a core override", async () => {
    const userUpsert = vi.fn().mockResolvedValue({});
    const overrideUpsert = vi.fn().mockResolvedValue({});
    const prisma = {
      user: { upsert: userUpsert },
      horiCoreOverride: { upsert: overrideUpsert },
      runtimeSetting: { findMany: vi.fn().mockResolvedValue([]) }
    } as unknown as AppPrismaClient;

    const service = new RuntimeConfigService(prisma, makeEnv());
    await service.setCoreOverride("guild-1", "user-1", "core_warm", 3_600_000, "manual", "mod-1");

    expect(userUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "user-1" },
      create: expect.objectContaining({ id: "user-1", isBot: false })
    }));
    expect(overrideUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { guildId_userId: { guildId: "guild-1", userId: "user-1" } }
    }));
  });
});