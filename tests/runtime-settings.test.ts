import { describe, expect, it, vi } from "vitest";

import {
  CORE_PROMPT_DEFINITIONS,
  OPENAI_EMBED_DIMENSIONS_SETTING_KEY,
  MEMORY_HYDE_SETTING_KEY,
  RuntimeConfigService
} from "@hori/core";
import { loadEnv } from "@hori/config";
import { MODEL_ROUTING_SETTING_KEY, serializeModelRouting } from "@hori/llm";
import {
  OWNER_LOCKDOWN_SETTING_KEY as SHARED_OWNER_LOCKDOWN_SETTING_KEY,
  loadOwnerLockdownState as loadSharedOwnerLockdownState,
  persistOwnerLockdownState as persistSharedOwnerLockdownState
} from "@hori/shared";
import type { AppPrismaClient } from "@hori/shared";

describe("runtime settings", () => {
  it("loads owner lockdown as disabled when no setting exists", async () => {
    const prisma = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([])
    } as unknown as AppPrismaClient;

    await expect(loadSharedOwnerLockdownState(prisma)).resolves.toEqual({ enabled: false });
  });

  it("loads persisted owner lockdown state", async () => {
    const updatedAt = new Date("2026-04-12T12:00:00Z");
    const prisma = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([{ value: "true", updatedBy: "owner-id", updatedAt }])
    } as unknown as AppPrismaClient;

    await expect(loadSharedOwnerLockdownState(prisma)).resolves.toEqual({
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

    await persistSharedOwnerLockdownState(prisma, true, "owner-id");

    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO "RuntimeSetting"'),
      SHARED_OWNER_LOCKDOWN_SETTING_KEY,
      "true",
      "owner-id"
    );
  });

  it("applies runtime embedding dimension override to effective OpenAI routing", async () => {
    const env = loadEnv({
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/hori",
      REDIS_URL: "redis://localhost:6379",
      LLM_PROVIDER: "openai"
    });
    const prisma = {
      runtimeSetting: {
        findMany: vi.fn().mockResolvedValue([
          {
            key: OPENAI_EMBED_DIMENSIONS_SETTING_KEY,
            value: "512",
            updatedBy: "owner-1",
            updatedAt: new Date("2026-04-21T12:00:00Z")
          }
        ])
      }
    } as unknown as AppPrismaClient;
    const service = new RuntimeConfigService(prisma, env);

    const settings = await service.getRuntimeSettings();
    const status = await service.getOpenAIEmbeddingDimensionsStatus();

    expect(settings.openaiEmbedDimensions).toBe(512);
    expect(settings.modelRouting.embeddingDimensions).toBe(512);
    expect(status).toEqual(expect.objectContaining({
      value: 512,
      source: "runtime_setting",
      updatedBy: "owner-1"
    }));
  });

  it("applies runtime embedding dimension override to router mode too", async () => {
    const env = loadEnv({
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/hori",
      REDIS_URL: "redis://localhost:6379",
      LLM_PROVIDER: "router"
    });
    const prisma = {
      runtimeSetting: {
        findMany: vi.fn().mockResolvedValue([
          {
            key: OPENAI_EMBED_DIMENSIONS_SETTING_KEY,
            value: "512",
            updatedBy: "owner-router",
            updatedAt: new Date("2026-04-21T14:00:00Z")
          }
        ])
      }
    } as unknown as AppPrismaClient;
    const service = new RuntimeConfigService(prisma, env);

    const settings = await service.getRuntimeSettings();
    const status = await service.getOpenAIEmbeddingDimensionsStatus();

    expect(settings.openaiEmbedDimensions).toBe(512);
    expect(settings.modelRouting.embeddingDimensions).toBe(512);
    expect(status).toEqual(expect.objectContaining({
      value: 512,
      source: "runtime_setting",
      updatedBy: "owner-router"
    }));
  });

  it("reads persisted HyDE runtime toggle", async () => {
    const env = loadEnv({
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/hori",
      REDIS_URL: "redis://localhost:6379",
      LLM_PROVIDER: "openai"
    });
    const updatedAt = new Date("2026-04-21T13:00:00Z");
    const prisma = {
      runtimeSetting: {
        findMany: vi.fn().mockResolvedValue([
          {
            key: MEMORY_HYDE_SETTING_KEY,
            value: "false",
            updatedBy: "owner-2",
            updatedAt
          }
        ])
      }
    } as unknown as AppPrismaClient;
    const service = new RuntimeConfigService(prisma, env);

    await expect(service.getMemoryHydeStatus()).resolves.toEqual({
      value: false,
      source: "runtime_setting",
      updatedBy: "owner-2",
      updatedAt
    });
  });

  it("reads guild-scoped core prompt overrides", async () => {
    const env = loadEnv({
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/hori",
      REDIS_URL: "redis://localhost:6379",
      LLM_PROVIDER: "openai"
    });
    const updatedAt = new Date("2026-04-26T11:00:00Z");
    const prisma = {
      runtimeSetting: {
        findMany: vi.fn().mockResolvedValue([
          {
            key: "prompt.core.guild-1.common_core_base",
            value: "Кастомный core prompt",
            updatedBy: "owner-9",
            updatedAt
          }
        ])
      }
    } as unknown as AppPrismaClient;
    const service = new RuntimeConfigService(prisma, env);

    const status = await service.getCorePromptTemplate("guild-1", "common_core_base");
    const templates = await service.getCorePromptTemplates("guild-1");

    expect(status).toEqual(expect.objectContaining({
      key: "common_core_base",
      source: "runtime_setting",
      content: "Кастомный core prompt",
      updatedBy: "owner-9",
      updatedAt
    }));
    expect(templates.commonCore).toBe("Кастомный core prompt");
    expect(templates.relationshipTails.base).toBe(CORE_PROMPT_DEFINITIONS.relationship_base.defaultContent);
  });

  it("persists and resets guild-scoped core prompt overrides", async () => {
    const env = loadEnv({
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/hori",
      REDIS_URL: "redis://localhost:6379",
      LLM_PROVIDER: "openai"
    });
    const upsert = vi.fn().mockResolvedValue({});
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      runtimeSetting: {
        findMany: vi.fn().mockResolvedValue([]),
        upsert,
        deleteMany
      }
    } as unknown as AppPrismaClient;
    const service = new RuntimeConfigService(prisma, env);

    await service.setCorePromptTemplate("guild-1", "common_core_base", "Новый core prompt", "owner-10");
    await service.resetCorePromptTemplate("guild-1", "common_core_base");

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { key: "prompt.core.guild-1.common_core_base" },
      create: expect.objectContaining({
        key: "prompt.core.guild-1.common_core_base",
        value: "Новый core prompt",
        updatedBy: "owner-10"
      })
    }));
    expect(deleteMany).toHaveBeenCalledWith({
      where: { key: "prompt.core.guild-1.common_core_base" }
    });
  });

  it("marks router-mode model routing overrides as informational-only", async () => {
    const env = loadEnv({
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/hori",
      REDIS_URL: "redis://localhost:6379",
      LLM_PROVIDER: "router",
      OPENAI_MODEL: "gpt-5-nano"
    });
    const updatedAt = new Date("2026-04-21T15:00:00Z");
    const prisma = {
      runtimeSetting: {
        findMany: vi.fn().mockResolvedValue([
          {
            key: MODEL_ROUTING_SETTING_KEY,
            value: serializeModelRouting("quality_openai", { chat: "gpt-5.4-mini" }),
            updatedBy: "owner-3",
            updatedAt
          }
        ])
      }
    } as unknown as AppPrismaClient;
    const service = new RuntimeConfigService(prisma, env);

    const status = await service.getModelRoutingStatus();

    expect(status.source).toBe("default");
    expect(status.controlsEditable).toBe(false);
    expect(status.controlsNote).toMatch(/informational-only/i);
    expect(status.storedPreset).toBe("quality_openai");
    expect(status.storedOverrides).toEqual({ chat: "gpt-5.4-mini" });
    expect(status.updatedBy).toBeUndefined();
    expect(status.updatedAt).toBeUndefined();
  });

  it("rejects model preset and slot mutations in router mode", async () => {
    const env = loadEnv({
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/hori",
      REDIS_URL: "redis://localhost:6379",
      LLM_PROVIDER: "router"
    });
    const service = new RuntimeConfigService({} as AppPrismaClient, env);

    await expect(service.setModelPreset("quality_openai")).rejects.toThrow(/informational-only.*LLM_PROVIDER=router/i);
    await expect(service.setModelSlot("chat", "gpt-5.4-mini")).rejects.toThrow(/informational-only.*LLM_PROVIDER=router/i);
    await expect(service.resetModelSlot("chat")).rejects.toThrow(/informational-only.*LLM_PROVIDER=router/i);
    await expect(service.resetModelRouting()).rejects.toThrow(/informational-only.*LLM_PROVIDER=router/i);
  });
});
