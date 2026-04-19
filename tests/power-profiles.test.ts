import { describe, expect, it } from "vitest";

import { loadEnv } from "@hori/config";
import { RuntimeConfigService } from "@hori/core";
import { serializeModelRouting } from "@hori/llm";
import type { AppPrismaClient } from "@hori/shared";

describe("power profiles", () => {
  it("keeps balanced defaults aligned with runtime env tuning", async () => {
    const env = loadEnv({
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/hori",
      REDIS_URL: "redis://localhost:6379"
    });

    const prisma = {
      runtimeSetting: {
        findMany: async () => []
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

    expect(status.activeProfile).toBe("balanced");
    expect(status.source).toBe("default");
    expect(status.effective.contextMaxChars).toBe(env.CONTEXT_V2_MAX_CHARS);
    expect(status.effective.contextMaxChars).toBe(4000);
  });

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

  it("defaults OpenAI model routing to the balanced preset", async () => {
    const env = loadEnv({
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/hori",
      REDIS_URL: "redis://localhost:6379",
      LLM_PROVIDER: "openai"
    });

    const prisma = {
      runtimeSetting: {
        findMany: async () => []
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
    const settings = await service.getRuntimeSettings();

    expect(settings.modelRouting.preset).toBe("balanced_openai");
    expect(settings.modelRouting.slots.classifier).toBe("gpt-5-nano");
    expect(settings.modelRouting.slots.search).toBe("gpt-5.4-mini");
  });

  it("falls back to default model routing when stored JSON is invalid", async () => {
    const env = loadEnv({
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/hori",
      REDIS_URL: "redis://localhost:6379",
      LLM_PROVIDER: "openai"
    });

    const prisma = {
      runtimeSetting: {
        findMany: async () => [
          {
            key: "llm.model_routing",
            value: "{ nope",
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
    const status = await service.getModelRoutingStatus();

    expect(status.source).toBe("default");
    expect(status.preset).toBe("balanced_openai");
    expect(status.parseError).toBeTruthy();
  });

  it("sets and resets model slot overrides without extra env", async () => {
    const env = loadEnv({
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/hori",
      REDIS_URL: "redis://localhost:6379",
      LLM_PROVIDER: "openai"
    });
    let routingSetting: { key: string; value: string; updatedBy: string | null; updatedAt: Date } = {
      key: "llm.model_routing",
      value: serializeModelRouting("balanced_openai", { chat: "gpt-5.4-mini" }),
      updatedBy: "owner-1",
      updatedAt: new Date("2026-04-12T12:00:00Z")
    };

    const prisma = {
      runtimeSetting: {
        findMany: async () => [routingSetting],
        upsert: async (args: {
          update: { value: string; updatedBy?: string | null; updatedAt?: Date };
          create: { key: string; value: string; updatedBy?: string | null };
        }) => {
          routingSetting = {
            ...routingSetting,
            ...args.update,
            updatedAt: args.update.updatedAt ?? routingSetting.updatedAt
          };

          return routingSetting;
        }
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

    const overridden = await service.getModelRoutingStatus();
    expect(overridden.slots.chat).toBe("gpt-5.4-mini");

    const reset = await service.resetModelSlot("chat", "owner-2");

    expect(reset.slots.chat).toBe("gpt-5-mini");
    expect(reset.overrides.chat).toBeUndefined();
    expect(reset.updatedBy).toBe("owner-2");
  });
});
