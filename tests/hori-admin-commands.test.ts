import { describe, expect, it, vi } from "vitest";

import type { BotRuntime } from "../apps/bot/src/bootstrap";
import { routeInteraction } from "../apps/bot/src/router/interaction-router";

const EPHEMERAL_FLAG = 64;

function createRuntime(options: {
  ownerIds?: string[];
  slashAdmin?: Record<string, unknown>;
  knowledge?: Record<string, unknown>;
}) {
  return {
    env: {
      DISCORD_OWNER_IDS: options.ownerIds ?? [],
      OPENAI_MODEL: "gpt-5-nano"
    },
    logger: {
      warn: vi.fn()
    },
    slashAdmin: options.slashAdmin ?? {},
    knowledge: options.knowledge ?? {}
  } as unknown as BotRuntime;
}

function createHoriInteraction(options: {
  userId: string;
  subcommand: string;
  values?: Record<string, unknown>;
  isModerator?: boolean;
}) {
  const reply = vi.fn();
  const deferReply = vi.fn();
  const editReply = vi.fn();
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
      getAttachment: vi.fn().mockImplementation((name: string) => values[name] ?? null)
    },
    reply,
    deferReply,
    editReply,
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

  it("exposes dossier through /hori profile when dossier flag is set", async () => {
    const runtime = createRuntime({
      ownerIds: ["owner-1"],
      slashAdmin: {
        personDossier: vi.fn().mockResolvedValue("Full dossier")
      }
    });
    const interaction = createHoriInteraction({
      userId: "owner-1",
      subcommand: "profile",
      values: {
        user: "user-7",
        dossier: true
      }
    });

    await routeInteraction(runtime, interaction as never);

    expect(runtime.slashAdmin.personDossier).toHaveBeenCalledWith("guild-1", "user-7");
    expect(interaction.reply).toHaveBeenCalledWith({
      content: "Full dossier",
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

  it("lets moderators list knowledge clusters from /hori knowledge", async () => {
    const runtime = createRuntime({
      knowledge: {
        listClusters: vi.fn().mockResolvedValue([
          {
            id: "c1",
            guildId: "guild-1",
            code: "jjs",
            title: "JJS Wiki",
            description: "боёвка и механики",
            trigger: "?",
            enabled: true,
            answerModel: null,
            embedModel: null,
            dimensions: 768
          }
        ])
      }
    });
    const interaction = createHoriInteraction({
      userId: "mod-1",
      subcommand: "knowledge",
      isModerator: true,
      values: {
        action: "list"
      }
    });

    await routeInteraction(runtime, interaction as never);

    expect(runtime.knowledge.listClusters).toHaveBeenCalledWith("guild-1");
    expect(interaction.reply).toHaveBeenCalledWith({
      content: expect.stringContaining("`jjs` ? JJS Wiki"),
      flags: EPHEMERAL_FLAG
    });
  });

  it("shows cluster stats from /hori knowledge stats", async () => {
    const runtime = createRuntime({
      knowledge: {
        getCluster: vi.fn().mockResolvedValue({
          id: "c1",
          guildId: "guild-1",
          code: "jjs",
          title: "JJS Wiki",
          description: null,
          trigger: "?",
          enabled: true,
          answerModel: null,
          embedModel: null,
          dimensions: 768
        }),
        getStats: vi.fn().mockResolvedValue({ articles: 12, chunks: 77 })
      }
    });
    const interaction = createHoriInteraction({
      userId: "mod-1",
      subcommand: "knowledge",
      isModerator: true,
      values: {
        action: "stats",
        code: "jjs"
      }
    });

    await routeInteraction(runtime, interaction as never);

    expect(runtime.knowledge.getCluster).toHaveBeenCalledWith("guild-1", "jjs");
    expect(runtime.knowledge.getStats).toHaveBeenCalledWith("guild-1", "jjs");
    expect(interaction.reply).toHaveBeenCalledWith({
      content: expect.stringContaining("Articles: 12"),
      flags: EPHEMERAL_FLAG
    });
  });

  it("creates a knowledge cluster from /hori knowledge create", async () => {
    const runtime = createRuntime({
      knowledge: {
        createCluster: vi.fn().mockResolvedValue({
          id: "c1",
          guildId: "guild-1",
          code: "jjs",
          title: "JJS Wiki",
          description: "боёвка и механики",
          trigger: "?",
          enabled: true,
          answerModel: null,
          embedModel: null,
          dimensions: null
        })
      }
    });
    const interaction = createHoriInteraction({
      userId: "mod-1",
      subcommand: "knowledge",
      isModerator: true,
      values: {
        action: "create",
        code: "jjs",
        title: "JJS Wiki",
        trigger: "?",
        description: "боёвка и механики"
      }
    });

    await routeInteraction(runtime, interaction as never);

    expect(runtime.knowledge.createCluster).toHaveBeenCalledWith({
      guildId: "guild-1",
      code: "jjs",
      title: "JJS Wiki",
      trigger: "?",
      description: "боёвка и механики",
      answerModel: undefined
    });
    expect(interaction.reply).toHaveBeenCalledWith({
      content: expect.stringContaining("Knowledge cluster создан."),
      flags: EPHEMERAL_FLAG
    });
  });

  it("updates a knowledge cluster from /hori knowledge update", async () => {
    const runtime = createRuntime({
      knowledge: {
        updateCluster: vi.fn().mockResolvedValue({
          id: "c1",
          guildId: "guild-1",
          code: "jjs",
          title: "JJS Wiki",
          description: null,
          trigger: "!",
          enabled: false,
          answerModel: "deepseek-chat",
          embedModel: null,
          dimensions: 768
        })
      }
    });
    const interaction = createHoriInteraction({
      userId: "mod-1",
      subcommand: "knowledge",
      isModerator: true,
      values: {
        action: "update",
        code: "jjs",
        trigger: "!",
        description: "clear",
        "answer-model": "deepseek-chat",
        enabled: false
      }
    });

    await routeInteraction(runtime, interaction as never);

    expect(runtime.knowledge.updateCluster).toHaveBeenCalledWith("guild-1", "jjs", {
      trigger: "!",
      description: null,
      answerModel: "deepseek-chat",
      enabled: false
    });
    expect(interaction.reply).toHaveBeenCalledWith({
      content: expect.stringContaining("Status: off"),
      flags: EPHEMERAL_FLAG
    });
  });

  it("imports knowledge articles from an attachment via /hori knowledge import", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue([
        "---",
        "title: Domain Expansion",
        "sourceUrl: https://example.com/domain-expansion",
        "---",
        "Short answer."
      ].join("\n"))
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      const runtime = createRuntime({
        knowledge: {
          clearArticles: vi.fn().mockResolvedValue({ deletedArticles: 3 }),
          ingestArticles: vi.fn().mockResolvedValue({
            articlesUpserted: 1,
            chunksCreated: 2,
            chunksSkipped: 0
          }),
          getStats: vi.fn().mockResolvedValue({ articles: 4, chunks: 9 })
        }
      });
      const interaction = createHoriInteraction({
        userId: "mod-1",
        subcommand: "knowledge",
        isModerator: true,
        values: {
          action: "import",
          code: "jjs",
          replace: true,
          file: {
            name: "domain-expansion.md",
            size: 1024,
            url: "https://example.com/domain-expansion.md"
          }
        }
      });

      await routeInteraction(runtime, interaction as never);

      expect(interaction.deferReply).toHaveBeenCalledWith({ flags: EPHEMERAL_FLAG });
      expect(runtime.knowledge.clearArticles).toHaveBeenCalledWith("guild-1", "jjs");
      expect(runtime.knowledge.ingestArticles).toHaveBeenCalledWith(
        "guild-1",
        "jjs",
        [
          {
            title: "Domain Expansion",
            content: "Source: https://example.com/domain-expansion\n\nShort answer.",
            sourceUrl: "https://example.com/domain-expansion"
          }
        ]
      );
      expect(runtime.knowledge.getStats).toHaveBeenCalledWith("guild-1", "jjs");
      expect(interaction.editReply).toHaveBeenCalledWith({
        content: expect.stringContaining("Documents parsed: 1")
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("imports knowledge articles from an attachment via /hori import mode=knowledge", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue([
        "---",
        "title: Black Flash",
        "---",
        "Impact timing."
      ].join("\n"))
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      const runtime = createRuntime({
        ownerIds: ["owner-1"],
        knowledge: {
          ingestArticles: vi.fn().mockResolvedValue({
            articlesUpserted: 1,
            chunksCreated: 1,
            chunksSkipped: 0
          }),
          getStats: vi.fn().mockResolvedValue({ articles: 1, chunks: 1 })
        }
      });
      const interaction = createHoriInteraction({
        userId: "owner-1",
        subcommand: "import",
        values: {
          mode: "knowledge",
          code: "jjs",
          file: {
            name: "black-flash.md",
            size: 1024,
            url: "https://example.com/black-flash.md"
          }
        }
      });

      await routeInteraction(runtime, interaction as never);

      expect(interaction.deferReply).toHaveBeenCalledWith({ flags: EPHEMERAL_FLAG });
      expect(runtime.knowledge.ingestArticles).toHaveBeenCalledWith("guild-1", "jjs", [
        {
          title: "Black Flash",
          content: "Impact timing.",
          sourceUrl: null
        }
      ]);
      expect(interaction.editReply).toHaveBeenCalledWith({
        content: expect.stringContaining("Knowledge import завершён для `jjs`.")
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("clears cluster articles from /hori knowledge clear", async () => {
    const runtime = createRuntime({
      knowledge: {
        clearArticles: vi.fn().mockResolvedValue({ deletedArticles: 14 })
      }
    });
    const interaction = createHoriInteraction({
      userId: "mod-1",
      subcommand: "knowledge",
      isModerator: true,
      values: {
        action: "clear",
        code: "jjs"
      }
    });

    await routeInteraction(runtime, interaction as never);

    expect(runtime.knowledge.clearArticles).toHaveBeenCalledWith("guild-1", "jjs");
    expect(interaction.reply).toHaveBeenCalledWith({
      content: "Knowledge cluster `jjs` очищен. Удалено статей: 14.",
      flags: EPHEMERAL_FLAG
    });
  });

  it("deletes a cluster from /hori knowledge delete", async () => {
    const runtime = createRuntime({
      knowledge: {
        deleteCluster: vi.fn().mockResolvedValue(undefined)
      }
    });
    const interaction = createHoriInteraction({
      userId: "mod-1",
      subcommand: "knowledge",
      isModerator: true,
      values: {
        action: "delete",
        code: "jjs"
      }
    });

    await routeInteraction(runtime, interaction as never);

    expect(runtime.knowledge.deleteCluster).toHaveBeenCalledWith("guild-1", "jjs");
    expect(interaction.reply).toHaveBeenCalledWith({
      content: "Knowledge cluster `jjs` удалён.",
      flags: EPHEMERAL_FLAG
    });
  });
});
