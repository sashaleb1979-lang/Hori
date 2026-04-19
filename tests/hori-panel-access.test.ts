import { describe, expect, it, vi } from "vitest";

import { loadEnv } from "@hori/config";
import { resolveModelRouting, serializeModelRouting } from "@hori/llm";

import type { BotRuntime } from "../apps/bot/src/bootstrap";
import { routeInteraction } from "../apps/bot/src/router/interaction-router";

const EPHEMERAL_FLAG = 64;

function createPanelInteraction(userId: string, tab: string | null = null) {
  const reply = vi.fn();

  return {
    guildId: "guild-1",
    channelId: "channel-1",
    commandName: "hori",
    user: {
      id: userId,
      username: "tester",
      globalName: "Tester"
    },
    memberPermissions: {
      has: vi.fn().mockReturnValue(false)
    },
    options: {
      getSubcommand: vi.fn().mockReturnValue("panel"),
      getString: vi.fn().mockImplementation((name: string) => (name === "tab" ? tab : null))
    },
    reply,
    isButton: () => false,
    isStringSelectMenu: () => false,
    isModalSubmit: () => false,
    isChatInputCommand: () => true,
    isMessageContextMenuCommand: () => false
  };
}

function createRuntime(ownerIds: string[]): BotRuntime {
  return {
    env: {
      DISCORD_OWNER_IDS: ownerIds
    },
    logger: {
      warn: vi.fn()
    }
  } as unknown as BotRuntime;
}

function createLlmPanelButtonInteraction(userId: string) {
  const update = vi.fn();

  return {
    guildId: "guild-1",
    channelId: "channel-1",
    customId: "hori-action:llm_panel",
    user: {
      id: userId,
      username: "tester",
      globalName: "Tester"
    },
    memberPermissions: {
      has: vi.fn().mockReturnValue(false)
    },
    update,
    reply: vi.fn(),
    isButton: () => true,
    isStringSelectMenu: () => false,
    isModalSubmit: () => false,
    isChatInputCommand: () => false,
    isMessageContextMenuCommand: () => false
  };
}

function createLlmPanelModelSelectInteraction(userId: string) {
  const update = vi.fn();

  return {
    guildId: "guild-1",
    channelId: "channel-1",
    customId: "llm-panel:model:chat",
    values: ["gpt-5.4-mini"],
    user: {
      id: userId,
      username: "tester",
      globalName: "Tester"
    },
    memberPermissions: {
      has: vi.fn().mockReturnValue(false)
    },
    update,
    reply: vi.fn(),
    isButton: () => false,
    isStringSelectMenu: () => true,
    isModalSubmit: () => false,
    isChatInputCommand: () => false,
    isMessageContextMenuCommand: () => false
  };
}

function createLlmPanelRuntime(ownerIds: string[], storedRouting?: string): BotRuntime {
  const env = loadEnv({
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/hori",
    REDIS_URL: "redis://localhost:6379",
    LLM_PROVIDER: "openai"
  });

  return {
    env: {
      ...env,
      DISCORD_OWNER_IDS: ownerIds
    },
    logger: {
      warn: vi.fn()
    },
    runtimeConfig: {
      getModelRoutingStatus: vi.fn().mockResolvedValue(resolveModelRouting(env, storedRouting)),
      setModelSlot: vi.fn().mockResolvedValue(resolveModelRouting(env, storedRouting))
    },
    prisma: {
      botEventLog: {
        findMany: vi.fn().mockResolvedValue([])
      }
    }
  } as unknown as BotRuntime;
}

describe("/hori panel access", () => {
  it("blocks non-owner access to the master panel", async () => {
    const interaction = createPanelInteraction("user-1");

    await routeInteraction(createRuntime([]), interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: expect.stringContaining("только владельцу"),
      flags: EPHEMERAL_FLAG
    });
  });

  it("allows the owner to open the master panel", async () => {
    const interaction = createPanelInteraction("owner-1", "style");

    await routeInteraction(createRuntime(["owner-1"]), interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        flags: EPHEMERAL_FLAG,
        embeds: expect.any(Array),
        components: expect.any(Array)
      })
    );
  });

  it("lets the owner open the LLM panel from buttons", async () => {
    const interaction = createLlmPanelButtonInteraction("owner-1");

    await routeInteraction(createLlmPanelRuntime(["owner-1"]), interaction as never);

    expect(interaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.any(Array),
        components: expect.any(Array)
      })
    );
  });

  it("lets the owner change one LLM slot from the panel", async () => {
    const interaction = createLlmPanelModelSelectInteraction("owner-1");
    const runtime = createLlmPanelRuntime(
      ["owner-1"],
      serializeModelRouting("balanced_openai", { chat: "gpt-5.4-mini" })
    );

    await routeInteraction(runtime, interaction as never);

    expect(runtime.runtimeConfig.setModelSlot).toHaveBeenCalledWith("chat", "gpt-5.4-mini", "owner-1");
    expect(interaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.any(Array),
        components: expect.any(Array)
      })
    );
  });
});
