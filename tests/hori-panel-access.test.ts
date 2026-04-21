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
  const reply = vi.fn();

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
    reply,
    isButton: () => false,
    isStringSelectMenu: () => true,
    isModalSubmit: () => false,
    isChatInputCommand: () => false,
    isMessageContextMenuCommand: () => false
  };
}

function createLlmPanelRuntimeSelectInteraction(userId: string, value: string) {
  const update = vi.fn();

  return {
    guildId: "guild-1",
    channelId: "channel-1",
    customId: "llm-panel:runtime",
    values: [value],
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

function createLlmPanelResetButtonInteraction(userId: string) {
  const update = vi.fn();
  const reply = vi.fn();

  return {
    guildId: "guild-1",
    channelId: "channel-1",
    customId: "llm-panel:reset-slot:chat",
    user: {
      id: userId,
      username: "tester",
      globalName: "Tester"
    },
    memberPermissions: {
      has: vi.fn().mockReturnValue(false)
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

function createLlmPanelRuntime(
  ownerIds: string[],
  storedRouting?: string,
  overrides?: {
    provider?: "openai" | "router" | "ollama";
    hydeStatus?: { value: boolean; source: string };
    embedStatus?: { value?: number; source: string };
  }
): BotRuntime {
  const env = loadEnv({
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/hori",
    REDIS_URL: "redis://localhost:6379",
    LLM_PROVIDER: overrides?.provider ?? "openai",
    OPENAI_MODEL: "gpt-5-nano",
    GEMINI_FLASH_MODEL: "gemini-2.5-flash",
    GEMINI_PRO_MODEL: "gemini-2.5-pro",
    CF_MODEL: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    GITHUB_MODEL_PRIMARY: "gpt-4o-mini"
  });
  const resolvedModelRouting = resolveModelRouting(env, storedRouting);

  return {
    env: {
      ...env,
      DISCORD_OWNER_IDS: ownerIds
    },
    logger: {
      warn: vi.fn()
    },
    runtimeConfig: {
      getModelRoutingStatus: vi.fn().mockResolvedValue(resolvedModelRouting),
      getMemoryHydeStatus: vi.fn().mockResolvedValue(overrides?.hydeStatus ?? { value: true, source: "default" }),
      getOpenAIEmbeddingDimensionsStatus: vi.fn().mockResolvedValue(overrides?.embedStatus ?? { value: 768, source: "default" }),
      setModelPreset: vi.fn().mockResolvedValue(resolvedModelRouting),
      setModelSlot: vi.fn().mockResolvedValue(resolvedModelRouting),
      resetModelSlot: vi.fn().mockResolvedValue(resolvedModelRouting),
      resetModelRouting: vi.fn().mockResolvedValue(resolvedModelRouting),
      setMemoryHydeEnabled: vi.fn().mockResolvedValue({ value: false, source: "runtime_setting" }),
      setOpenAIEmbeddingDimensions: vi.fn().mockResolvedValue({ value: 512, source: "runtime_setting" }),
      resetMemoryHydeEnabled: vi.fn().mockResolvedValue({ value: true, source: "default" }),
      resetOpenAIEmbeddingDimensions: vi.fn().mockResolvedValue({ value: 768, source: "default" })
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

  it("lets the owner toggle HyDE from the panel", async () => {
    const interaction = createLlmPanelRuntimeSelectInteraction("owner-1", "hyde:off");
    const runtime = createLlmPanelRuntime(["owner-1"]);

    await routeInteraction(runtime, interaction as never);

    expect(runtime.runtimeConfig.setMemoryHydeEnabled).toHaveBeenCalledWith(false, "owner-1");
    expect(interaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.any(Array),
        components: expect.any(Array)
      })
    );
  });

  it("lets the owner change embedding dimensions from the panel", async () => {
    const interaction = createLlmPanelRuntimeSelectInteraction("owner-1", "embed:512");
    const runtime = createLlmPanelRuntime(["owner-1"]);

    await routeInteraction(runtime, interaction as never);

    expect(runtime.runtimeConfig.setOpenAIEmbeddingDimensions).toHaveBeenCalledWith(512, "owner-1");
    expect(interaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.any(Array),
        components: expect.any(Array)
      })
    );
  });

  it("shows router-mode model controls as informational-only while keeping embedding runtime controls", async () => {
    const interaction = createLlmPanelButtonInteraction("owner-1");
    const runtime = createLlmPanelRuntime(
      ["owner-1"],
      serializeModelRouting("quality_openai", { chat: "gpt-5.4-mini" }),
      {
        provider: "router",
        embedStatus: { value: 768, source: "default" }
      }
    );

    await routeInteraction(runtime, interaction as never);

    const payload = interaction.update.mock.calls[0][0];
    const rows = payload.components.map((row: { toJSON: () => { components: Array<{ disabled?: boolean; options?: Array<{ value: string }> }> } }) => row.toJSON());
    const description = payload.embeds[0].data.description as string;

    expect(description).toContain("Model controls: **informational-only**");
    expect(description).toContain("Ignored stored preset: `quality_openai`");
    expect(rows[0].components[0].disabled).toBe(true);
    expect(rows[2].components[0].disabled).toBe(true);
    expect(rows[3].components[0].options?.some((option) => option.value === "embed:512")).toBe(true);
    expect(rows[4].components[0].disabled).toBe(true);
    expect(rows[4].components[1].disabled).toBe(true);
  });

  it("rejects stale router-mode model select interactions without mutating runtime config", async () => {
    const interaction = createLlmPanelModelSelectInteraction("owner-1");
    const runtime = createLlmPanelRuntime(["owner-1"], undefined, { provider: "router" });

    await routeInteraction(runtime, interaction as never);

    expect(runtime.runtimeConfig.setModelSlot).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith({
      content: expect.stringContaining("informational-only"),
      flags: EPHEMERAL_FLAG
    });
    expect(interaction.update).not.toHaveBeenCalled();
  });

  it("rejects stale router-mode reset buttons without mutating runtime config", async () => {
    const interaction = createLlmPanelResetButtonInteraction("owner-1");
    const runtime = createLlmPanelRuntime(["owner-1"], undefined, { provider: "router" });

    await routeInteraction(runtime, interaction as never);

    expect(runtime.runtimeConfig.resetModelSlot).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith({
      content: expect.stringContaining("informational-only"),
      flags: EPHEMERAL_FLAG
    });
    expect(interaction.update).not.toHaveBeenCalled();
  });
});
