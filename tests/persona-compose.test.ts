import { describe, expect, it } from "vitest";

import { composeBehaviorPrompt } from "../packages/core/src/persona/compose";
import type { BotIntent, ContextBundleV2, ContextTrace, FeatureFlags, MessageEnvelope, PersonaSettings } from "@hori/shared";

const featureFlags: FeatureFlags = {
  webSearch: true,
  autoInterject: false,
  userProfiles: true,
  contextActions: true,
  roast: true,
  contextV2Enabled: true,
  contextConfidenceEnabled: true,
  topicEngineEnabled: true,
  affinitySignalsEnabled: true,
  moodEngineEnabled: true,
  replyQueueEnabled: true,
  mediaReactionsEnabled: false,
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
  selfReflectionLessonsEnabled: true
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
    expect(result.trace.messageKind).toBe("smalltalk_hangout");
    expect(result.trace.smalltalkContextHook).toBe(false);
    expect(result.trace.stylePreset).toBe("low_pressure_short");
    expect(result.trace.compactness).toBe("short");
    expect(result.trace.contextEnergy).toBe("low");
    expect(result.trace.snarkConfidenceThreshold).toBe(0.68);
    expect(result.trace.mediaReactionEligible).toBe(false);
    expect(result.prompt).not.toContain("[IDEOLOGICAL FLAVOUR BLOCK]");
    expect(result.prompt).not.toContain("[SELF-INITIATED INTERJECTION CONSTRAINTS BLOCK]");
    expect(result.prompt).not.toContain("[STALE TAKE / MEDIA REACTION BLOCK]");
    expect(result.prompt).toContain("[LOW-PRESSURE SMALLTALK BLOCK]");
    expect(result.prompt.length).toBeLessThanOrEqual(8500);
    expect(result.trace.blocksUsed[0]).toBe("STABLE IDENTITY BLOCK");
    expect(result.trace.blocksUsed).toContain("IDENTITY & CORE");
    expect(result.trace.blocksUsed).toContain("REPLY MODE");
    expect(result.trace.blocksUsed).toContain("FEW-SHOT TONE ANCHORS");
    expect(result.trace.replyMode).toBeDefined();
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

  it("keeps plain info questions out of auto-focused mode", () => {
    const result = compose("что такое индекс?");

    expect(result.trace.messageKind).toBe("info_question");
    expect(result.trace.activeMode).toBe("normal");
    expect(result.trace.requestedDepth).toBe("short");
    expect(result.limits.maxChars).toBeLessThanOrEqual(320);
  });

  it("preserves reply continuity instead of escalating short reply questions", () => {
    const result = compose("а почему?", {
      message: {
        triggerSource: "reply"
      }
    });

    expect(result.trace.messageKind).toBe("reply_to_bot");
    expect(result.trace.activeMode).toBe("normal");
    expect(result.limits.maxChars).toBeLessThanOrEqual(220);
  });

  it("adds concrete grounding and constraint continuation for narrowing replies", () => {
    const result = compose("не аниме", {
      message: {
        triggerSource: "reply"
      }
    });

    expect(result.trace.messageKind).toBe("reply_to_bot");
    expect(result.prompt).toContain("[CONCRETE CHAT GROUNDING BLOCK]");
    expect(result.prompt).toContain("Пользователь сейчас сужает или правит прошлый ответ");
    expect(result.limits.maxChars).toBeLessThanOrEqual(190);
  });

  it("routes short corrective meta comments into dedicated meta-feedback path", () => {
    const result = compose("ты девушка вообще-то", {
      message: {
        triggerSource: "reply"
      }
    });

    expect(result.trace.messageKind).toBe("meta_feedback");
    expect(result.trace.activeMode).toBe("dry");
    expect(result.trace.stylePreset).toBe("curt");
    expect(result.prompt).toContain("[META-FEEDBACK BLOCK]");
    expect(result.limits.maxChars).toBeLessThanOrEqual(120);
    expect(result.prompt).toContain("Не говори: 'я не бот'");
  });

  it("keeps botness complaints short and free of self-lore guidance", () => {
    const result = compose("ты как бот разговариваешь", {
      message: {
        triggerSource: "reply"
      }
    });

    expect(result.trace.messageKind).toBe("meta_feedback");
    expect(result.prompt).toContain("исправь конкретный сбой");
    expect(result.prompt).toContain("Не спорь о том, бот ли ты");
    expect(result.prompt).not.toContain("живой серверный персонаж Discord");
    expect(result.limits.maxChars).toBeLessThanOrEqual(120);
  });

  it("adds escalation guidance for provocation without turning it into a lecture", () => {
    const result = compose("заткнись");

    expect(result.trace.messageKind).toBe("provocation");
    expect(result.prompt).toContain("Лестница реакции на грубость");
    expect(result.prompt).toContain("Не обещай тайм-аут");
  });

  it("adds anti-drift anchors for emotional or advice-heavy turns", () => {
    const result = compose("меня игнорят и я не понимаю что ему ответить");

    expect(result.prompt).toContain("Не долбись дальше. Один нормальный пинг и потом отойди.");
    expect(result.prompt).toContain("Одну внятную фразу. Без романа и намеков.");
    expect(result.prompt).toContain("[CONCRETE CHAT GROUNDING BLOCK]");
  });

  it("adds direct-message punctuation guidance when the message is a DM", () => {
    const result = compose("ладно", {
      message: {
        isDirectMessage: true
      }
    });

    expect(result.prompt).toContain("Если это личка, короткие прямые сообщения заканчивай без финальной точки вообще.");
  });

  it("keeps what-is-this-nonsense replies in meta-feedback when aimed at the bot", () => {
    const result = compose("что за бред", {
      message: {
        triggerSource: "reply"
      }
    });

    expect(result.trace.messageKind).toBe("meta_feedback");
    expect(result.trace.compactness).toBe("tiny");
  });

  it("keeps analogy suppression in strict anti-slop output", () => {
    const result = compose("что такое индексы в базе?");

    expect(result.trace.antiSlopProfile).toBe("strict");
    expect(result.prompt).toContain("[ANTI-SLOP BLOCK]");
    expect(result.prompt).toContain("[ANALOGY SUPPRESSION BLOCK]");
    expect(result.prompt).toContain("это как если бы");
    expect(result.prompt).toContain("это похоже на");
    expect(result.prompt).toContain("аналогично тому как");
    expect(result.prompt).toContain("imagine if");
  });

  it("enables ideological flavour only as a topical layer", () => {
    const political = compose("что думаешь про налоги, государство и Израиль?");
    const nonPoliticalOpinion = compose("что думаешь про этот ноут?");
    const casual = compose("как дела?");
    const disabled = compose("что думаешь про коммунизм и Израиль?", {
      featureFlags: { ...featureFlags, ideologicalFlavourEnabled: false }
    });

    expect(political.trace.ideologicalFlavour).toBe("enabled");
    expect(political.prompt).toContain("[IDEOLOGICAL FLAVOUR BLOCK]");
    expect(political.prompt).toContain("anarcho-capitalist");
    expect(political.prompt).toContain("anti-state");
    expect(political.prompt).toContain("серьёзнее, суше и жёстче");
    expect(nonPoliticalOpinion.trace.ideologicalFlavour).toBe("background");
    expect(nonPoliticalOpinion.prompt).not.toContain("[IDEOLOGICAL FLAVOUR BLOCK]");
    expect(nonPoliticalOpinion.prompt).not.toContain("strong pro-Israel bias");
    expect(casual.trace.ideologicalFlavour).toBe("background");
    expect(casual.trace.messageKind).toBe("smalltalk_hangout");
    expect(disabled.trace.ideologicalFlavour).toBe("disabled");
    expect(disabled.prompt).not.toContain("[IDEOLOGICAL FLAVOUR BLOCK]");
  });

  it("detects low-pressure hangout smalltalk without forcing banter", () => {
    const cases = ["привет", "хори привет", "как дела?", "просто поболтать хочу", "пока ничего не делаю"];

    for (const content of cases) {
      const result = compose(content);

      expect(result.trace.messageKind).toBe("smalltalk_hangout");
      expect(result.trace.smalltalkContextHook).toBe(false);
      expect(result.trace.stylePreset).toBe("low_pressure_short");
      expect(result.prompt).toContain("[LOW-PRESSURE SMALLTALK BLOCK]");
      expect(result.prompt).not.toContain("[IDEOLOGICAL FLAVOUR BLOCK]");
      expect(result.prompt).not.toContain("[STALE TAKE / MEDIA REACTION BLOCK]");
      expect(result.prompt).not.toContain("[SELF-INITIATED INTERJECTION CONSTRAINTS BLOCK]");
      expect(result.prompt).not.toContain("controlled bite");
    }
  });

  it("keeps smalltalk kind but marks contextual hook when fresh context exists", () => {
    const context = {
      version: "v2",
      recentMessages: [
        { author: "tester", content: "вечер опять скучно тянется", createdAt: new Date() },
        { author: "friend", content: "да, скучно и тихо сегодня", createdAt: new Date() }
      ],
      summaries: [],
      serverMemories: [{ key: "вечер", value: "В этом канале вечером часто жалуются, что скучно.", type: "pattern" }],
      replyChain: [{ author: "friend", content: "ты опять пишешь что скучно", createdAt: new Date() }],
      topicWindow: [],
      entities: [{ type: "concept", surface: "вечер", score: 0.92 }],
      entityMemories: [{ key: "вечер", value: "обычно тянет на спокойный бытовой чат", type: "note", score: 0.81 }],
      activeTopic: {
        topicId: "topic-1",
        title: "Скучный вечер",
        summaryShort: "Все жалуются, что вечер пустой и вялый.",
        summaryFacts: ["В канале тихо", "Никто ничего не делает"],
        lastUpdatedAt: new Date(),
        confidence: 0.84
      },
      relationship: null,
      userProfile: null
    } satisfies ContextBundleV2;

    const contextTrace = {
      version: "v2",
      activeTopicId: "topic-1",
      replyChainCount: 1,
      entityTriggers: ["вечер"],
      sections: ["reply_chain", "active_topic", "entity_memory", "server_memory"]
    } satisfies ContextTrace;

    const result = compose("скучно", {
      relationship: {
        toneBias: "familiar",
        roastLevel: 2,
        praiseBias: 1,
        interruptPriority: 0,
        doNotMock: false,
        doNotInitiate: false,
        protectedTopics: []
      },
      context,
      contextTrace,
      message: {
        triggerSource: "reply"
      }
    });

    expect(result.trace.messageKind).toBe("smalltalk_hangout");
    expect(result.trace.smalltalkContextHook).toBe(true);
    expect(result.prompt).toContain("[LOW-PRESSURE SMALLTALK BLOCK]");
    expect(result.prompt).toContain("можно оставить больше привычной теплоты или колкости");
  });

  it("does not misclassify utility, opinion, search or provocation as hangout smalltalk", () => {
    expect(compose("объясни pgvector").trace.messageKind).toBe("request_for_explanation");
    expect(compose("что думаешь про налоги").trace.messageKind).toBe("opinion_question");
    expect(compose("найди X", { intent: "search" }).trace.messageKind).toBe("command_like_request");
    expect(compose("заткнись ботяра").trace.messageKind).toBe("provocation");
  });

  it("preserves real provocation instead of collapsing it into meta-feedback", () => {
    const result = compose("заткнись ботяра");

    expect(result.trace.messageKind).toBe("provocation");
    expect(result.trace.activeMode).toBe("irritated");
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
    expect(result.trace.contextEnergy).toBe("low");
    expect(result.trace.snarkConfidenceThreshold).toBe(0.86);
    expect(result.limits.maxSentences).toBe(1);
    expect(result.limits.maxParagraphs).toBe(1);
    expect(result.limits.maxChars).toBeLessThanOrEqual(180);
    expect(result.prompt).toContain("[SELF-INITIATED INTERJECTION CONSTRAINTS BLOCK]");
  });

  it("keeps depth earned and marks stale/gotcha context separately", () => {
    const simple = compose("что такое индекс?");
    const deep = compose("объясни подробно что такое индекс и как его выбирать");
    const staleOpinion = compose("государство же нужно, кто дороги построит?");
    const repeated = compose("государство же нужно, кто дороги построит?", {
      context: {
        recentMessages: [
          { author: "u1", content: "государство же нужно, кто дороги построит?", createdAt: new Date() },
          { author: "u2", content: "государство же нужно, кто дороги построит?", createdAt: new Date() }
        ],
        summaries: [],
        serverMemories: []
      }
    });

    expect(simple.trace.requestedDepth).toBe("short");
    expect(simple.trace.activeMode).toBe("normal");
    expect(deep.trace.requestedDepth).toBe("long");
    expect(staleOpinion.trace.messageKind).toBe("info_question");
    expect(staleOpinion.trace.activeMode).toBe("dry");
    expect(staleOpinion.trace.stylePreset).toBe("dismissive_short");
    expect(staleOpinion.limits.maxChars).toBeLessThanOrEqual(200);
    expect(staleOpinion.trace.staleTakeDetected).toBe(true);
    expect(repeated.trace.messageKind).toBe("repeated_question");
    expect(repeated.trace.stylePreset).toBe("dismissive_short");
    expect(repeated.trace.staleTakeDetected).toBe(true);
    expect(repeated.trace.mediaReactionEligible).toBe(true);
    expect(repeated.prompt).toContain("[STALE TAKE / MEDIA REACTION BLOCK]");
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
