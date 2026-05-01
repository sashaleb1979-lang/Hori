import { describe, expect, it } from "vitest";

import { composeBehaviorPrompt } from "../packages/core/src/persona/compose";
import type { BotIntent, FeatureFlags, MessageEnvelope, PersonaSettings } from "@hori/shared";

const featureFlags: FeatureFlags = {
  webSearch: true,
  autoInterject: false,
  userProfiles: true,
  contextActions: true,
  roast: true,
  replyQueueEnabled: true,
  runtimeConfigCacheEnabled: true,
  embeddingCacheEnabled: true,
  channelAwareMode: true,
  messageKindAwareMode: true,
  antiSlopStrictMode: true,
  playfulModeEnabled: true,
  irritatedModeEnabled: true,
  ideologicalFlavourEnabled: true,
  analogyBanEnabled: true,
  slangLayerEnabled: true,
  selfInterjectionConstraintsEnabled: true,
  memoryAlbumEnabled: true,
  interactionRequestsEnabled: true,
  linkUnderstandingEnabled: true,
  naturalMessageSplittingEnabled: true,
  selectiveEngagementEnabled: true,
  selfReflectionLessonsEnabled: true,
  emotionalAdviceAnchorsEnabled: true
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

describe("V6 Item 12: sigil overlay block in chat system prompt", () => {
  it("inserts sigil_question default block when sigil = '?'", () => {
    const out = composeBehaviorPrompt({
      guildSettings,
      featureFlags,
      message: { ...baseMessage, content: "что такое квантовая запутанность" },
      intent: chatIntent,
      cleanedContent: "что такое квантовая запутанность",
      sigil: "?"
    });
    expect(out.prompt).toContain("web-search");
    expect(out.trace.blocksUsed).toContain("SIGIL_OVERLAY");
  });

  it("inserts sigil_force_rewrite block when sigil = '!'", () => {
    const out = composeBehaviorPrompt({
      guildSettings,
      featureFlags,
      message: { ...baseMessage, content: "перепиши" },
      intent: chatIntent,
      cleanedContent: "перепиши",
      sigil: "!"
    });
    expect(out.prompt).toContain("форс-перезапрос");
    expect(out.trace.blocksUsed).toContain("SIGIL_OVERLAY");
  });

  it("uses panel override when provided instead of default", () => {
    const out = composeBehaviorPrompt({
      guildSettings,
      featureFlags,
      message: { ...baseMessage, content: "test" },
      intent: chatIntent,
      cleanedContent: "test",
      sigil: "?",
      sigilPromptOverrides: { sigil_question: "ПАНЕЛЬНЫЙ-ОВЕРРАЙД" }
    });
    expect(out.prompt).toContain("ПАНЕЛЬНЫЙ-ОВЕРРАЙД");
    expect(out.prompt).not.toContain("web-search");
  });

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
});
