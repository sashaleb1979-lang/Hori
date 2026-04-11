import { describe, expect, it } from "vitest";

import { composeBehaviorPrompt } from "../packages/core/src/persona/compose";
import type { BotIntent, FeatureFlags, MessageEnvelope, PersonaSettings } from "@hori/shared";

const featureFlags: FeatureFlags = {
  webSearch: true,
  autoInterject: false,
  userProfiles: true,
  contextActions: true,
  roast: true,
  channelAwareMode: true,
  messageKindAwareMode: true,
  antiSlopStrictMode: true,
  playfulModeEnabled: true,
  irritatedModeEnabled: true,
  ideologicalFlavourEnabled: true,
  analogyBanEnabled: true,
  slangLayerEnabled: true,
  selfInterjectionConstraintsEnabled: true
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

type ComposeOverrides = Omit<Partial<Parameters<typeof composeBehaviorPrompt>[0]>, "message"> & {
  message?: Partial<MessageEnvelope>;
};

function compose(content: string, overrides: ComposeOverrides = {}) {
  const { message: messageOverride, ...rest } = overrides;
  const intent = overrides.intent ?? ("chat" as BotIntent);

  return composeBehaviorPrompt({
    guildSettings,
    featureFlags,
    message: {
      ...baseMessage,
      content,
      ...(messageOverride ?? {})
    },
    intent,
    cleanedContent: content,
    ...rest
  });
}

describe("composeBehaviorPrompt", () => {
  it("builds deterministic blocks and trace defaults", () => {
    const result = compose("привет");
    const uniqueBlocks = new Set(result.trace.blocksUsed);

    expect(result.trace.personaName).toBe("hori-default");
    expect(result.trace.channelKind).toBe("general");
    expect(result.trace.messageKind).toBe("casual_address");
    expect(result.trace.compactness).toBe("short");
    expect(result.trace.blocksUsed[0]).toBe("STABLE IDENTITY BLOCK");
    expect(uniqueBlocks.size).toBe(result.trace.blocksUsed.length);
  });

  it("uses channel overrides from topic tags and channel names", () => {
    const tagged = compose("лол ну это база", {
      channelPolicy: { topicInterestTags: ["kind:memes"], responseLengthOverride: null }
    });
    const named = compose("кратко проверь команду", {
      message: { channelName: "bot-debug" }
    });

    expect(tagged.trace.channelKind).toBe("memes");
    expect(tagged.trace.activeMode).toBe("playful");
    expect(tagged.trace.stylePreset).toBe("playful_short");
    expect(named.trace.channelKind).toBe("bot");
    expect(named.trace.activeMode).toBe("dry");
  });

  it("detects explanation requests and gives focused compact behavior", () => {
    const result = compose("объясни подробно как работает pgvector");
    const memeChannelResult = compose("объясни подробно как работает pgvector", {
      channelPolicy: { topicInterestTags: ["kind:memes"], responseLengthOverride: null }
    });

    expect(result.trace.messageKind).toBe("request_for_explanation");
    expect(result.trace.activeMode).toBe("focused");
    expect(result.trace.stylePreset).toBe("focused_compact");
    expect(result.limits.maxChars).toBeGreaterThan(550);
    expect(result.trace.analogyBan).toBe(true);
    expect(memeChannelResult.trace.channelKind).toBe("memes");
    expect(memeChannelResult.trace.activeMode).toBe("focused");
    expect(memeChannelResult.trace.stylePreset).toBe("focused_compact");
  });

  it("keeps analogy suppression in strict anti-slop output", () => {
    const result = compose("что такое индексы в базе?");

    expect(result.trace.antiSlopProfile).toBe("strict");
    expect(result.prompt).toContain("[ANTI-SLOP BLOCK]");
    expect(result.prompt).toContain("[ANALOGY SUPPRESSION BLOCK]");
    expect(result.prompt).toContain("это как если бы");
    expect(result.prompt).toContain("imagine if");
  });

  it("enables ideological flavour only as a topical layer", () => {
    const political = compose("что думаешь про коммунизм и Израиль?");
    const nonPoliticalOpinion = compose("что думаешь про этот ноут?");
    const casual = compose("как дела?");
    const disabled = compose("что думаешь про коммунизм и Израиль?", {
      featureFlags: { ...featureFlags, ideologicalFlavourEnabled: false }
    });

    expect(political.trace.ideologicalFlavour).toBe("enabled");
    expect(political.prompt).toContain("[IDEOLOGICAL FLAVOUR BLOCK]");
    expect(nonPoliticalOpinion.trace.ideologicalFlavour).toBe("background");
    expect(nonPoliticalOpinion.prompt).not.toContain("[IDEOLOGICAL FLAVOUR BLOCK]");
    expect(nonPoliticalOpinion.prompt).not.toContain("strong pro-Israel bias");
    expect(casual.trace.ideologicalFlavour).toBe("background");
    expect(disabled.trace.ideologicalFlavour).toBe("disabled");
    expect(disabled.prompt).not.toContain("[IDEOLOGICAL FLAVOUR BLOCK]");
  });

  it("applies self-initiated brevity and unsolicited presets", () => {
    const result = compose("что думаете по этому спору", {
      message: {
        explicitInvocation: false,
        triggerSource: "auto_interject"
      }
    });

    expect(result.trace.isSelfInitiated).toBe(true);
    expect(result.trace.requestedDepth).toBe("tiny");
    expect(result.trace.compactness).toBe("tiny");
    expect(result.trace.stylePreset).toBe("unsolicited_poke");
    expect(result.limits.maxSentences).toBe(1);
    expect(result.limits.maxParagraphs).toBe(1);
    expect(result.limits.maxChars).toBeLessThanOrEqual(180);
    expect(result.prompt).toContain("[SELF-INITIATED INTERJECTION CONSTRAINTS BLOCK]");
  });

  it("falls back when playful mode is disabled", () => {
    const result = compose("зацени мем лол", {
      channelPolicy: { topicInterestTags: ["kind:memes"], responseLengthOverride: null },
      featureFlags: { ...featureFlags, playfulModeEnabled: false }
    });

    expect(result.trace.channelKind).toBe("memes");
    expect(result.trace.activeMode).toBe("normal");
    expect(result.trace.stylePreset).toBe("neutral_short");
  });
});
