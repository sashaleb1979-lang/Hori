import { describe, expect, it, vi } from "vitest";

import {
  CHANNEL_ACCESS_MODES,
  CHANNEL_ACCESS_SETTING_KEY,
  ChannelAccessService,
  isChannelAccessRuleMode,
  RuntimeConfigService
} from "@hori/core";
import { loadEnv } from "@hori/config";
import type { AppPrismaClient } from "@hori/shared";

function makeEnv() {
  return loadEnv({
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/hori",
    REDIS_URL: "redis://localhost:6379",
    LLM_PROVIDER: "openai"
  });
}

describe("V6 Phase H: ChannelAccessService", () => {
  it("default mode allows everywhere with no rules", () => {
    const svc = new ChannelAccessService();
    const decision = svc.evaluate("c1");
    expect(decision.mode).toBe("default");
    expect(decision.allowed).toBe(true);
    expect(decision.requiresMention).toBe(false);
    expect(decision.proactivityBoost).toBe(false);
  });

  it("ignored: blocked even with explicit mention", () => {
    const svc = new ChannelAccessService([{ channelId: "c1", mode: "ignored" }]);
    expect(svc.evaluate("c1", { isExplicitMention: true }).allowed).toBe(false);
  });

  it("muted: blocks unless explicitly mentioned", () => {
    const svc = new ChannelAccessService([{ channelId: "c1", mode: "muted" }]);
    expect(svc.evaluate("c1").allowed).toBe(false);
    const explicit = svc.evaluate("c1", { isExplicitMention: true });
    expect(explicit.allowed).toBe(true);
    expect(explicit.requiresMention).toBe(true);
  });

  it("active: allowed and proactivityBoost=true", () => {
    const svc = new ChannelAccessService([{ channelId: "c1", mode: "active" }]);
    const d = svc.evaluate("c1");
    expect(d.allowed).toBe(true);
    expect(d.proactivityBoost).toBe(true);
  });

  it("setRule / removeRule round-trip", () => {
    const svc = new ChannelAccessService();
    svc.setRule("c1", "muted");
    expect(svc.getMode("c1")).toBe("muted");
    expect(svc.list()).toEqual([{ channelId: "c1", mode: "muted" }]);
    svc.removeRule("c1");
    expect(svc.getMode("c1")).toBe("default");
  });

  it("isChannelAccessRuleMode validates", () => {
    expect(isChannelAccessRuleMode("muted")).toBe(true);
    expect(isChannelAccessRuleMode("loud")).toBe(false);
    expect(CHANNEL_ACCESS_MODES.length).toBe(4);
  });
});

describe("V6 Phase H: RuntimeConfigService channel access persistence", () => {
  it("returns [] when no setting", async () => {
    const prisma = {
      runtimeSetting: { findMany: vi.fn().mockResolvedValue([]) }
    } as unknown as AppPrismaClient;
    const svc = new RuntimeConfigService(prisma, makeEnv());
    expect(await svc.getChannelAccessRules()).toEqual([]);
  });

  it("sanitizes payload (drops invalid mode, dedupes channelId)", async () => {
    const prisma = {
      runtimeSetting: {
        findMany: vi.fn().mockResolvedValue([
          {
            key: CHANNEL_ACCESS_SETTING_KEY,
            value: JSON.stringify([
              { channelId: "c1", mode: "muted" },
              { channelId: "c1", mode: "active" }, // dedup → first wins
              { channelId: "c2", mode: "loud" },     // invalid mode → dropped
              { channelId: "", mode: "default" },     // empty id → dropped
              { channelId: "c3", mode: "ignored" }
            ]),
            updatedBy: null,
            updatedAt: new Date()
          }
        ])
      }
    } as unknown as AppPrismaClient;
    const svc = new RuntimeConfigService(prisma, makeEnv());
    const result = await svc.getChannelAccessRules();
    expect(result).toEqual([
      { channelId: "c1", mode: "muted" },
      { channelId: "c3", mode: "ignored" }
    ]);
  });

  it("setChannelAccessRules persists sanitized list", async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const prisma = {
      runtimeSetting: { findMany: vi.fn().mockResolvedValue([]), upsert }
    } as unknown as AppPrismaClient;
    const svc = new RuntimeConfigService(prisma, makeEnv());
    const out = await svc.setChannelAccessRules(
      [
        { channelId: "c1", mode: "muted" },
        { channelId: "c2", mode: "active" }
      ],
      "owner-1"
    );
    expect(out).toEqual([
      { channelId: "c1", mode: "muted" },
      { channelId: "c2", mode: "active" }
    ]);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { key: CHANNEL_ACCESS_SETTING_KEY }
    }));
  });

  it("setChannelAccess persists explicit full/silent/off modes", async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const prisma = {
      runtimeSetting: { findMany: vi.fn().mockResolvedValue([]) },
      channelConfig: {
        upsert,
        findUnique: vi.fn()
      }
    } as unknown as AppPrismaClient;
    const svc = new RuntimeConfigService(prisma, makeEnv());

    await svc.setChannelAccess("guild-1", "channel-1", "silent");
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { guildId_channelId: { guildId: "guild-1", channelId: "channel-1" } },
      update: expect.objectContaining({
        accessMode: "silent",
        allowBotReplies: false,
        allowInterjections: false,
        isMuted: false
      })
    }));
  });

  it("getChannelPolicy respects explicit accessMode semantics", async () => {
    const prisma = {
      runtimeSetting: { findMany: vi.fn().mockResolvedValue([]) },
      channelConfig: {
        findUnique: vi.fn().mockResolvedValue({
          guildId: "guild-1",
          channelId: "channel-1",
          accessMode: "off",
          allowBotReplies: true,
          allowInterjections: true,
          isMuted: false,
          topicInterestTags: []
        })
      }
    } as unknown as AppPrismaClient;
    const svc = new RuntimeConfigService(prisma, makeEnv());

    await expect(svc.getChannelPolicy("guild-1", "channel-1")).resolves.toEqual(expect.objectContaining({
      accessMode: "off",
      allowBotReplies: false,
      allowInterjections: false,
      isMuted: true
    }));
  });

  it("legacy isMuted rows are treated as silent, not off", async () => {
    const prisma = {
      runtimeSetting: { findMany: vi.fn().mockResolvedValue([]) },
      channelConfig: {
        findUnique: vi.fn().mockResolvedValue({
          guildId: "guild-1",
          channelId: "channel-1",
          accessMode: null,
          allowBotReplies: true,
          allowInterjections: false,
          isMuted: true,
          topicInterestTags: []
        })
      }
    } as unknown as AppPrismaClient;
    const svc = new RuntimeConfigService(prisma, makeEnv());

    await expect(svc.getChannelPolicy("guild-1", "channel-1")).resolves.toEqual(expect.objectContaining({
      accessMode: "silent",
      allowBotReplies: false,
      allowInterjections: false,
      isMuted: true
    }));
  });
});
