import { describe, expect, it } from "vitest";

import { ChatOrchestrator } from "../packages/core/src/orchestrators/chat-orchestrator";
import type { ComposeBehaviorPromptOutput } from "../packages/core/src/persona/types";
import type { MessageEnvelope } from "@hori/shared";

function makeBehavior(overrides: Partial<ComposeBehaviorPromptOutput> = {}): ComposeBehaviorPromptOutput {
  return {
    prompt: "legacy prompt body",
    staticPrefix: "STATIC PREFIX",
    trace: {
      personaName: "Хори",
      activeMode: "normal",
      channelKind: "general",
      messageKind: "casual_address",
      smalltalkContextHook: false,
      replyMode: "dry",
      stylePreset: "neutral_short",
      requestedDepth: "short",
      compactness: "short",
      antiSlopProfile: "standard",
      ideologicalFlavour: "disabled",
      analogyBan: false,
      slangProfile: "off",
      contextEnergy: "medium",
      isSelfInitiated: false,
      snarkConfidenceThreshold: 0,
      activeTopicId: null,
      replyChainCount: 0,
      entityTriggers: [],
      contextVersion: "v2",
      staleTakeDetected: false,
      mediaReactionEligible: false,
      maxChars: 700,
      maxSentences: 6,
      maxParagraphs: 2,
      bulletListAllowed: false,
      followUpAllowed: false,
      blocksUsed: ["v7_active_core"],
      promptShape: "v5_chat",
      relationshipState: "base"
    },
    limits: {
      maxSentences: 6,
      maxParagraphs: 2,
      maxChars: 700,
      maxTokens: 220,
      compactness: "normal",
      bulletListAllowed: false,
      explanationDensity: 0.35,
      followUpAllowed: false
    },
    assembly: {
      commonCore: "COMMON CORE",
      sigilOverlayBlock: "",
      relationshipState: "base"
    },
    ...overrides
  };
}

describe("chat prompt cache shape", () => {
  it("uses staticPrefix as the leading stable system block", () => {
    const orchestrator = new ChatOrchestrator({} as never);
    const behavior = makeBehavior();

    const prompt = (orchestrator as any).buildStableChatSystemPrompt(behavior, "RESTORED");

    expect(prompt.startsWith("STATIC PREFIX")).toBe(true);
    expect(prompt).not.toContain("COMMON CORE");
    expect(prompt).toContain("RESTORED");
    expect(prompt).not.toContain("Turn instruction:");
    expect(prompt).not.toContain("Сейчас идёт лента сообщений из Discord-чата");
  });

  it("falls back to commonCore when staticPrefix is blank", () => {
    const orchestrator = new ChatOrchestrator({} as never);
    const behavior = makeBehavior({ staticPrefix: "   " });

    const prompt = (orchestrator as any).buildStableChatSystemPrompt(behavior, null);

    expect(prompt).toBe("COMMON CORE");
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

    const turns = (orchestrator as any).buildRecentChatTurns(message, contextBundle);

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