import { describe, expect, it } from "vitest";

import { ChatOrchestrator } from "../packages/core/src/orchestrators/chat-orchestrator";
import type { MessageEnvelope } from "@hori/shared";

describe("chat prompt cache shape", () => {
  it("uses the stable core prompt as the leading stable system block", () => {
    const orchestrator = new ChatOrchestrator({} as never);
    const prompt = (orchestrator as any).buildStableChatSystemPrompt("  STABLE CORE  ");

    expect(prompt).toBe("STABLE CORE");
    expect(prompt).not.toContain("Turn instruction:");
    expect(prompt).not.toContain("Сейчас идёт лента сообщений из Discord-чата");
  });

  it("returns an empty stable block when the core prompt is blank", () => {
    const orchestrator = new ChatOrchestrator({} as never);
    const prompt = (orchestrator as any).buildStableChatSystemPrompt("   ");

    expect(prompt).toBe("");
  });

  it("keeps session summaries ahead of the last live tail", () => {
    const orchestrator = new ChatOrchestrator({} as never);
    const message = {
      messageId: "current",
      guildId: "g",
      channelId: "c",
      userId: "user",
      username: "user",
      content: "ping",
      createdAt: new Date("2026-05-03T00:00:20.000Z"),
      mentionCount: 1,
      mentionedBot: true,
      mentionsBotByName: true,
      mentionedUserIds: [],
      triggerSource: "mention",
      isModerator: false,
      explicitInvocation: true
    } satisfies MessageEnvelope;

    const contextBundle = {
      recentMessages: [
        {
          id: "session-summary:1",
          author: "Сводка",
          userId: "session-summary",
          isBot: true,
          content: "[Сводка] важное старое",
          createdAt: new Date("2026-05-03T00:00:01.000Z"),
          replyToMessageId: null
        },
        ...Array.from({ length: 10 }, (_, index) => ({
          id: `m${index + 1}`,
          author: index % 2 === 0 ? "user" : "Hori",
          userId: index % 2 === 0 ? "user" : "bot",
          isBot: index % 2 === 1,
          content: `msg-${index + 1}`,
          createdAt: new Date(`2026-05-03T00:00:${String(index + 2).padStart(2, "0")}.000Z`),
          replyToMessageId: null
        }))
      ]
    };

    const turns = (orchestrator as any).buildRecentChatTurns(message, "", contextBundle);

    expect(turns).toHaveLength(9);
    expect(turns[0]).toEqual({ role: "assistant", content: "[Сводка] важное старое" });
    expect(turns.slice(1).map((turn: { content: string }) => turn.content)).toEqual([
      "msg-3",
      "msg-4",
      "msg-5",
      "msg-6",
      "msg-7",
      "msg-8",
      "msg-9",
      "msg-10"
    ]);
  });
});