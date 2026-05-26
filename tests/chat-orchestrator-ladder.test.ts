import { describe, expect, it, vi } from "vitest";

import { ChatOrchestrator } from "@hori/core";
import type { MessageEnvelope } from "@hori/shared";

describe("ChatOrchestrator live ladder rendering", () => {
  it("excludes bot turns that target another user and appends the current turn transiently", () => {
    const orchestrator = new ChatOrchestrator({} as never);
    const currentMessage: MessageEnvelope = {
      messageId: "current",
      guildId: "g",
      channelId: "c",
      userId: "user-1",
      username: "user1",
      displayName: "User One",
      content: "сырое текущее сообщение",
      createdAt: new Date("2026-05-13T00:00:04.000Z"),
      replyToMessageId: null,
      mentionCount: 1,
      mentionedBot: true,
      mentionsBotByName: true,
      mentionedUserIds: [],
      triggerSource: "mention",
      isModerator: false,
      explicitInvocation: true
    };

    const turns = (orchestrator as never as {
      buildRecentChatTurns: (message: MessageEnvelope, content: string, contextBundle: unknown) => Array<{ role: string; content: string }>;
    }).buildRecentChatTurns(currentMessage, "очищенное текущее", {
      version: "v2",
      recentMessages: [
        {
          id: "u-old",
          author: "User One",
          userId: "user-1",
          isBot: false,
          content: "прошлое сообщение",
          createdAt: new Date("2026-05-13T00:00:01.000Z"),
          replyToMessageId: null,
          targetUserId: null,
          targetMessageId: null
        },
        {
          id: "b-other",
          author: "Hori",
          userId: "bot-user",
          isBot: true,
          content: "ответ другому",
          createdAt: new Date("2026-05-13T00:00:02.000Z"),
          replyToMessageId: "u-other",
          targetUserId: "user-2",
          targetMessageId: "u-other"
        },
        {
          id: "b-me",
          author: "Hori",
          userId: "bot-user",
          isBot: true,
          content: "ответ мне",
          createdAt: new Date("2026-05-13T00:00:03.000Z"),
          replyToMessageId: "u-old",
          targetUserId: "user-1",
          targetMessageId: "u-old"
        },
        {
          id: "current",
          author: "User One",
          userId: "user-1",
          isBot: false,
          content: "сырое текущее сообщение",
          createdAt: new Date("2026-05-13T00:00:04.000Z"),
          replyToMessageId: null,
          targetUserId: null,
          targetMessageId: null
        }
      ],
      relationship: null,
      repliedMessageId: null,
      activeMemory: undefined
    });

    expect(turns.map((turn) => turn.content)).toEqual([
      "Пользователь -> Хори: прошлое сообщение",
      "Хори -> User One: ответ мне",
      "Пользователь -> Хори: очищенное текущее"
    ]);
  });

  it("builds a concluding focus block with compact relationship guidance", () => {
    const orchestrator = new ChatOrchestrator({} as never);
    const currentMessage: MessageEnvelope = {
      messageId: "current",
      guildId: "g",
      channelId: "c",
      userId: "user-1",
      username: "user1",
      displayName: "User One",
      content: "сырое текущее сообщение",
      createdAt: new Date("2026-05-13T00:00:04.000Z"),
      replyToMessageId: null,
      mentionCount: 1,
      mentionedBot: true,
      mentionsBotByName: true,
      mentionedUserIds: [],
      triggerSource: "mention",
      isModerator: false,
      explicitInvocation: true
    };

    const focusBlock = (orchestrator as never as {
      buildFocusLockBlock: (message: MessageEnvelope, relationship?: unknown) => string;
    }).buildFocusLockBlock(currentMessage, {
      relationshipState: "teasing",
      roastLevel: 3,
      toneBias: "sharp",
      doNotMock: false,
      doNotInitiate: false,
      protectedTopics: [],
      escalationStage: 1
    });

    expect(focusBlock).toContain("[ФОКУС]");
    expect(focusBlock).toContain("Текущий адресат: User One");
    expect(focusBlock).toContain("distance=close");
    expect(focusBlock).toContain("mockery=medium");
    expect(focusBlock).toContain("caution=medium");
    expect(focusBlock).toContain("tone=sharp");
  });

  it("builds a compact hooks block", () => {
    const orchestrator = new ChatOrchestrator({} as never);

    const hooksBlock = (orchestrator as never as {
      buildHooksBlock: (hooks: Array<{ label: string; detail: string; useTag?: string | null; avoidTag?: string | null }>) => string;
    }).buildHooksBlock([
      {
        label: "profile",
        detail: "любит быстрый и колкий темп",
        useTag: "snappy"
      },
      {
        label: "recent",
        detail: "последние пару диалогов осторожнее с подколами",
        avoidTag: "pile-on"
      }
    ]);

    expect(hooksBlock).toContain("[ХУКИ]");
    expect(hooksBlock).toContain("- profile: любит быстрый и колкий темп (use=snappy)");
    expect(hooksBlock).toContain("- recent: последние пару диалогов осторожнее с подколами (avoid=pile-on)");
  });

  it("builds a stable core prompt with epoch front and slot block", () => {
    const orchestrator = new ChatOrchestrator({} as never);

    const stableCorePrompt = (orchestrator as never as {
      buildStableCorePrompt: (input: {
        commonCore: string;
        coreEpoch: { epochId: string; frontId: string; frontText: string };
        activePromptSlot?: { title: string; content: string; strength: number } | null;
      }) => string;
    }).buildStableCorePrompt({
      commonCore: "общий core",
      coreEpoch: {
        epochId: "dry_echo:2026-05-13T00:00:00.000Z",
        frontId: "dry_echo",
        frontText: "Эпоха: сухое эхо."
      },
      activePromptSlot: {
        title: "Фокус",
        content: "держись темы панели",
        strength: 2
      }
    });

    expect(stableCorePrompt).toContain("общий core");
    expect(stableCorePrompt).toContain("[CORE EPOCH]");
    expect(stableCorePrompt).toContain("frontId=dry_echo");
    expect(stableCorePrompt).toContain("[Фокус]");
    expect(stableCorePrompt).toContain("🎯 Главный фокус: держись темы панели");
  });

  it("sends the chat message array in the exact production order", async () => {
    let capturedMessages: Array<{ role: string; content: string }> = [];

    const orchestrator = new ChatOrchestrator({
      llmClient: {
        chat: vi.fn(async (input: { messages: Array<{ role: string; content: string }> }) => {
          capturedMessages = input.messages;
          return { message: { content: "ok" } };
        })
      },
      modelRouter: {
        pickProfile: vi.fn(() => ({ maxTokens: 256, temperature: 0.4, topP: 0.9 })),
        pickModelForSlot: vi.fn(() => "test-model")
      }
    } as never);

    const currentMessage: MessageEnvelope = {
      messageId: "current",
      guildId: "g",
      channelId: "c",
      userId: "user-1",
      username: "user1",
      displayName: "User One",
      content: "сырое текущее сообщение",
      createdAt: new Date("2026-05-13T00:00:04.000Z"),
      replyToMessageId: null,
      mentionCount: 1,
      mentionedBot: true,
      mentionsBotByName: true,
      mentionedUserIds: [],
      triggerSource: "mention",
      isModerator: false,
      explicitInvocation: true
    };

    const stableCorePrompt = (orchestrator as never as {
      buildStableCorePrompt: (input: {
        commonCore: string;
        coreEpoch: { epochId: string; frontId: string; frontText: string };
        activePromptSlot?: { title: string; content: string; strength: number } | null;
      }) => string;
    }).buildStableCorePrompt({
      commonCore: "общий core",
      coreEpoch: {
        epochId: "dry_echo:2026-05-13T00:00:00.000Z",
        frontId: "dry_echo",
        frontText: "Эпоха: сухое эхо."
      },
      activePromptSlot: {
        title: "Фокус",
        content: "держись темы панели",
        strength: 2
      }
    });

    const reply = await (orchestrator as never as {
      handleChat: (options: {
        message: MessageEnvelope;
        content: string;
        stableCorePrompt: string;
        contextBundle: {
          recentMessages: Array<{
            id: string;
            author: string;
            userId: string;
            isBot: boolean;
            content: string;
            createdAt: Date;
            replyToMessageId: string | null;
            targetUserId: string | null;
            targetMessageId: string | null;
          }>;
        };
        relationshipHooks: Array<{ label: string; detail: string; useTag?: string | null; avoidTag?: string | null }>;
        relationship?: {
          relationshipState: string;
          roastLevel: number;
          toneBias: string;
          doNotMock: boolean;
          escalationStage: number;
          protectedTopics: string[];
        } | null;
        runtimeSettings: {
          llmReplyMaxTokens: number;
          modelRouting: Record<string, never>;
          ollamaKeepAlive?: string;
          ollamaNumCtx?: number;
          ollamaNumBatch?: number;
        };
        maxTokens?: number;
        contour?: "A" | "B" | "C";
      }) => Promise<string>;
    }).handleChat({
      message: currentMessage,
      content: "очищенное текущее",
      stableCorePrompt,
      contextBundle: {
        recentMessages: [
          {
            id: "summary-1",
            author: "summary",
            userId: "session-summary",
            isBot: true,
            content: "[СЕССИЯ] раньше уже обсудили панель",
            createdAt: new Date("2026-05-13T00:00:01.000Z"),
            replyToMessageId: null,
            targetUserId: null,
            targetMessageId: null
          },
          {
            id: "u-old",
            author: "User One",
            userId: "user-1",
            isBot: false,
            content: "прошлое сообщение",
            createdAt: new Date("2026-05-13T00:00:02.000Z"),
            replyToMessageId: null,
            targetUserId: null,
            targetMessageId: null
          },
          {
            id: "b-me",
            author: "Hori",
            userId: "bot-user",
            isBot: true,
            content: "ответ мне",
            createdAt: new Date("2026-05-13T00:00:03.000Z"),
            replyToMessageId: "u-old",
            targetUserId: "user-1",
            targetMessageId: "u-old"
          }
        ]
      },
      relationshipHooks: [
        {
          label: "profile",
          detail: "любит быстрый и колкий темп",
          useTag: "snappy"
        }
      ],
      relationship: {
        relationshipState: "teasing",
        roastLevel: 3,
        toneBias: "sharp",
        doNotMock: false,
        escalationStage: 1,
        protectedTopics: []
      },
      runtimeSettings: {
        llmReplyMaxTokens: 220,
        modelRouting: {},
        ollamaKeepAlive: undefined,
        ollamaNumCtx: undefined,
        ollamaNumBatch: undefined
      },
      contour: "C"
    });

    expect(reply).toBe("ok");
    expect(capturedMessages).toEqual([
      {
        role: "system",
        content: stableCorePrompt
      },
      {
        role: "system",
        content: "[ХУКИ]\n- profile: любит быстрый и колкий темп (use=snappy)"
      },
      {
        role: "assistant",
        content: "[СЕССИЯ] раньше уже обсудили панель"
      },
      {
        role: "user",
        content: "Пользователь -> Хори: прошлое сообщение"
      },
      {
        role: "assistant",
        content: "Хори -> User One: ответ мне"
      },
      {
        role: "user",
        content: "Пользователь -> Хори: очищенное текущее"
      },
      {
        role: "system",
        content: [
          "[ФОКУС]",
          "Текущий адресат: User One",
          "Отвечай на последнее сообщение этого пользователя в окне.",
          "Не перескакивай на чужие линии без явной связи.",
          "",
          "[ОТНОШЕНИЕ]",
          "distance=close",
          "mockery=medium",
          "caution=medium",
          "tone=sharp"
        ].join("\n")
      }
    ]);
  });

  it("uses configurable aggression timeout text with the minutes placeholder", async () => {
    const currentMessage: MessageEnvelope = {
      messageId: "current",
      guildId: "g",
      channelId: "c",
      userId: "user-1",
      username: "user1",
      displayName: "User One",
      content: "сырое текущее сообщение",
      createdAt: new Date("2026-05-13T00:00:04.000Z"),
      replyToMessageId: null,
      mentionCount: 1,
      mentionedBot: true,
      mentionsBotByName: true,
      mentionedUserIds: [],
      triggerSource: "mention",
      isModerator: false,
      explicitInvocation: true
    };

    const confirmAggression = vi.fn().mockResolvedValue(undefined);
    const orchestrator = new ChatOrchestrator({
      llmClient: {
        chat: vi.fn(async () => ({ message: { content: "AGGRESSIVE" } }))
      },
      modelRouter: {
        pickProfile: vi.fn(() => ({ maxTokens: 64, temperature: 0, topP: 0.1 })),
        pickModelForSlot: vi.fn(() => "test-model")
      },
      runtimeConfig: {
        getAggressionReplacementTexts: vi.fn().mockResolvedValue({
          stage1: "s1",
          stage2: "s2",
          stage3: "s3",
          timeout: "бан на {minutes} минут."
        })
      },
      relationships: {
        noteAggressionMarker: vi.fn().mockResolvedValue({ escalationStage: 4 }),
        confirmAggression
      }
    } as never);

    const result = await (orchestrator as never as {
      applyAggressionPipeline: (input: {
        message: MessageEnvelope;
        reply: string;
        relationship?: { escalationStage?: number | null } | null;
        corePromptTemplates: { aggressionCheckerPrompt: string };
        runtimeSettings: {
          llmReplyMaxTokens: number;
          ollamaKeepAlive: string;
          ollamaNumCtx: number;
          ollamaNumBatch: number;
          maxTimeoutMinutes: number;
          modelRouting: unknown;
        };
        llmCalls?: unknown[];
      }) => Promise<{
        moderationAction: { kind: "timeout"; durationMinutes: number; replacementText: string } | null;
        trace: { replacementText: string | null; checkerVerdict: string };
      }>;
    }).applyAggressionPipeline({
      message: currentMessage,
      reply: "агрессивно",
      relationship: { escalationStage: 3 },
      corePromptTemplates: {
        aggressionCheckerPrompt: "last={last_user_message}; hori={hori_response}"
      },
      runtimeSettings: {
        llmReplyMaxTokens: 64,
        ollamaKeepAlive: "0",
        ollamaNumCtx: 2048,
        ollamaNumBatch: 128,
        maxTimeoutMinutes: 15,
        modelRouting: {}
      }
    });

    expect(result.moderationAction).toMatchObject({
      kind: "timeout",
      durationMinutes: 15,
      replacementText: "бан на 15 минут."
    });
    expect(result.trace).toMatchObject({
      checkerVerdict: "AGGRESSIVE",
      replacementText: "бан на 15 минут."
    });
    expect(confirmAggression).toHaveBeenCalledWith("g", "user-1", { timedOut: true });
  });
});