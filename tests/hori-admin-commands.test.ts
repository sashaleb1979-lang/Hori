import { describe, expect, it, vi } from "vitest";

import type { BotRuntime } from "../apps/bot/src/bootstrap";
import { routeInteraction } from "../apps/bot/src/router/interaction-router";

const EPHEMERAL_FLAG = 64;

function createRuntime(options: {
  ownerIds?: string[];
  slashAdmin?: Record<string, unknown>;
}) {
  return {
    env: {
      DISCORD_OWNER_IDS: options.ownerIds ?? []
    },
    logger: {
      warn: vi.fn()
    },
    slashAdmin: options.slashAdmin ?? {}
  } as unknown as BotRuntime;
}

function createHoriInteraction(options: {
  userId: string;
  subcommand: string;
  values?: Record<string, unknown>;
  isModerator?: boolean;
}) {
  const reply = vi.fn();
  const values = options.values ?? {};

  return {
    guildId: "guild-1",
    channelId: "channel-1",
    commandName: "hori",
    user: {
      id: options.userId,
      username: "tester",
      globalName: "Tester"
    },
    memberPermissions: {
      has: vi.fn().mockReturnValue(Boolean(options.isModerator))
    },
    options: {
      getSubcommand: vi.fn().mockReturnValue(options.subcommand),
      getString: vi.fn().mockImplementation((name: string) => values[name] ?? null),
      getInteger: vi.fn().mockImplementation((name: string) => values[name] ?? null),
      getNumber: vi.fn().mockImplementation((name: string) => values[name] ?? null),
      getBoolean: vi.fn().mockImplementation((name: string) => values[name] ?? null),
      getUser: vi.fn().mockImplementation((name: string) => {
        const id = values[name];
        return typeof id === "string" ? { id } : null;
      }),
      getChannel: vi.fn().mockReturnValue(null),
      getAttachment: vi.fn().mockReturnValue(null)
    },
    reply,
    isButton: () => false,
    isStringSelectMenu: () => false,
    isModalSubmit: () => false,
    isChatInputCommand: () => true,
    isMessageContextMenuCommand: () => false
  };
}

describe("/hori admin V5 commands", () => {
  it("lets the owner update runtime modes from the /hori branch", async () => {
    const runtime = createRuntime({
      ownerIds: ["owner-1"],
      slashAdmin: {
        setMemoryMode: vi.fn().mockResolvedValue("memoryMode=TRUSTED_ONLY"),
        setRelationshipGrowthMode: vi.fn().mockResolvedValue("relationshipGrowthMode=OFF"),
        setStylePresetMode: vi.fn().mockResolvedValue("stylePresetMode=manual_only"),
        setMaxTimeoutMinutes: vi.fn().mockResolvedValue("maxTimeoutMinutes=10"),
        runtimeModesStatus: vi.fn().mockResolvedValue("memoryMode=TRUSTED_ONLY\nmaxTimeoutMinutes=10")
      }
    });
    const interaction = createHoriInteraction({
      userId: "owner-1",
      subcommand: "runtime",
      values: {
        "memory-mode": "TRUSTED_ONLY",
        "max-timeout-minutes": 10
      }
    });

    await routeInteraction(runtime, interaction as never);

    expect(runtime.slashAdmin.setMemoryMode).toHaveBeenCalledWith("TRUSTED_ONLY", "owner-1");
    expect(runtime.slashAdmin.setMaxTimeoutMinutes).toHaveBeenCalledWith(10, "owner-1");
    expect(runtime.slashAdmin.runtimeModesStatus).toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith({
      content: expect.stringContaining("memoryMode=TRUSTED_ONLY"),
      flags: EPHEMERAL_FLAG
    });
  });

  it("passes manual relationshipState updates through /hori relationship", async () => {
    const runtime = createRuntime({
      ownerIds: ["owner-1"],
      slashAdmin: {
        updateRelationship: vi.fn().mockResolvedValue("Relationship для user-7 обновлён."),
        relationshipDetails: vi.fn().mockResolvedValue("Relationship details")
      }
    });
    const interaction = createHoriInteraction({
      userId: "owner-1",
      subcommand: "relationship",
      values: {
        user: "user-7",
        "relationship-state": "sweet"
      }
    });

    await routeInteraction(runtime, interaction as never);

    expect(runtime.slashAdmin.updateRelationship).toHaveBeenCalledWith(
      "guild-1",
      "user-7",
      "owner-1",
      expect.objectContaining({
        relationshipState: "sweet"
      })
    );
    expect(runtime.slashAdmin.relationshipDetails).toHaveBeenCalledWith("guild-1", "user-7");
    expect(interaction.reply).toHaveBeenCalledWith({
      content: expect.stringContaining("Relationship details"),
      flags: EPHEMERAL_FLAG
    });
  });

  it("exposes aggression reset actions from the /hori admin branch", async () => {
    const runtime = createRuntime({
      ownerIds: ["owner-1"],
      slashAdmin: {
        resetRelationshipCold: vi.fn().mockResolvedValue("Cold reset: state=base, score=0")
      }
    });
    const interaction = createHoriInteraction({
      userId: "owner-1",
      subcommand: "aggression",
      values: {
        user: "user-7",
        action: "reset-cold"
      }
    });

    await routeInteraction(runtime, interaction as never);

    expect(runtime.slashAdmin.resetRelationshipCold).toHaveBeenCalledWith("guild-1", "user-7", "owner-1");
    expect(interaction.reply).toHaveBeenCalledWith({
      content: "Cold reset: state=base, score=0",
      flags: EPHEMERAL_FLAG
    });
  });

  it("lets moderators list user memory cards from /hori memory-cards", async () => {
    const runtime = createRuntime({
      slashAdmin: {
        listMemoryCards: vi.fn().mockResolvedValue("- card-1: Важная тема [normal]")
      }
    });
    const interaction = createHoriInteraction({
      userId: "mod-1",
      subcommand: "memory-cards",
      isModerator: true,
      values: {
        user: "user-7",
        action: "list",
        limit: 5
      }
    });

    await routeInteraction(runtime, interaction as never);

    expect(runtime.slashAdmin.listMemoryCards).toHaveBeenCalledWith("guild-1", "user-7", 5);
    expect(interaction.reply).toHaveBeenCalledWith({
      content: "- card-1: Важная тема [normal]",
      flags: EPHEMERAL_FLAG
    });
  });
});
