import { describe, expect, it, vi } from "vitest";

vi.mock("../apps/bot/src/router/owner-lockdown", () => ({
  shouldIgnoreForOwnerLockdown: vi.fn(async () => false),
  isBotOwner: vi.fn((runtime: { env: { DISCORD_OWNER_IDS: string[] } }, userId: string) => runtime.env.DISCORD_OWNER_IDS.includes(userId)),
  getOwnerLockdownState: vi.fn(async () => ({ enabled: false, updatedBy: null, updatedAt: new Date(0) })),
  setOwnerLockdownState: vi.fn(async () => undefined)
}));

import type { BotRuntime } from "../apps/bot/src/bootstrap";
import { routeInteraction } from "../apps/bot/src/router/interaction-router";

function createOwnerButtonInteraction(customId: string) {
  const update = vi.fn();
  const reply = vi.fn();

  return {
    guildId: "guild-1",
    channelId: "channel-1",
    customId,
    user: {
      id: "owner-1",
      username: "tester",
      globalName: "Tester"
    },
    memberPermissions: {
      has: vi.fn().mockReturnValue(true)
    },
    update,
    reply,
    isButton: () => true,
    isStringSelectMenu: () => false,
    isModalSubmit: () => false,
    isChatInputCommand: () => false,
    isMessageContextMenuCommand: () => false
  };
}

function createModeratorButtonInteraction(customId: string) {
  const update = vi.fn();
  const reply = vi.fn();

  return {
    guildId: "guild-1",
    channelId: "channel-1",
    customId,
    user: {
      id: "mod-1",
      username: "moderator",
      globalName: "Moderator"
    },
    memberPermissions: {
      has: vi.fn().mockReturnValue(true)
    },
    update,
    reply,
    isButton: () => true,
    isStringSelectMenu: () => false,
    isModalSubmit: () => false,
    isChatInputCommand: () => false,
    isMessageContextMenuCommand: () => false
  };
}

function createModeratorSelectInteraction(customId: string, values: string[]) {
  const update = vi.fn();
  const reply = vi.fn();

  return {
    guildId: "guild-1",
    channelId: "channel-1",
    customId,
    values,
    user: {
      id: "mod-1",
      username: "moderator",
      globalName: "Moderator"
    },
    memberPermissions: {
      has: vi.fn().mockReturnValue(true)
    },
    update,
    reply,
    isButton: () => false,
    isStringSelectMenu: () => true,
    isModalSubmit: () => false,
    isChatInputCommand: () => false,
    isMessageContextMenuCommand: () => false
  };
}

function createModeratorModalInteraction(customId: string, values: Record<string, string>) {
  const reply = vi.fn();
  const editReply = vi.fn();
  const deferReply = vi.fn();

  return {
    guildId: "guild-1",
    channelId: "channel-1",
    customId,
    user: {
      id: "mod-1",
      username: "moderator",
      globalName: "Moderator"
    },
    memberPermissions: {
      has: vi.fn().mockReturnValue(true)
    },
    fields: {
      getTextInputValue: vi.fn((key: string) => values[key] ?? "")
    },
    reply,
    editReply,
    deferReply,
    isButton: () => false,
    isStringSelectMenu: () => false,
    isModalSubmit: () => true,
    isChatInputCommand: () => false,
    isMessageContextMenuCommand: () => false
  };
}

function createRuntime(): BotRuntime {
  const promptTemplates = {
    commonCore: {
      key: "commonCore",
      label: "Базовый core",
      description: "base",
      source: "default",
      content: "",
      defaultContent: "",
      updatedBy: null,
      updatedAt: null
    },
    aggressionChecker: {
      key: "aggressionChecker",
      label: "Aggression checker",
      description: "Проверка ответа на токсичность и эскалацию.",
      source: "default",
      content: "check aggression",
      defaultContent: "check aggression",
      updatedBy: null,
      updatedAt: null
    },
    relationshipEvaluator: {
      key: "relationshipEvaluator",
      label: "Relationship evaluator",
      description: "Оценивает динамику отношений и степень близости.",
      source: "default",
      content: "evaluate relationship",
      defaultContent: "evaluate relationship",
      updatedBy: null,
      updatedAt: null
    },
    memorySummarizer: {
      key: "memorySummarizer",
      label: "Memory summarizer",
      description: "Сжимает важные факты в память.",
      source: "default",
      content: "summarize",
      defaultContent: "summarize",
      updatedBy: null,
      updatedAt: null
    }
  } as const;

  return {
    env: {
      DISCORD_OWNER_IDS: ["owner-1"]
    },
    logger: {
      warn: vi.fn()
    },
    promptSlots: {
      getActiveSlot: vi.fn().mockResolvedValue({
        id: "slot-1",
        title: "Правда",
        content: "Говори прямо, без смягчения.",
        strength: 2,
        channelId: "channel-1"
      })
    },
    runtimeConfig: {
      getCorePromptTemplate: vi.fn().mockImplementation(async (_guildId: string, key: keyof typeof promptTemplates) => promptTemplates[key]),
      getCorePromptTemplates: vi.fn().mockResolvedValue({
        commonCore: "Ты Хори. Коротко, по делу, без эссе.",
        memorySummarizer: "summarize",
        aggressionChecker: "check aggression",
        relationshipEvaluator: "evaluate relationship",
        memorySummarizerPrompt: "summarize",
        aggressionCheckerPrompt: "check aggression",
        relationshipEvaluatorPrompt: "evaluate relationship"
      }),
      getCoreEpochState: vi.fn().mockResolvedValue({
        epochId: "dry_echo:2026-05-26T10:00:00.000Z",
        frontId: "dry_echo",
        startedAt: new Date("2026-05-26T10:00:00.000Z"),
        expiresAt: new Date("2026-05-26T12:00:00.000Z"),
        frontText: "Эпоха: сухое эхо."
      }),
      getCoreEpochRotationStatus: vi.fn().mockResolvedValue({
        durationMinutes: 120,
        durationSource: "default",
        activeFrontId: "dry_echo",
        activeFrontLabel: "Сухое эхо",
        activeExpiresAt: new Date("2026-05-26T12:00:00.000Z"),
        fronts: [
          {
            id: "dry_echo",
            label: "Сухое эхо",
            enabled: true,
            builtIn: true,
            source: "default"
          }
        ]
      }),
      listCoreOverrides: vi.fn().mockResolvedValue([
        {
          userId: "user-2",
          coreId: "playful",
          expiresAt: new Date("2026-05-27T12:00:00.000Z"),
          reason: "test override",
          by: "owner-1",
          createdAt: new Date("2026-05-26T10:10:00.000Z")
        }
      ]),
      setCoreOverride: vi.fn().mockResolvedValue(undefined),
      clearCoreOverride: vi.fn().mockResolvedValue(undefined),
      rotateCoreEpoch: vi.fn().mockResolvedValue({
        epochId: "dry_echo:2026-05-26T10:00:00.000Z",
        frontId: "dry_echo",
        startedAt: new Date("2026-05-26T10:00:00.000Z"),
        expiresAt: new Date("2026-05-26T12:00:00.000Z"),
        frontText: "Эпоха: сухое эхо."
      })
    }
  } as unknown as BotRuntime;
}

describe("Hori Panel Core Studio V2", () => {
  it("opens the Core Studio V2 panel for owner", async () => {
    const runtime = createRuntime();
    const interaction = createOwnerButtonInteraction("hori-action:cores_open_panel");

    await routeInteraction(runtime, interaction as never);

    expect(interaction.update).toHaveBeenCalledTimes(1);
    const response = interaction.update.mock.calls[0]?.[0] as {
      embeds: Array<{ data: { title?: string; description?: string } }>;
      components: unknown[];
    };
    expect(response.embeds[0]?.data.title).toBe("🧩 Core Studio V2");
    expect(response.embeds[0]?.data.description).toContain("Production stable core сейчас");
    expect(response.components.length).toBeGreaterThanOrEqual(2);
  });

  it("opens preview mode from cores_preview", async () => {
    const runtime = createRuntime();
    const interaction = createOwnerButtonInteraction("hori-action:cores_preview");

    await routeInteraction(runtime, interaction as never);

    const response = interaction.update.mock.calls[0]?.[0] as {
      embeds: Array<{ data: { title?: string; description?: string } }>;
    };
    expect(response.embeds[1]?.data.title).toBe("🔎 Stable core preview");
    expect(response.embeds[1]?.data.description).toContain("[CORE EPOCH]");
    expect(response.embeds[1]?.data.description).toContain("slot=Правда");
  });

  it("allows moderator to open preview mode", async () => {
    const runtime = createRuntime();
    const interaction = createModeratorButtonInteraction("hori-action:cores_preview");

    await routeInteraction(runtime, interaction as never);

    expect(interaction.update).toHaveBeenCalledTimes(1);
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it("allows moderator to switch views inside Core Studio via select", async () => {
    const runtime = createRuntime();
    const interaction = createModeratorSelectInteraction("core-prompt-panel:view", ["overrides"]);

    await routeInteraction(runtime, interaction as never);

    expect(interaction.update).toHaveBeenCalledTimes(1);
    const response = interaction.update.mock.calls[0]?.[0] as {
      embeds: Array<{ data: { title?: string } }>;
    };
    expect(response.embeds[1]?.data.title).toBe("🎭 Mood overrides");
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it("opens service prompt mode from cores_evaluator", async () => {
    const runtime = createRuntime();
    const interaction = createOwnerButtonInteraction("hori-action:cores_evaluator");

    await routeInteraction(runtime, interaction as never);

    const response = interaction.update.mock.calls[0]?.[0] as {
      embeds: Array<{ data: { title?: string; description?: string } }>;
      components: unknown[];
    };
    expect(response.embeds[1]?.data.title).toContain("🧪");
    expect(response.embeds[1]?.data.title).toContain("Relationship evaluator");
    expect(response.embeds[1]?.data.description).toContain("source=default");
    expect(response.components.length).toBeGreaterThanOrEqual(3);
  });

  it("opens overrides mode from cores_overrides_list", async () => {
    const runtime = createRuntime();
    const interaction = createOwnerButtonInteraction("hori-action:cores_overrides_list");

    await routeInteraction(runtime, interaction as never);

    const response = interaction.update.mock.calls[0]?.[0] as {
      embeds: Array<{ data: { title?: string; description?: string } }>;
    };
    expect(response.embeds[1]?.data.title).toBe("🎭 Mood overrides");
    expect(response.embeds[1]?.data.description).toContain("<@user-2>");
  });

  it("allows moderator to open overrides mode", async () => {
    const runtime = createRuntime();
    const interaction = createModeratorButtonInteraction("hori-action:cores_overrides_list");

    await routeInteraction(runtime, interaction as never);

    expect(interaction.update).toHaveBeenCalledTimes(1);
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it("allows moderator to navigate from preview to overrides inside Core Studio", async () => {
    const runtime = createRuntime();
    const interaction = createModeratorButtonInteraction("core-prompt-panel:show_overrides:refresh");

    await routeInteraction(runtime, interaction as never);

    expect(interaction.update).toHaveBeenCalledTimes(1);
    const response = interaction.update.mock.calls[0]?.[0] as {
      embeds: Array<{ data: { title?: string } }>;
    };
    expect(response.embeds[1]?.data.title).toBe("🎭 Mood overrides");
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it("blocks moderator from owner-only base navigation inside Core Studio", async () => {
    const runtime = createRuntime();
    const interaction = createModeratorButtonInteraction("core-prompt-panel:show_base:refresh");

    await routeInteraction(runtime, interaction as never);

    expect(interaction.update).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledTimes(1);
  });

  it("allows moderator to submit a valid core override modal", async () => {
    const runtime = createRuntime();
    const interaction = createModeratorModalInteraction("hori-modal:core-override:channel-1", {
      userId: "user-9",
      coreId: "core_warm",
      duration: "6h",
      reason: "manual test"
    });

    await routeInteraction(runtime, interaction as never);

    expect(runtime.runtimeConfig.setCoreOverride).toHaveBeenCalledWith(
      "guild-1",
      "user-9",
      "core_warm",
      21_600_000,
      "manual test",
      "mod-1"
    );
    expect(interaction.reply).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid core override duration instead of saving forever", async () => {
    const runtime = createRuntime();
    const interaction = createModeratorModalInteraction("hori-modal:core-override:channel-1", {
      userId: "user-9",
      coreId: "core_warm",
      duration: "tomorrow",
      reason: "manual test"
    });

    await routeInteraction(runtime, interaction as never);

    expect(runtime.runtimeConfig.setCoreOverride).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledTimes(1);
  });

  it("rejects empty userId in core override modal", async () => {
    const runtime = createRuntime();
    const interaction = createModeratorModalInteraction("hori-modal:core-override:channel-1", {
      userId: "   ",
      coreId: "core_warm",
      duration: "1h",
      reason: "manual test"
    });

    await routeInteraction(runtime, interaction as never);

    expect(runtime.runtimeConfig.setCoreOverride).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledTimes(1);
  });

  it("quick rotate action calls runtime rotation and re-renders the studio", async () => {
    const runtime = createRuntime();
    const interaction = createOwnerButtonInteraction("hori-action:cores_rotate_now");

    await routeInteraction(runtime, interaction as never);

    expect(runtime.runtimeConfig.rotateCoreEpoch).toHaveBeenCalledWith(undefined, "owner-1");
    expect(interaction.update).toHaveBeenCalledTimes(1);
  });

  it("preview rotate button rotates to the next epoch instead of pinning current front", async () => {
    const runtime = createRuntime();
    const interaction = createOwnerButtonInteraction("core-prompt-panel:rotate_front");

    await routeInteraction(runtime, interaction as never);

    expect(runtime.runtimeConfig.rotateCoreEpoch).toHaveBeenCalledWith(undefined, "owner-1");
    expect(interaction.update).toHaveBeenCalledTimes(1);
    const response = interaction.update.mock.calls[0]?.[0] as {
      embeds: Array<{ data: { title?: string } }>;
    };
    expect(response.embeds[1]?.data.title).toBe("🔎 Stable core preview");
  });
});