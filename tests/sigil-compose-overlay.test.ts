import { describe, expect, it } from "vitest";

import { composeBehaviorPrompt } from "../packages/core/src/persona/compose";
import type { BotIntent, FeatureFlags, MessageEnvelope, PersonaSettings } from "@hori/shared";

const featureFlags: FeatureFlags = {
  webSearch: true,
  autoInterject: false,
  contextActions: true,
  roast: true,
  replyQueueEnabled: true,
  runtimeConfigCacheEnabled: true,
  embeddingCacheEnabled: true,
  messageKindAwareMode: true,
  memoryAlbumEnabled: true,
  interactionRequestsEnabled: true,
  linkUnderstandingEnabled: true,
  naturalMessageSplittingEnabled: true,
  selectiveEngagementEnabled: true,
  selfReflectionLessonsEnabled: true,
  mediaReactionsEnabled: true
};

const guildSettings: PersonaSettings = {
  botName: "Хори",
  preferredLanguage: "ru",
  roughnessLevel: 2,
  sarcasmLevel: 2,
  roastLevel: 2,
  interjectTendency: 1,
  replyLength: "short",
  preferredStyle: "коротко, сухо, по делу",
  forbiddenWords: [],
  forbiddenTopics: []
};

const baseMessage: MessageEnvelope = {
  messageId: "1",
  guildId: "guild",
  channelId: "channel",
  userId: "user",
  username: "tester",
  channelName: "general",
  content: "",
  createdAt: new Date(),
  replyToMessageId: null,
  mentionCount: 0,
  mentionedBot: false,
  mentionsBotByName: false,
  mentionedUserIds: [],
  isModerator: false,
  explicitInvocation: true
};

const chatIntent: BotIntent = "chat";

describe("V7: sigil overlay block disabled in ACTIVE_CORE compose", () => {
  it("does not include SIGIL_OVERLAY when no sigil", () => {
    const out = composeBehaviorPrompt({
      guildSettings,
      featureFlags,
      message: { ...baseMessage, content: "обычный вопрос" },
      intent: chatIntent,
      cleanedContent: "обычный вопрос"
    });
    expect(out.trace.blocksUsed).not.toContain("SIGIL_OVERLAY");
  });

  it("ignores unknown sigils gracefully", () => {
    const out = composeBehaviorPrompt({
      guildSettings,
      featureFlags,
      message: { ...baseMessage, content: "test" },
      intent: chatIntent,
      cleanedContent: "test",
      sigil: "@"
    });
    expect(out.trace.blocksUsed).not.toContain("SIGIL_OVERLAY");
  });

  it("does not inject sigil overlay block even when sigil = '?' (V7 removes overlay; search handled via tool loop)", () => {
    const out = composeBehaviorPrompt({
      guildSettings,
      featureFlags,
      message: { ...baseMessage, content: "что такое квантовая запутанность" },
      intent: chatIntent,
      cleanedContent: "что такое квантовая запутанность",
      sigil: "?"
    });
    expect(out.assembly.sigilOverlayBlock).toBe("");
    expect(out.trace.blocksUsed).not.toContain("SIGIL_OVERLAY");
  });
});

