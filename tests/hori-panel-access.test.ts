import { describe, expect, it, vi } from "vitest";

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
});