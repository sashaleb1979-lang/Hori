import { describe, expect, it } from "vitest";

import { ChatOrchestrator } from "../packages/core/src/orchestrators/chat-orchestrator";
import type { ComposeBehaviorPromptOutput } from "../packages/core/src/persona/types";

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
});