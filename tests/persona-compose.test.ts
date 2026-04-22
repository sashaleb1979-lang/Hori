import { describe, expect, it } from "vitest";

import { composeBehaviorPrompt } from "../packages/core/src/persona/compose";
import type { BotIntent, ContextBundleV2, ContextTrace, FeatureFlags, MessageEnvelope, PersonaSettings } from "@hori/shared";

const featureFlags: FeatureFlags = {
  webSearch: true,
  autoInterject: false,
  emotionalAdviceAnchorsEnabled: true,
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

function mergedPrompt(result: ReturnType<typeof compose>) {
  return [result.staticPrefix, result.prompt].filter(Boolean).join("\n\n");
}

describe("composeBehaviorPrompt", () => {
  it("builds deterministic blocks and trace defaults", () => {
    const result = compose("привет");
    const prompt = mergedPrompt(result);
    const uniqueBlocks = new Set(result.trace.blocksUsed);

    expect(result.trace.personaName).toBe("hori-default");
    expect(result.trace.channelKind).toBe("general");
    expect(result.trace.messageKind).toBe("smalltalk_hangout");
    expect(result.trace.smalltalkContextHook).toBe(false);
    expect(result.trace.stylePreset).toBe("low_pressure_short");
    expect(result.trace.compactness).toBe("tiny");
    expect(result.trace.contextEnergy).toBe("low");
    expect(result.trace.snarkConfidenceThreshold).toBe(0.68);
    expect(result.trace.mediaReactionEligible).toBe(false);
    expect(prompt).not.toContain("[IDEOLOGICAL FLAVOUR BLOCK]");
    expect(prompt).not.toContain("[SELF-INITIATED INTERJECTION CONSTRAINTS BLOCK]");
    expect(prompt).not.toContain("[STALE TAKE / MEDIA REACTION BLOCK]");
    expect(prompt).not.toContain("[TONE BLOCK]");
    expect(prompt).not.toContain("[REPLY MODE]");
    expect(prompt).toContain("[LOW-PRESSURE SMALLTALK BLOCK]");
    expect(prompt.length).toBeLessThanOrEqual(8500);
    expect(result.trace.blocksUsed[0]).toBe("STABLE IDENTITY BLOCK");
    expect(result.trace.blocksUsed).toContain("IDENTITY & CORE");
    expect(result.trace.blocksUsed).not.toContain("REPLY MODE");
    expect(result.trace.blocksUsed).not.toContain("FEW-SHOT TONE ANCHORS");
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
    expect(result.limits.maxChars).toBeGreaterThan(450);
    expect(result.trace.analogyBan).toBe(true);
    expect(result.trace.blocksUsed).toContain("FEW-SHOT TONE ANCHORS");
    expect(memeChannelResult.trace.channelKind).toBe("memes");
    expect(memeChannelResult.trace.activeMode).toBe("focused");
    expect(memeChannelResult.trace.stylePreset).toBe("focused_compact");
  });

  it("keeps plain info questions out of auto-focused mode", () => {
    const result = compose("что такое индекс?");
    const prompt = mergedPrompt(result);

    expect(result.trace.messageKind).toBe("info_question");
    expect(result.trace.activeMode).toBe("normal");
    expect(result.trace.requestedDepth).toBe("short");
    expect(result.limits.maxChars).toBeLessThanOrEqual(220);
    expect(result.trace.blocksUsed).not.toContain("FEW-SHOT TONE ANCHORS");
    expect(prompt).not.toContain("[CONTEXT USAGE BLOCK]");
    expect(prompt).not.toContain("[REPLY MODE]");
  });

  it("preserves reply continuity instead of escalating short reply questions", () => {
    const result = compose("а почему?", {
      message: {
        triggerSource: "reply"
      }
    });
    const prompt = mergedPrompt(result);

    expect(result.trace.messageKind).toBe("reply_to_bot");
    expect(result.trace.activeMode).toBe("normal");
    expect(result.limits.maxChars).toBeLessThanOrEqual(160);
    expect(prompt).toContain("[CONTEXT USAGE BLOCK]");
    expect(prompt).not.toContain("[REPLY MODE]");
  });

  it("keeps bare direct mentions compact", () => {
    const result = compose("хори", {
      message: {
        triggerSource: "mention",
        mentionedBot: true,
        explicitInvocation: false
      }
    });
    const prompt = mergedPrompt(result);

    expect(result.trace.messageKind).toBe("direct_mention");
    expect(result.limits.maxChars).toBeLessThanOrEqual(120);
    expect(result.limits.maxSentences).toBeLessThanOrEqual(2);
    expect(result.limits.bulletListAllowed).toBe(false);
    expect(prompt).not.toContain("[CONTEXT USAGE BLOCK]");
    expect(prompt).not.toContain("[REPLY MODE]");
  });

  it("adds concrete grounding and constraint continuation for narrowing replies", () => {
    const result = compose("не аниме", {
      message: {
        triggerSource: "reply"
      }
    });
    const prompt = mergedPrompt(result);

    expect(result.trace.messageKind).toBe("reply_to_bot");
    expect(prompt).toContain("[CONCRETE CHAT GROUNDING BLOCK]");
    expect(prompt).toContain("Пользователь сейчас сужает или правит прошлый ответ");
    expect(result.limits.maxChars).toBeLessThanOrEqual(150);
  });

  it("routes short corrective meta comments into dedicated meta-feedback path", () => {
    const result = compose("ты девушка вообще-то", {
      message: {
        triggerSource: "reply"
      }
    });
    const prompt = mergedPrompt(result);

    expect(result.trace.messageKind).toBe("meta_feedback");
    expect(result.trace.activeMode).toBe("dry");
    expect(result.trace.stylePreset).toBe("curt");
    expect(prompt).toContain("[META-FEEDBACK BLOCK]");
    expect(result.limits.maxChars).toBeLessThanOrEqual(90);
    expect(prompt).toContain("Не говори: 'я не бот'");
    expect(prompt).not.toContain("[REPLY MODE]");
  });

  it("keeps botness complaints short and free of self-lore guidance", () => {
    const result = compose("ты как бот разговариваешь", {
      message: {
        triggerSource: "reply"
      }
    });
    const prompt = mergedPrompt(result);

    expect(result.trace.messageKind).toBe("meta_feedback");
    expect(prompt).toContain("Исправь конкретный сбой");
    expect(prompt).toContain("Не оправдывайся, не спорь, не объясняй процесс");
    expect(prompt).not.toContain("живой серверный персонаж Discord");
    expect(result.limits.maxChars).toBeLessThanOrEqual(90);
  });

  it("keeps longer corrective meta complaints on the same dry meta-feedback path", () => {
    const result = compose("ты опять отвечаешь вообще не по теме и просто льешь воду вместо конкретного ответа, я спросил совсем другое", {
      message: {
        triggerSource: "reply"
      }
    });
    const prompt = mergedPrompt(result);

    expect(result.trace.messageKind).toBe("meta_feedback");
    expect(prompt).toContain("Если претензия расплывчатая");
    expect(prompt).toContain("[META-FEEDBACK ANCHORS]");
    expect(result.limits.maxChars).toBeLessThanOrEqual(90);
  });

  it("adds escalation guidance for provocation without turning it into a lecture", () => {
    const result = compose("заткнись");
    const prompt = mergedPrompt(result);

    expect(result.trace.messageKind).toBe("provocation");
    expect(prompt).toContain("[PROVOCATION ANCHORS]");
    expect(prompt).toContain("Обычно хватает одной короткой сухой фразы");
    expect(prompt).toContain("Не спорь по кругу, не морализируй");
    expect(prompt).not.toContain("[CONTEXT USAGE BLOCK]");
    expect(prompt).not.toContain("[REPLY MODE]");
    expect(result.limits.maxChars).toBeLessThanOrEqual(110);
  });

  it("ignores relationship overlays entirely while the hard disable is active", () => {
    const result = compose("привет", {
      relationship: {
        toneBias: "friendly",
        roastLevel: 2,
        praiseBias: 2,
        interruptPriority: 0,
        doNotMock: false,
        doNotInitiate: false,
        protectedTopics: []
      }
    });

    expect(result.prompt).not.toContain("[RELATIONSHIP OVERLAY]");
    expect(result.prompt).not.toContain("tone_bias=");
    expect(result.trace.blocksUsed).not.toContain("RELATIONSHIP OVERLAY");
  });

  it("adds anti-drift anchors for emotional or advice-heavy turns", () => {
    const result = compose("меня игнорят и я не понимаю что ему ответить");
    const prompt = mergedPrompt(result);

    expect(prompt).toContain("[EMOTIONAL ADVICE ANCHORS]");
    expect(prompt).toContain("один пинг и потом отойди");
    expect(prompt).toContain("одну внятную фразу");
    expect(prompt).toContain("[CONCRETE CHAT GROUNDING BLOCK]");
    expect(result.trace.blocksUsed).toContain("EMOTIONAL ADVICE ANCHORS");
  });

  it("skips emotional advice anchors for technical advice questions", () => {
    const result = compose("как лучше настроить индекс в postgres");
    const prompt = mergedPrompt(result);

    expect(prompt).not.toContain("[EMOTIONAL ADVICE ANCHORS]");
    expect(prompt).not.toContain("один пинг и потом отойди");
  });

  it("can disable emotional advice anchors via dedicated feature flag", () => {
    const result = compose("меня игнорят и я не понимаю что ему ответить", {
      featureFlags: { ...featureFlags, emotionalAdviceAnchorsEnabled: false }
    });
    const prompt = mergedPrompt(result);

    expect(prompt).not.toContain("[EMOTIONAL ADVICE ANCHORS]");
    expect(prompt).not.toContain("один пинг и потом отойди");
  });

  it("adds direct-message punctuation guidance when the message is a DM", () => {
    const result = compose("ладно", {
      message: {
        isDirectMessage: true
      }
    });
    const prompt = mergedPrompt(result);

    expect(prompt).toContain("Если это личка, короткие прямые сообщения заканчивай без финальной точки вообще.");
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
    const prompt = mergedPrompt(result);

    expect(result.trace.antiSlopProfile).toBe("strict");
    expect(prompt).toContain("[ANTI-SLOP BLOCK]");
    expect(prompt).toContain("[ANALOGY SUPPRESSION BLOCK]");
    expect(prompt).toContain("это как если бы");
    expect(prompt).toContain("это похоже на");
    expect(prompt).toContain("аналогично тому как");
    expect(prompt).toContain("imagine if");
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
      const prompt = mergedPrompt(result);

      expect(result.trace.messageKind).toBe("smalltalk_hangout");
      expect(result.trace.smalltalkContextHook).toBe(false);
      expect(result.trace.stylePreset).toBe("low_pressure_short");
      expect(prompt).toContain("[LOW-PRESSURE SMALLTALK BLOCK]");
      expect(prompt).toContain("На приветствие отвечай приветствием");
      expect(prompt).toContain("Без встречного вопроса по умолчанию");
      expect(prompt).not.toContain("[IDEOLOGICAL FLAVOUR BLOCK]");
      expect(prompt).not.toContain("[STALE TAKE / MEDIA REACTION BLOCK]");
      expect(prompt).not.toContain("[SELF-INITIATED INTERJECTION CONSTRAINTS BLOCK]");
      expect(prompt).not.toContain("[REPLY MODE]");
      expect(prompt).not.toContain("[TONE BLOCK]");
      expect(result.limits.maxChars).toBeLessThanOrEqual(120);
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
    const prompt = mergedPrompt(result);

    expect(result.trace.messageKind).toBe("smalltalk_hangout");
    expect(result.trace.smalltalkContextHook).toBe(true);
    expect(prompt).toContain("[LOW-PRESSURE SMALLTALK BLOCK]");
    expect(prompt).toContain("можно быть чуть живее, но не длиннее");
    expect(prompt).not.toContain("[RELATIONSHIP OVERLAY]");
    expect(prompt).not.toContain("[REPLY MODE]");
    expect(result.limits.maxChars).toBeLessThanOrEqual(160);
  });

  it("ignores relationship rapport on reply continuations while hard disable is active", () => {
    const result = compose("ну и что", {
      relationship: {
        toneBias: "sharp",
        roastLevel: 2,
        praiseBias: 0,
        interruptPriority: 0,
        doNotMock: false,
        doNotInitiate: false,
        protectedTopics: []
      },
      message: {
        triggerSource: "reply"
      }
    });
    const prompt = mergedPrompt(result);

    expect(result.trace.messageKind).toBe("reply_to_bot");
    expect(result.limits.maxChars).toBeLessThanOrEqual(160);
    expect(prompt).not.toContain("[RELATIONSHIP OVERLAY]");
    expect(prompt).not.toContain("Можно быть холоднее и суше обычного");
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
    expect(mergedPrompt(repeated)).toContain("[STALE TAKE / MEDIA REACTION BLOCK]");
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
