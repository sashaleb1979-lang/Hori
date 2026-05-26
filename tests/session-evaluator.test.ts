import { afterEach, describe, expect, it, vi } from "vitest";

import { createSessionJob, parseHookEvaluatorOutput } from "../apps/worker/src/jobs/session-evaluator";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("parseHookEvaluatorOutput", () => {
  it("parses strict JSON hook payloads and trims invalid entries", () => {
    const parsed = parseHookEvaluatorOutput(`
      {
        "hooks": [
          {
            "label": "profile",
            "detail": "любит быстрый и сухой темп",
            "useTag": "snappy",
            "avoidTag": "pile on",
            "confidence": 0.82,
            "freshness": "fresh"
          },
          {
            "label": "",
            "detail": "это должно отвалиться"
          }
        ]
      }
    `);

    expect(parsed.hooks).toEqual([
      {
        label: "profile",
        detail: "любит быстрый и сухой темп",
        useTag: "snappy",
        avoidTag: "pile_on",
        confidence: 0.82,
        freshness: "fresh"
      }
    ]);
  });

  it("uses channel session state instead of rescanning channel history", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-13T08:25:00.000Z"));

    const sessionStart = new Date("2026-05-13T08:00:00.000Z");
    const lastActivityAt = new Date("2026-05-13T08:10:00.000Z");
    const llmChat = vi.fn()
      .mockResolvedValueOnce({
        message: {
          content: JSON.stringify({
            verdict: "A",
            characteristic: "держит сухую пикировку",
            lastChange: "стал увереннее"
          })
        }
      })
      .mockResolvedValueOnce({
        message: {
          content: JSON.stringify({
            hooks: [
              {
                label: "stubborn",
                detail: "упирается до конца",
                useTag: "tech_argument",
                confidence: 0.8,
                freshness: "steady"
              }
            ]
          })
        }
      });

    const sessionBuffer = {
      getChannelSessionState: vi.fn().mockResolvedValue({
        sessionSince: sessionStart,
        lastActivityAt,
        compactionCount: 1,
        hasCompaction: true,
        participants: ["user-1"],
        sleepUntil: null
      }),
      getCompactedSessionMessages: vi.fn().mockResolvedValue([
        { userId: "session-summary", isBot: true, content: "summary", createdAt: new Date("2026-05-13T08:01:00.000Z") },
        { userId: "user-1", isBot: false, content: "раз", createdAt: new Date("2026-05-13T08:02:00.000Z") },
        { userId: "bot", isBot: true, content: "два", createdAt: new Date("2026-05-13T08:03:00.000Z") },
        { userId: "user-1", isBot: false, content: "три", createdAt: new Date("2026-05-13T08:04:00.000Z") },
        { userId: "user-1", isBot: false, content: "четыре", createdAt: new Date("2026-05-13T08:05:00.000Z") }
      ]),
      clearSession: vi.fn().mockResolvedValue(undefined),
      setGuildSleepUntil: vi.fn().mockResolvedValue(undefined),
      setChannelSessionSleepUntil: vi.fn().mockResolvedValue(undefined)
    };

    const runtime = {
      runtimeConfig: {
        getRuntimeSettings: vi.fn().mockResolvedValue({
          relationshipGrowthMode: "FULL_AUTO",
          modelRouting: undefined
        }),
        getCorePromptTemplates: vi.fn().mockResolvedValue({
          relationshipEvaluatorPrompt: "Сессия:\n{session_messages}\nПредыдущее: {previous_characteristic}"
        })
      },
      sessionBuffer,
      modelRouter: {
        pickModel: vi.fn().mockReturnValue("gpt-5-nano"),
        pickModelForSlot: vi.fn().mockReturnValue("gpt-5-nano")
      },
      llmClient: {
        chat: llmChat
      },
      relationshipService: {
        getVector: vi.fn().mockResolvedValue({ characteristic: "старое состояние" }),
        listPromptHooks: vi.fn().mockResolvedValue([]),
        mergePromptHooks: vi.fn().mockImplementation(async (_guildId: string, _userId: string, hooks: Array<Record<string, unknown>>) => hooks.map((hook, index) => ({ ...hook, id: `hook-${index}` }))),
        applySessionVerdict: vi.fn().mockResolvedValue(undefined)
      },
      prisma: {
        botEventLog: {
          findMany: vi.fn().mockResolvedValue([]),
          create: vi.fn().mockResolvedValue({})
        }
      },
      logger: {
        warn: vi.fn()
      }
    } as never;

    const result = await createSessionJob(runtime)({
      id: "job-1",
      data: {
        guildId: "guild-1",
        channelId: "channel-1",
        userId: "user-1"
      }
    } as never);

    expect(sessionBuffer.getChannelSessionState).toHaveBeenCalledWith("guild-1", "channel-1");
    expect(sessionBuffer.setGuildSleepUntil).toHaveBeenCalledTimes(1);
    expect(sessionBuffer.setChannelSessionSleepUntil).toHaveBeenCalledWith(
      "guild-1",
      "channel-1",
      expect.any(Date)
    );
    expect(sessionBuffer.clearSession).toHaveBeenCalledWith("guild-1", "user-1", "channel-1");
    expect(result).toMatchObject({
      skipped: false,
      participants: 1,
      compactionCount: 1,
      hasCompaction: true
    });
    expect(runtime.relationshipService.applySessionVerdict).toHaveBeenCalledWith(
      "guild-1",
      "user-1",
      "A",
      expect.objectContaining({
        allowStatePromotion: true,
        characteristic: "держит сухую пикировку",
        lastChange: "стал увереннее"
      })
    );
  });
});