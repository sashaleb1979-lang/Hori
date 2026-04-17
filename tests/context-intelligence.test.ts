import { describe, expect, it, vi } from "vitest";

import { defaultRuntimeTuning } from "@hori/config";
import { ContextBuilderService } from "../packages/core/src/services/context-builder";
import { ContextScoringService } from "../packages/core/src/services/context-scoring-service";
import { MediaReactionService } from "../packages/core/src/services/media-reaction-service";
import { ReplyQueueService } from "../packages/core/src/services/reply-queue-service";
import { composeBehaviorPrompt } from "../packages/core/src/persona/compose";
import { TopicService } from "../packages/memory/src/topics/topic-service";
import type { ContextBundleV2, FeatureFlags, MessageEnvelope, PersonaSettings } from "@hori/shared";

const message: MessageEnvelope = {
  messageId: "m3",
  guildId: "guild",
  channelId: "channel",
  userId: "user",
  username: "tester",
  displayName: "Tester",
  channelName: "general",
  content: "Хори, ответь по теме",
  createdAt: new Date("2026-04-12T10:00:00Z"),
  replyToMessageId: "m2",
  mentionCount: 0,
  mentionedBot: false,
  mentionsBotByName: true,
  mentionedUserIds: [],
  triggerSource: "reply",
  isModerator: false,
  explicitInvocation: true
};

const bundle: ContextBundleV2 = {
  version: "v2",
  recentMessages: [
    { id: "m1", author: "a", userId: "a", content: "старый шум", createdAt: new Date("2026-04-12T09:59:00Z") },
    { id: "m2", author: "b", userId: "b", content: "ключевая реплика", createdAt: new Date("2026-04-12T09:59:30Z") }
  ],
  summaries: [],
  serverMemories: [],
  userProfile: null,
  relationship: null,
  replyChain: [{ id: "m2", author: "b", userId: "b", content: "ключевая реплика", createdAt: new Date("2026-04-12T09:59:30Z") }],
  repliedMessageId: "m2",
  activeTopic: {
    topicId: "topic-1",
    title: "анкап и налоги",
    summaryShort: "Спорят про налоги и государство",
    summaryFacts: ["налоги обсуждаются как политический тезис"],
    lastUpdatedAt: new Date("2026-04-12T09:59:30Z"),
    confidence: 0.8
  },
  topicWindow: [{ id: "m2", author: "b", userId: "b", content: "ключевая реплика", createdAt: new Date("2026-04-12T09:59:30Z") }],
  entities: [{ type: "concept", surface: "налоги", canonical: "taxes", score: 0.9 }],
  entityMemories: [{ key: "taxes", value: "На сервере часто спорят про налоги.", type: "note", score: 0.8 }]
};

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

describe("context intelligence", () => {
  it("builds context v2 as anchors, recent context and question anchor", () => {
    const service = new ContextBuilderService();
    const result = service.buildPromptContext(bundle, {
      message,
      intent: "chat",
      contextV2Enabled: true,
      maxChars: 900
    });

    expect(result.contextText.indexOf("[CONTEXT ANCHORS]")).toBeLessThan(result.contextText.indexOf("[QUESTION ANCHOR]"));
    expect(result.contextText).toContain("[REPLY CHAIN]");
    expect(result.contextText).toContain("[ACTIVE TOPIC]");
    expect(result.contextText).toContain("[ENTITY MEMORY]");
    expect(result.trace.version).toBe("v2");
    expect(result.trace.replyChainCount).toBe(1);
    expect(result.memoryLayers).toContain("reply_chain");
    expect(result.memoryLayers).toContain("active_topic");
  });

  it("uses the runtime default context budget when maxChars is omitted", () => {
    const service = new ContextBuilderService();
    const result = service.buildPromptContext(bundle, {
      message,
      intent: "chat",
      contextV2Enabled: true
    });

    expect(result.trace.version).toBe("v2");
    expect(result.trace.truncation?.maxChars).toBe(defaultRuntimeTuning.CONTEXT_V2_MAX_CHARS);
  });

  it("scores context and mockery confidence from reply-chain and low-signal penalties", () => {
    const scorer = new ContextScoringService();
    const strong = scorer.score({ bundle, message, messageKind: "reply_to_bot" });
    const weak = scorer.score({
      bundle: { ...bundle, replyChain: [], activeTopic: null, entities: [], recentMessages: [] } as ContextBundleV2,
      message: { ...message, triggerSource: "auto_interject", explicitInvocation: false, content: "👍" },
      messageKind: "low_signal_noise"
    });

    expect(strong.contextConfidence).toBeGreaterThan(0.7);
    expect(strong.mockeryConfidence).toBeGreaterThan(0.6);
    expect(weak.contextConfidence).toBeLessThan(0.4);
    expect(weak.mockeryConfidence).toBeLessThan(0.5);
  });

  it("adds context usage block and scores to persona trace", () => {
    const contextBuilder = new ContextBuilderService();
    const context = contextBuilder.buildPromptContext(bundle, { message, intent: "chat", contextV2Enabled: true });
    const scores = new ContextScoringService().score({ bundle, message, messageKind: "reply_to_bot" });
    const result = composeBehaviorPrompt({
      guildSettings,
      featureFlags,
      message,
      intent: "chat",
      cleanedContent: message.content,
      context: bundle,
      messageKind: "reply_to_bot",
      contextTrace: context.trace,
      contextScores: scores
    });

    expect(result.prompt).toContain("[CONTEXT USAGE BLOCK]");
    expect(result.trace.contextVersion).toBe("v2");
    expect(result.trace.contextConfidence).toBe(scores.contextConfidence);
    expect(result.trace.activeTopicId).toBe("topic-1");
    expect(result.trace.entityTriggers).toContain("налоги");
  });

  it("falls back to text when registered media file is missing", async () => {
    const service = new MediaReactionService({
      mediaMetadata: {
        findMany: vi.fn().mockResolvedValue([{
          id: "row-1",
          mediaId: "meme-1",
          type: "image",
          filePath: "C:\\definitely-missing\\meme.png",
          cooldownSec: 600,
          lastUsedAt: null,
          triggerTags: ["meme_bait"],
          toneTags: [],
          allowedChannels: ["memes"],
          allowedMoods: [],
          weight: 1
        }]),
        update: vi.fn()
      }
    } as never);

    const result = await service.maybeAttachMedia({
      enabled: true,
      replyText: "мимо",
      channelKind: "memes",
      mode: "playful",
      stylePreset: "playful_short",
      triggerTags: ["meme_bait"]
    });

    expect(result.payload).toEqual({ text: "мимо" });
    expect(result.trace).toMatchObject({ enabled: true, selected: false, reason: "file_missing" });
  });

  it("does not attach media from a different allowed channel even when tags match", async () => {
    const service = new MediaReactionService({
      mediaMetadata: {
        findMany: vi.fn().mockResolvedValue([{
          id: "row-1",
          mediaId: "serious-only",
          type: "image",
          filePath: "C:\\definitely-missing\\serious.png",
          cooldownSec: 600,
          lastUsedAt: null,
          triggerTags: ["meme_bait"],
          toneTags: [],
          allowedChannels: ["serious"],
          allowedMoods: [],
          weight: 10
        }]),
        update: vi.fn()
      }
    } as never);

    const result = await service.maybeAttachMedia({
      enabled: true,
      replyText: "мимо",
      channelKind: "memes",
      mode: "playful",
      stylePreset: "playful_short",
      triggerTags: ["meme_bait"]
    });

    expect(result.payload).toEqual({ text: "мимо" });
    expect(result.trace).toMatchObject({ enabled: true, selected: false, mediaId: "serious-only", reason: "channel_not_allowed" });
  });

  it("drops duplicate queue work after source message is already done", async () => {
    const prisma = {
      replyQueueItem: {
        findFirst: vi.fn().mockResolvedValue({ id: "queue-1", status: "done" }),
        create: vi.fn()
      }
    };
    const service = new ReplyQueueService(prisma as never);

    const result = await service.claimOrQueue({
      guildId: "guild",
      channelId: "channel",
      sourceMsgId: "m1",
      targetUserId: "user",
      messageKind: "direct_mention",
      mentionCount: 1,
      createdAt: new Date("2026-04-12T10:00:00Z"),
      explicitInvocation: true
    });

    expect(result).toMatchObject({ action: "dropped", itemId: "queue-1", reason: "already_done" });
    expect(prisma.replyQueueItem.create).not.toHaveBeenCalled();
  });

  it("keeps active topic on short weak chat signals", async () => {
    const activeTopic = {
      id: "topic-1",
      title: "анкап и налоги",
      summaryShort: "Спорят про налоги и государство",
      summaryFacts: ["налоги"],
      confidence: 0.7,
      lastActiveAt: new Date("2026-04-12T10:00:00Z")
    };
    const prisma = {
      topicSession: {
        findFirst: vi.fn().mockResolvedValue(activeTopic),
        update: vi.fn().mockResolvedValue(activeTopic),
        create: vi.fn()
      },
      topicMessageLink: {
        upsert: vi.fn()
      }
    };
    const service = new TopicService(prisma as never);

    const result = await service.updateFromMessage({
      guildId: "guild",
      channelId: "channel",
      messageId: "m4",
      createdAt: new Date("2026-04-12T10:01:00Z"),
      content: "лол"
    });

    expect(result).toEqual({ topicId: "topic-1", resetReason: null });
    expect(prisma.topicSession.create).not.toHaveBeenCalled();
    expect(prisma.topicSession.update).toHaveBeenCalledWith({
      where: { id: "topic-1" },
      data: expect.objectContaining({
        summaryShort: "лол",
        lastActiveAt: expect.any(Date)
      })
    });
  });
});
