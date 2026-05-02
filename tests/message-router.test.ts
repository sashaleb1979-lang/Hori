import { describe, expect, it, vi } from "vitest";

vi.mock("../apps/bot/src/router/background-jobs", () => ({
  enqueueBackgroundJobs: vi.fn(async () => undefined)
}));

vi.mock("../apps/bot/src/router/owner-lockdown", () => ({
  getOwnerLockdownState: vi.fn(async () => ({ enabled: false, updatedBy: null, updatedAt: new Date(0) })),
  isBotOwner: vi.fn(() => false)
}));

import { EMPTY_REPLY_FALLBACK, prepareReplyForDelivery, resolveModerationReplyForDelivery, routeMessage } from "../apps/bot/src/router/message-router";

describe("prepareReplyForDelivery", () => {
  it("replaces blank string replies with a fallback", () => {
    expect(prepareReplyForDelivery("")).toBe(EMPTY_REPLY_FALLBACK);
    expect(prepareReplyForDelivery("   ")).toBe(EMPTY_REPLY_FALLBACK);
    expect(prepareReplyForDelivery(undefined)).toBe(EMPTY_REPLY_FALLBACK);
  });

  it("preserves media payloads even when their text is blank", () => {
    const reply = {
      text: "",
      media: {
        filePath: "assets/memes/test.png",
        mediaId: "media-1",
        type: "image"
      }
    };

    expect(prepareReplyForDelivery(reply)).toBe(reply);
  });

  it("replaces blank payload text when there is no media", () => {
    expect(prepareReplyForDelivery({ text: "   " })).toEqual({ text: EMPTY_REPLY_FALLBACK });
  });

  it("does not promise a timeout phrase when moderation could not be applied", async () => {
    const reply = await resolveModerationReplyForDelivery(
      {
        logger: { warn: vi.fn() }
      } as never,
      {
        inGuild: () => true,
        guild: {
          members: {
            me: {
              permissions: {
                has: () => false
              }
            }
          }
        }
      } as never,
      "ответ",
      {
        kind: "timeout",
        durationMinutes: 15,
        replacementText: "тайм-аут на 15 минут."
      }
    );

    expect(reply).toBe("ответ");
  });

  it("appends the timeout phrase only after Discord timeout succeeds", async () => {
    const timeout = vi.fn().mockResolvedValue(undefined);
    const reply = await resolveModerationReplyForDelivery(
      {
        logger: { warn: vi.fn() }
      } as never,
      {
        inGuild: () => true,
        guildId: "guild-1",
        channelId: "channel-1",
        author: { id: "user-1" },
        guild: {
          members: {
            me: {
              permissions: {
                has: () => true
              }
            }
          }
        },
        member: {
          moderatable: true,
          timeout
        }
      } as never,
      "ответ",
      {
        kind: "timeout",
        durationMinutes: 15,
        replacementText: "тайм-аут на 15 минут."
      }
    );

    expect(timeout).toHaveBeenCalledWith(15 * 60 * 1000, "Hori stage 4 aggression timeout");
    expect(reply).toBe("ответ тайм-аут на 15 минут.");
  });

  it("ingests delivered bot replies so later chat turns include assistant history", async () => {
    const ingestMessage = vi.fn().mockResolvedValue({ deduplicated: false });
    const sentReply = {
      id: "bot-msg-1",
      inGuild: () => true,
      guildId: "guild-1",
      channelId: "channel-1",
      author: {
        id: "bot-1",
        username: "Hori",
        globalName: "Hori"
      },
      member: {
        displayName: "Hori"
      },
      content: "Привет",
      createdAt: new Date("2026-05-01T10:00:01.000Z"),
      reference: {
        messageId: "user-msg-1"
      },
      mentions: {
        has: () => false,
        users: new Map()
      },
      guild: {
        name: "Guild 1"
      },
      channel: {
        name: "general"
      }
    };
    const member = {
      displayName: "Гном",
      permissions: {
        has: () => false
      }
    };
    const message = {
      id: "user-msg-1",
      guildId: "guild-1",
      channelId: "channel-1",
      content: "<@bot-1> привет",
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      author: {
        id: "user-1",
        username: "Gnom",
        bot: false
      },
      member,
      guild: {
        name: "Guild 1",
        members: {
          fetch: vi.fn(),
          fetchMe: vi.fn(),
          me: null
        }
      },
      channel: {
        name: "general",
        send: vi.fn()
      },
      mentions: {
        has: (id: string) => id === "bot-1",
        users: new Map([["bot-1", { id: "bot-1" }]])
      },
      attachments: {
        size: 0
      },
      reference: null,
      inGuild: () => true,
      reply: vi.fn().mockResolvedValue(sentReply)
    };
    const runtime = {
      client: {
        user: {
          id: "bot-1",
          username: "Hori"
        }
      },
      env: {
        DISCORD_OWNER_IDS: [],
        AUTOINTERJECT_CHANNEL_ALLOWLIST: [],
        NATURAL_SPLIT_COOLDOWN_SEC: 60,
        NATURAL_SPLIT_CHANCE: 0.01
      },
      prisma: {
        botEventLog: {
          create: vi.fn()
        },
        interjectionLog: {
          create: vi.fn()
        }
      },
      runtimeConfig: {
        getRoutingConfig: vi.fn().mockResolvedValue({
          guildSettings: {
            botName: "Хори",
            interjectTendency: 0,
            forbiddenWords: []
          },
          featureFlags: {
            autoInterject: false,
            replyQueueEnabled: false,
            naturalMessageSplittingEnabled: false
          },
          channelPolicy: {
            isMuted: false,
            allowBotReplies: true,
            allowInterjections: false,
            topicInterestTags: []
          }
        })
      },
      ingestService: {
        ingestMessage
      },
      knowledge: {
        matchTrigger: vi.fn()
      },
      orchestrator: {
        handleMessage: vi.fn().mockResolvedValue({
          reply: "Привет",
          moderationAction: null,
          trace: {
            responded: true,
            intent: "chat",
            triggerSource: "mention",
            behavior: {
              messageKind: "casual_address"
            }
          }
        })
      },
      logger: {
        error: vi.fn(),
        warn: vi.fn()
      },
      replyQueue: {},
      queuePhrasePool: {},
      relationshipService: {}
    };

    await routeMessage(runtime as never, message as never);

    expect(ingestMessage).toHaveBeenCalledTimes(2);
    expect(ingestMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        messageId: "user-msg-1",
        isBotUser: false
      })
    );
    expect(ingestMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        messageId: "bot-msg-1",
        userId: "bot-1",
        content: "Привет",
        replyToMessageId: "user-msg-1",
        isBotUser: true,
        explicitInvocation: false
      })
    );
  });

  it("returns before ingest when channel access mode is off", async () => {
    const ingestMessage = vi.fn();
    const message = {
      guildId: "guild-1",
      channelId: "channel-1",
      content: "<@bot-1> привет",
      author: { id: "user-1", username: "user", bot: false },
      member: { permissions: { has: () => false } },
      guild: { members: { fetch: vi.fn() } },
      mentions: { users: new Map(), has: () => true },
      attachments: { size: 0 },
      inGuild: () => true
    };
    const runtime = {
      client: { user: { id: "bot-1", username: "Hori" } },
      env: { DISCORD_OWNER_IDS: [], AUTOINTERJECT_CHANNEL_ALLOWLIST: [] },
      runtimeConfig: {
        getRoutingConfig: vi.fn().mockResolvedValue({
          guildSettings: { botName: "Хори", interjectTendency: 0, forbiddenWords: [] },
          featureFlags: { autoInterject: false, replyQueueEnabled: false, naturalMessageSplittingEnabled: false },
          channelPolicy: { accessMode: "off", isMuted: true, allowBotReplies: false, allowInterjections: false, topicInterestTags: [] }
        })
      },
      ingestService: { ingestMessage },
      prisma: {},
      logger: { warn: vi.fn(), error: vi.fn() }
    };

    await routeMessage(runtime as never, message as never);

    expect(ingestMessage).not.toHaveBeenCalled();
  });

  it("still ingests user messages in silent channels", async () => {
    const ingestMessage = vi.fn().mockResolvedValue({ deduplicated: false });
    const createLog = vi.fn().mockResolvedValue(undefined);
    const message = {
      id: "user-msg-2",
      guildId: "guild-1",
      channelId: "channel-1",
      content: "<@bot-1> привет",
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      author: { id: "user-1", username: "user", bot: false },
      member: {
        displayName: "user",
        permissions: { has: () => false }
      },
      guild: {
        name: "Guild 1",
        members: { fetch: vi.fn() }
      },
      channel: { name: "general" },
      mentions: {
        users: new Map([["bot-1", { id: "bot-1" }]]),
        has: (id: string) => id === "bot-1"
      },
      attachments: { size: 0 },
      reference: null,
      inGuild: () => true
    };
    const runtime = {
      client: { user: { id: "bot-1", username: "Hori" } },
      env: { DISCORD_OWNER_IDS: [], AUTOINTERJECT_CHANNEL_ALLOWLIST: [] },
      runtimeConfig: {
        getRoutingConfig: vi.fn().mockResolvedValue({
          guildSettings: { botName: "Хори", interjectTendency: 0, forbiddenWords: [] },
          featureFlags: { autoInterject: false, replyQueueEnabled: false, naturalMessageSplittingEnabled: false },
          channelPolicy: { accessMode: "silent", isMuted: false, allowBotReplies: false, allowInterjections: false, topicInterestTags: [] }
        })
      },
      ingestService: { ingestMessage },
      prisma: { botEventLog: { create: createLog } },
      knowledge: { matchTrigger: vi.fn() },
      logger: { warn: vi.fn(), error: vi.fn() }
    };

    await routeMessage(runtime as never, message as never);

    expect(ingestMessage).toHaveBeenCalledTimes(1);
    expect(createLog).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ routeReason: "channel replies disabled" })
    }));
  });
});
