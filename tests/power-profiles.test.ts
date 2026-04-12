import { describe, expect, it } from "vitest";

import { loadEnv } from "@hori/config";
import { RuntimeConfigService } from "@hori/core";
import type { AppPrismaClient } from "@hori/shared";

describe("power profiles", () => {
  it("applies the selected power profile and runtime overrides", async () => {
    const env = loadEnv({
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/hori",
      REDIS_URL: "redis://localhost:6379"
    });

    const prisma = {
      runtimeSetting: {
        findMany: async () => [
          {
            key: "power.profile",
            value: "expanded",
            updatedBy: "owner-1",
            updatedAt: new Date("2026-04-12T12:00:00Z")
          },
          {
            key: "runtime.llm.reply_max_tokens",
            value: "410",
            updatedBy: "owner-1",
            updatedAt: new Date("2026-04-12T12:00:00Z")
          }
        ]
      },
      featureFlag: {
        findMany: async () => []
      },
      guild: {
        findUnique: async () => null
      },
      channelConfig: {
        findUnique: async () => null
      }
    } as unknown as AppPrismaClient;

    const service = new RuntimeConfigService(prisma, env);
    const status = await service.getPowerProfileStatus();

    expect(status.activeProfile).toBe("expanded");
    expect(status.effective.llmMaxContextMessages).toBe(18);
    expect(status.effective.contextMaxChars).toBe(4200);
    expect(status.effective.llmReplyMaxTokens).toBe(410);
    expect(status.effective.ollamaNumCtx).toBe(12288);
    expect(status.updatedBy).toBe("owner-1");
  });
});