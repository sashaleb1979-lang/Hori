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

describe("RuntimeConfigService live core prompt mapping", () => {
  it("maps aggression and relationship overrides into production *Prompt fields", async () => {
    const prisma = {
      runtimeSetting: {
        findMany: vi.fn(async () => [
          {
            key: "prompt.core.guild-1.aggressionChecker",
            value: "custom aggression checker",
            updatedBy: "owner-1",
            updatedAt: new Date("2026-05-27T12:00:00.000Z")
          },
          {
            key: "prompt.core.guild-1.relationshipEvaluator",
            value: "custom relationship evaluator",
            updatedBy: "owner-1",
            updatedAt: new Date("2026-05-27T12:00:00.000Z")
          },
          {
            key: "prompt.core.guild-1.common_core_base",
            value: "custom common base",
            updatedBy: "owner-1",
            updatedAt: new Date("2026-05-27T12:00:00.000Z")
          }
        ])
      }
    } as unknown as AppPrismaClient;

    const service = new RuntimeConfigService(prisma, makeEnv());
    const templates = await service.getCorePromptTemplates("guild-1");

    expect(templates.commonCore).toBe("custom common base");
    expect(templates.aggressionCheckerPrompt).toBe("custom aggression checker");
    expect(templates.relationshipEvaluatorPrompt).toBe("custom relationship evaluator");
  });
});