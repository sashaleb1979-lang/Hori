import { describe, expect, it, vi } from "vitest";

import {
  OWNER_LOCKDOWN_SETTING_KEY,
  loadOwnerLockdownState,
  persistOwnerLockdownState
} from "@hori/shared";
import type { AppPrismaClient } from "@hori/shared";

describe("runtime settings", () => {
  it("loads owner lockdown as disabled when no setting exists", async () => {
    const prisma = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([])
    } as unknown as AppPrismaClient;

    await expect(loadOwnerLockdownState(prisma)).resolves.toEqual({ enabled: false });
  });

  it("loads persisted owner lockdown state", async () => {
    const updatedAt = new Date("2026-04-12T12:00:00Z");
    const prisma = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([{ value: "true", updatedBy: "owner-id", updatedAt }])
    } as unknown as AppPrismaClient;

    await expect(loadOwnerLockdownState(prisma)).resolves.toEqual({
      enabled: true,
      updatedBy: "owner-id",
      updatedAt
    });
  });

  it("persists owner lockdown state", async () => {
    const execute = vi.fn().mockResolvedValue(1);
    const prisma = {
      $executeRawUnsafe: execute
    } as unknown as AppPrismaClient;

    await persistOwnerLockdownState(prisma, true, "owner-id");

    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO "RuntimeSetting"'),
      OWNER_LOCKDOWN_SETTING_KEY,
      "true",
      "owner-id"
    );
  });
});
