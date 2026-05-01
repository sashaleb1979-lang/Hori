import { describe, expect, it, vi } from "vitest";

import {
  IntentRouter,
  SIGIL_REGISTRY,
  ENABLED_SIGILS_SETTING_KEY,
  RuntimeConfigService
} from "@hori/core";
import { loadEnv } from "@hori/config";
import type { AppPrismaClient } from "@hori/shared";
import type { MessageEnvelope } from "@hori/shared";

const baseMessage: MessageEnvelope = {
  messageId: "1",
  guildId: "g",
  channelId: "c",
  userId: "u",
  authorTag: "u#0001",
  content: "",
  isBot: false,
  isFromOwner: false,
  explicitInvocation: true,
  triggerSource: "mention",
  createdAt: new Date()
} as unknown as MessageEnvelope;

function withContent(content: string): MessageEnvelope {
  return { ...baseMessage, content } as MessageEnvelope;
}

describe("V6 Sigil registry", () => {
  it("exposes ? as enabledByDefault and reserved sigils as disabled", () => {
    const question = SIGIL_REGISTRY.find((s) => s.char === "?");
    expect(question?.enabledByDefault).toBe(true);
    expect(question?.reserved).toBe(false);
    const reserved = SIGIL_REGISTRY.filter((s) => s.reserved);
    expect(reserved.length).toBeGreaterThanOrEqual(2);
    for (const r of reserved) {
      expect(r.enabledByDefault).toBe(false);
    }
  });

  it("default IntentRouter routes ? to search and ignores reserved sigils", () => {
    const router = new IntentRouter();
    const ask = router.route(withContent("? what is rust"), "Хори");
    expect(ask.intent).toBe("search");
    expect(ask.requiresSearch).toBe(true);
    const reserved = router.route(withContent("! rewrite this"), "Хори");
    expect(reserved.intent).not.toBe("rewrite");
  });

  it("router with explicit enabledSigils activates reserved sigils", () => {
    const router = new IntentRouter({ enabledSigils: ["?", "!"] });
    const result = router.route(withContent("! rewrite please"), "Хори");
    expect(result.intent).toBe("rewrite");
    expect(result.reason).toBe("sigil:!");
  });

  it("router with empty enabledSigils disables every sigil including ?", () => {
    const router = new IntentRouter({ enabledSigils: [] });
    const result = router.route(withContent("? what is rust"), "Хори");
    // No active sigil → falls through to chat fallback (no `?` regex pattern matches)
    expect(result.intent).toBe("chat");
  });
});

describe("V6 RuntimeConfigService.getEnabledSigils", () => {
  function makeEnv() {
    return loadEnv({
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/hori",
      REDIS_URL: "redis://localhost:6379",
      LLM_PROVIDER: "openai"
    });
  }

  it("returns null when not set", async () => {
    const prisma = {
      runtimeSetting: { findMany: vi.fn().mockResolvedValue([]) }
    } as unknown as AppPrismaClient;
    const svc = new RuntimeConfigService(prisma, makeEnv());
    expect(await svc.getEnabledSigils()).toBeNull();
  });

  it("parses array of single-char strings, filters garbage", async () => {
    const prisma = {
      runtimeSetting: {
        findMany: vi.fn().mockResolvedValue([
          {
            key: ENABLED_SIGILS_SETTING_KEY,
            value: JSON.stringify(["?", "!", "long", 5, "*"]),
            updatedBy: null,
            updatedAt: new Date()
          }
        ])
      }
    } as unknown as AppPrismaClient;
    const svc = new RuntimeConfigService(prisma, makeEnv());
    const result = await svc.getEnabledSigils();
    expect(result).toEqual(["?", "!", "*"]);
  });

  it("setEnabledSigils dedupes and persists", async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const prisma = {
      runtimeSetting: { findMany: vi.fn().mockResolvedValue([]), upsert }
    } as unknown as AppPrismaClient;
    const svc = new RuntimeConfigService(prisma, makeEnv());
    const out = await svc.setEnabledSigils(["?", "?", "!", "long"], "owner-3");
    expect(out).toEqual(["?", "!"]);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { key: ENABLED_SIGILS_SETTING_KEY },
      create: expect.objectContaining({ updatedBy: "owner-3" })
    }));
  });
});
