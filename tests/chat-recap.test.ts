import { afterEach, describe, expect, it, vi } from "vitest";

import type { MessageEnvelope } from "@hori/shared";

import type { BotRuntime } from "../apps/bot/src/bootstrap";
import { buildDiscordMessageLink, handleChatRecapCommand, parseChatRecapCommand } from "../apps/bot/src/router/chat-recap";

function createEnvelope(content: string): MessageEnvelope {
  return {
    messageId: "user-msg-1",
    guildId: "guild-1",
    channelId: "channel-1",
    userId: "user-1",
    username: "tester",
    displayName: "Tester",
    channelName: "general",
    content,
    createdAt: new Date("2026-05-03T10:00:00.000Z"),
    replyToMessageId: null,
    mentionCount: 0,
    mentionedBot: false,
    mentionsBotByName: false,
    mentionedUserIds: [],
    triggerSource: "name",
    isDirectMessage: false,
    isModerator: false,
    explicitInvocation: true
  };
}

function createRuntime(): BotRuntime {
  return {
    env: {
      OPENAI_API_KEY: "sk-test",
      OLLAMA_TIMEOUT_MS: 1000,
      OLLAMA_LOG_TRAFFIC: false,
      OLLAMA_LOG_PROMPTS: false,
      OLLAMA_LOG_RESPONSES: false,
      OLLAMA_LOG_MAX_CHARS: 2000
    },
    logger: {
      warn: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      child: vi.fn()
    },
    prisma: {
      botEventLog: {
        findFirst: vi.fn(),
        findMany: vi.fn()
      },
      channelSummary: {
        findMany: vi.fn()
      },
      message: {
        findMany: vi.fn()
      }
    }
  } as unknown as BotRuntime;
}

function createMessage(id: string, createdAt: string, content: string, userId = "user-2") {
  return {
    id,
    userId,
    content,
    createdAt: new Date(createdAt),
    user: {
      username: userId,
      globalName: userId === "bot-1" ? "Hori" : `User ${userId}`,
      isBot: userId === "bot-1"
    }
  };
}

function openAiResponse(content: string, promptTokens = 120, completionTokens = 40) {
  return new Response(JSON.stringify({
    id: "chatcmpl-test",
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: {
          role: "assistant",
          content
        }
      }
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens
    }
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("chat recap helper", () => {
  it("parses fresh and update recap codewords", () => {
    expect(parseChatRecapCommand("перескажи за день")).toEqual({ action: "fresh", mode: "day" });
    expect(parseChatRecapCommand("перескажи последнюю активность")).toEqual({ action: "fresh", mode: "recent" });
    expect(parseChatRecapCommand("обнови пересказ за день")).toEqual({ action: "update", mode: "day" });
    expect(parseChatRecapCommand("обнови пересказ активности")).toEqual({ action: "update", mode: "recent" });
  });

  it("returns the previous recap link instead of regenerating within an hour", async () => {
    const runtime = createRuntime();
    const envelope = createEnvelope("перескажи за день");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    vi.mocked(runtime.prisma.botEventLog.findFirst).mockResolvedValue({
      eventType: "chat_recap_day",
      createdAt: new Date(Date.now() - 15 * 60 * 1000),
      messageId: "recap-msg-1",
      debugTrace: {
        mode: "day",
        action: "fresh",
        windowStart: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        coveredUntil: new Date(Date.now() - 16 * 60 * 1000).toISOString(),
        coveredUntilMessageId: "msg-90",
        sourceSummaryCount: 4,
        rawMessageCount: 22
      }
    });
    vi.mocked(runtime.prisma.message.findMany).mockResolvedValue([]);

    const result = await handleChatRecapCommand(runtime, envelope, "перескажи за день");

    expect(result?.logEvent).toBeUndefined();
    expect(result?.reply).toContain(buildDiscordMessageLink("guild-1", "channel-1", "recap-msg-1"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("builds a fresh day recap through GPT-5 Nano Flex", async () => {
    const runtime = createRuntime();
    const envelope = createEnvelope("перескажи за день");
    const fetchMock = vi.fn().mockResolvedValue(openAiResponse("Что было: обсуждали импорт знаний.\nГлавное:\n- договорились о режиме history\n- добили тесты"));
    vi.stubGlobal("fetch", fetchMock);

    vi.mocked(runtime.prisma.botEventLog.findFirst).mockResolvedValue(null);
    vi.mocked(runtime.prisma.botEventLog.findMany).mockResolvedValue([]);
    vi.mocked(runtime.prisma.channelSummary.findMany).mockResolvedValue([
      {
        rangeStart: new Date("2026-05-03T06:00:00.000Z"),
        rangeEnd: new Date("2026-05-03T08:00:00.000Z"),
        summaryLong: "Обсуждали импорт знаний, чистили prompt path и сверяли тесты."
      }
    ]);
    vi.mocked(runtime.prisma.message.findMany).mockResolvedValue([
      createMessage("msg-101", "2026-05-03T09:15:00.000Z", "Надо ещё добавить режим обновления пересказа."),
      createMessage("msg-102", "2026-05-03T09:16:00.000Z", "Сделаем его через отдельное кодовое слово.")
    ]);

    const result = await handleChatRecapCommand(runtime, envelope, "перескажи за день");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.model).toBe("gpt-5-nano");
    expect(body.service_tier).toBe("flex");
    expect(result?.reply).toContain("Что было:");
    expect(result?.logEvent?.eventType).toBe("chat_recap_day");
    expect(result?.logEvent?.modelUsed).toBe("openai:gpt-5-nano:flex");
  });

  it("updates only the fresh tail for the recent activity mode", async () => {
    const runtime = createRuntime();
    const envelope = createEnvelope("обнови пересказ активности");
    const fetchMock = vi.fn().mockResolvedValue(openAiResponse("Новый хвост: обсуждение ушло в детализацию команды обновления.\n- решили добавлять только delta-блок\n- ссылку на прошлый пересказ сохраняем"));
    vi.stubGlobal("fetch", fetchMock);

    vi.mocked(runtime.prisma.botEventLog.findFirst).mockResolvedValue({
      eventType: "chat_recap_recent",
      createdAt: new Date(Date.now() - 20 * 60 * 1000),
      messageId: "recap-msg-2",
      debugTrace: {
        mode: "recent",
        action: "fresh",
        windowStart: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        coveredUntil: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
        coveredUntilMessageId: "msg-120",
        sourceSummaryCount: 2,
        rawMessageCount: 14
      }
    });
    vi.mocked(runtime.prisma.botEventLog.findMany).mockResolvedValue([{ messageId: "recap-msg-2" }]);
    vi.mocked(runtime.prisma.message.findMany).mockResolvedValue([
      createMessage("msg-201", "2026-05-03T09:31:00.000Z", "Нужен отдельный update path."),
      createMessage("msg-202", "2026-05-03T09:32:00.000Z", "Повторный вопрос не должен пересобирать всё."),
      createMessage("msg-203", "2026-05-03T09:33:00.000Z", "Если сообщений мало, надо просто дать ссылку."),
      createMessage("msg-204", "2026-05-03T09:34:00.000Z", "И порог нужен разный для day и recent."),
      createMessage("msg-205", "2026-05-03T09:35:00.000Z", "Тогда recent не будет шуметь."),
      createMessage("msg-206", "2026-05-03T09:36:00.000Z", "А update возьмёт только свежий tail."),
      createMessage("msg-207", "2026-05-03T09:37:00.000Z", "Нужно ещё исключить сам recap message."),
      createMessage("msg-208", "2026-05-03T09:38:00.000Z", "И фильтровать recap codewords из raw input.")
    ]);

    const result = await handleChatRecapCommand(runtime, envelope, "обнови пересказ активности");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result?.reply).toContain("Апдейт к сводке по последней активности");
    expect(result?.reply).toContain(buildDiscordMessageLink("guild-1", "channel-1", "recap-msg-2"));
    expect(result?.logEvent?.eventType).toBe("chat_recap_recent");
    expect(result?.logEvent?.debugTrace.action).toBe("update");
  });
});