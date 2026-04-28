"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
module.exports = __toCommonJS(index_exports);
var import_analytics = require("@hori/analytics");
var import_config = require("@hori/config");
var import_core = require("@hori/core");
var import_llm4 = require("@hori/llm");
var import_memory3 = require("@hori/memory");
var import_search = require("@hori/search");
var import_shared7 = require("@hori/shared");

// src/jobs/cleanup.ts
function createCleanupJob(runtime) {
  return async (job) => {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1e3);
    if (job.data.kind === "logs") {
      const result2 = await runtime.prisma.botEventLog.deleteMany({
        where: { createdAt: { lt: cutoff } }
      });
      return { deleted: result2.count, kind: "logs" };
    }
    const result = await runtime.prisma.interjectionLog.deleteMany({
      where: { createdAt: { lt: cutoff } }
    });
    const [expiredMoods, oldQueueItems] = await Promise.all([
      runtime.prisma.moodState.deleteMany({
        where: { endsAt: { lt: cutoff } }
      }),
      runtime.prisma.replyQueueItem.deleteMany({
        where: {
          status: { in: ["done", "dropped"] },
          updatedAt: { lt: cutoff }
        }
      })
    ]);
    return {
      deleted: result.count + expiredMoods.count + oldQueueItems.count,
      kind: "interjections",
      interjections: result.count,
      expiredMoods: expiredMoods.count,
      oldQueueItems: oldQueueItems.count
    };
  };
}

// src/jobs/conversation-analysis.ts
var ANALYSIS_WINDOW_MESSAGES = 30;
var MAX_BIO_NOTES_PER_USER = 20;
function buildAnalysisPrompt(messages, existingBio, existingRelationship) {
  const chatLog = messages.map((m) => `[${m.isBot ? "\u0425\u043E\u0440\u0438" : m.author}] ${m.content}`).join("\n");
  const bioSection = existingBio.length ? `\u0422\u0435\u043A\u0443\u0449\u0438\u0435 \u0437\u0430\u043C\u0435\u0442\u043A\u0438 \u043E \u044E\u0437\u0435\u0440\u0435:
${existingBio.map((n, i) => `${i + 1}. ${n}`).join("\n")}` : "\u0417\u0430\u043C\u0435\u0442\u043E\u043A \u043E \u044E\u0437\u0435\u0440\u0435 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442.";
  const relSection = existingRelationship ? `\u0422\u0435\u043A\u0443\u0449\u0435\u0435 \u043E\u0442\u043D\u043E\u0448\u0435\u043D\u0438\u0435: ${existingRelationship}` : "\u041E\u0442\u043D\u043E\u0448\u0435\u043D\u0438\u0435 \u043A \u044E\u0437\u0435\u0440\u0443: \u0434\u0435\u0444\u043E\u043B\u0442\u043D\u043E\u0435 (neutral).";
  return [
    {
      role: "system",
      content: [
        "\u0422\u044B \u0430\u043D\u0430\u043B\u0438\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u043C\u043E\u0434\u0443\u043B\u044C \u0425\u043E\u0440\u0438. \u0422\u0432\u043E\u044F \u0437\u0430\u0434\u0430\u0447\u0430 \u2014 \u043F\u0440\u043E\u0430\u043D\u0430\u043B\u0438\u0437\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0434\u0438\u0430\u043B\u043E\u0433 \u0438 \u0432\u0435\u0440\u043D\u0443\u0442\u044C JSON.",
        "",
        "\u041F\u0440\u0430\u0432\u0438\u043B\u0430:",
        "- \u0410\u043D\u0430\u043B\u0438\u0437\u0438\u0440\u0443\u0439 \u0422\u041E\u041B\u042C\u041A\u041E \u0444\u0430\u043A\u0442\u044B \u0438\u0437 \u0434\u0438\u0430\u043B\u043E\u0433\u0430, \u043D\u0435 \u0432\u044B\u0434\u0443\u043C\u044B\u0432\u0430\u0439",
        "- \u0411\u0438\u043E\u0433\u0440\u0430\u0444\u0438\u0447\u0435\u0441\u043A\u0438\u0435 \u0437\u0430\u043C\u0435\u0442\u043A\u0438: \u043A\u0440\u0430\u0442\u043A\u0438\u0435 \u0444\u0430\u043A\u0442\u044B \u043E \u044E\u0437\u0435\u0440\u0435 (\u0438\u043D\u0442\u0435\u0440\u0435\u0441\u044B, \u043F\u0440\u0438\u0432\u044B\u0447\u043A\u0438, \u0444\u0430\u043A\u0442\u044B \u0438\u0437 \u0436\u0438\u0437\u043D\u0438, \u0441\u0442\u0438\u043B\u044C \u043E\u0431\u0449\u0435\u043D\u0438\u044F)",
        "- \u041A\u0430\u0436\u0434\u0430\u044F \u0437\u0430\u043C\u0435\u0442\u043A\u0430 \u2014 \u043E\u0434\u043D\u043E \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u0435, \u043C\u0430\u043A\u0441\u0438\u043C\u0443\u043C",
        "- \u041D\u0435 \u0434\u0443\u0431\u043B\u0438\u0440\u0443\u0439 \u0443\u0436\u0435 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0435 \u0437\u0430\u043C\u0435\u0442\u043A\u0438",
        "- \u041E\u0442\u043D\u043E\u0448\u0435\u043D\u0438\u0435: \u043E\u0446\u0435\u043D\u0438 \u043A\u0430\u043A \u0434\u0438\u0430\u043B\u043E\u0433 \u043F\u043E\u0432\u043B\u0438\u044F\u043B \u043D\u0430 tone_bias (neutral/friendly/sharp), closeness_delta (-0.1..+0.1), trust_delta (-0.1..+0.1)",
        "- \u0415\u0441\u043B\u0438 \u0434\u0438\u0430\u043B\u043E\u0433 \u0441\u043A\u0443\u0447\u043D\u044B\u0439/\u043F\u0443\u0441\u0442\u043E\u0439 \u2014 \u0432\u0435\u0440\u043D\u0438 \u043F\u0443\u0441\u0442\u044B\u0435 \u043C\u0430\u0441\u0441\u0438\u0432\u044B \u0438 \u043D\u0443\u043B\u0435\u0432\u044B\u0435 \u0434\u0435\u043B\u044C\u0442\u044B",
        "",
        bioSection,
        relSection
      ].join("\n")
    },
    {
      role: "user",
      content: [
        "\u0414\u0438\u0430\u043B\u043E\u0433:",
        chatLog,
        "",
        '\u041E\u0442\u0432\u0435\u0442\u044C JSON: { "new_notes": ["\u0437\u0430\u043C\u0435\u0442\u043A\u04301", ...], "remove_notes": ["\u0442\u0435\u043A\u0441\u0442 \u0443\u0441\u0442\u0430\u0440\u0435\u0432\u0448\u0435\u0439 \u0437\u0430\u043C\u0435\u0442\u043A\u0438 (\u043A\u0430\u043A \u0432 \u0441\u043F\u0438\u0441\u043A\u0435 \u0432\u044B\u0448\u0435)", ...], "relationship_update": { "tone_bias": "neutral"|"friendly"|"sharp"|null, "closeness_delta": number, "trust_delta": number, "familiarity_delta": number }, "summary": "\u043E\u0434\u043D\u043E \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u0435 \u043E \u0441\u0443\u0442\u0438 \u0434\u0438\u0430\u043B\u043E\u0433\u0430" }'
      ].join("\n")
    }
  ];
}
function createConversationAnalysisJob(runtime) {
  return async (job) => {
    const { guildId, userId, channelId } = job.data;
    const messages = await runtime.prisma.message.findMany({
      where: {
        guildId,
        channelId,
        OR: [
          { userId },
          { user: { isBot: true } }
        ]
      },
      orderBy: { createdAt: "desc" },
      take: ANALYSIS_WINDOW_MESSAGES,
      include: { user: true }
    });
    if (messages.length < 3) {
      runtime.logger.debug({ guildId, userId }, "conversation-analysis: too few messages, skipping");
      return;
    }
    const chatMessages = messages.reverse().map((m) => ({
      author: m.user.globalName || m.user.username || m.userId,
      content: m.content,
      isBot: m.user.isBot
    }));
    const existingNotes = await runtime.prisma.userMemoryNote.findMany({
      where: { guildId, userId, active: true },
      orderBy: { createdAt: "desc" },
      take: MAX_BIO_NOTES_PER_USER
    });
    const relationship = await runtime.prisma.relationshipProfile.findUnique({
      where: { guildId_userId: { guildId, userId } }
    });
    const existingBio = existingNotes.map((n) => n.value);
    const existingRel = relationship ? `tone=${relationship.toneBias}, closeness=${relationship.closeness}, trust=${relationship.trustLevel}, familiarity=${relationship.familiarity}` : null;
    const runtimeSettings = await runtime.runtimeConfig.getRuntimeSettings();
    const model = runtime.modelRouter.pickModelForSlot("analytics", runtimeSettings.modelRouting);
    const prompt = buildAnalysisPrompt(chatMessages, existingBio, existingRel);
    let result;
    try {
      const response = await runtime.llmClient.chat({
        model,
        messages: prompt,
        format: "json",
        maxTokens: 400
      });
      const raw = response.message.content.trim();
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      result = JSON.parse(start >= 0 && end > start ? raw.slice(start, end + 1) : raw);
    } catch (error) {
      runtime.logger.warn({ error, guildId, userId }, "conversation-analysis: LLM parse failed");
      return;
    }
    const bioMemoryEnabled = runtimeSettings.memoryMode !== "OFF";
    if (bioMemoryEnabled && result.new_notes?.length) {
      for (const note of result.new_notes.slice(0, 5)) {
        const key = `bio:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`;
        await runtime.prisma.userMemoryNote.create({
          data: {
            guildId,
            userId,
            key,
            value: note.slice(0, 500),
            source: "conversation_analysis",
            active: true
          }
        });
      }
    }
    if (bioMemoryEnabled && result.remove_notes?.length) {
      for (const noteText of result.remove_notes.slice(0, 3)) {
        await runtime.prisma.userMemoryNote.updateMany({
          where: { guildId, userId, value: { contains: noteText.slice(0, 100) }, active: true },
          data: { active: false }
        });
      }
    }
    const update = result.relationship_update;
    if (update && relationship) {
      const newCloseness = clamp((relationship.closeness ?? 0.5) + (update.closeness_delta || 0), 0, 1);
      const newTrust = clamp((relationship.trustLevel ?? 0.5) + (update.trust_delta || 0), 0, 1);
      const newFamiliarity = clamp((relationship.familiarity ?? 0.5) + (update.familiarity_delta || 0), 0, 1);
      await runtime.prisma.relationshipProfile.update({
        where: { guildId_userId: { guildId, userId } },
        data: {
          ...update.tone_bias ? { toneBias: update.tone_bias } : {},
          closeness: newCloseness,
          trustLevel: newTrust,
          familiarity: newFamiliarity,
          interactionCount: { increment: 1 }
        }
      });
    } else if (update && !relationship) {
      await runtime.prisma.relationshipProfile.create({
        data: {
          guildId,
          userId,
          toneBias: update.tone_bias || "neutral",
          roastLevel: 0,
          praiseBias: 0,
          interruptPriority: 0,
          doNotMock: false,
          doNotInitiate: false,
          protectedTopics: [],
          closeness: clamp(0.5 + (update.closeness_delta || 0), 0, 1),
          trustLevel: clamp(0.5 + (update.trust_delta || 0), 0, 1),
          familiarity: clamp(0.5 + (update.familiarity_delta || 0), 0, 1),
          interactionCount: 1
        }
      });
    }
    try {
      await Promise.allSettled([
        runtime.redis.del(`ctx:profile:${guildId}:${userId}`),
        runtime.redis.del(`ctx:rel:${guildId}:${userId}`)
      ]);
    } catch {
    }
    runtime.logger.info(
      {
        guildId,
        userId,
        newNotes: result.new_notes?.length ?? 0,
        removedNotes: result.remove_notes?.length ?? 0,
        toneBias: update?.tone_bias,
        summary: result.summary
      },
      "conversation-analysis: completed"
    );
  };
}
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// src/jobs/embeddings.ts
var import_shared = require("@hori/shared");
function createEmbeddingJob(runtime) {
  return async (job) => {
    const runtimeSettings = await runtime.runtimeConfig.getRuntimeSettings();
    if (job.data.entityType === "message") {
      const message = await runtime.prisma.message.findUnique({
        where: { id: job.data.entityId }
      });
      if (!message || message.content.length < runtime.env.MESSAGE_EMBED_MIN_CHARS) {
        return { skipped: true, reason: "message not eligible" };
      }
      let vector2;
      try {
        vector2 = await runtime.embeddingAdapter.embedOne(message.content, {
          dimensions: runtimeSettings.openaiEmbedDimensions
        });
      } catch (error) {
        runtime.logger.warn({ entityId: message.id, error: (0, import_shared.asErrorMessage)(error), jobId: job.id }, "embedding skipped because ollama is unavailable");
        return { skipped: true, reason: "ollama unavailable" };
      }
      await runtime.prisma.messageEmbedding.upsert({
        where: { messageId: message.id },
        update: {
          guildId: message.guildId,
          channelId: message.channelId,
          dimensions: vector2.length
        },
        create: {
          messageId: message.id,
          guildId: message.guildId,
          channelId: message.channelId,
          dimensions: vector2.length
        }
      });
      await runtime.prisma.$executeRawUnsafe(
        `UPDATE "MessageEmbedding" SET embedding = $1::vector WHERE "messageId" = $2`,
        (0, import_shared.toVectorLiteral)(vector2),
        message.id
      );
      await runtime.prisma.message.update({
        where: { id: message.id },
        data: { vectorizedAt: /* @__PURE__ */ new Date() }
      });
      return { skipped: false, entityType: "message" };
    }
    const source = job.data.entityType === "server_memory" ? await runtime.prisma.serverMemory.findUnique({ where: { id: job.data.entityId } }) : job.data.entityType === "user_memory" ? await runtime.prisma.userMemoryNote.findUnique({ where: { id: job.data.entityId } }) : job.data.entityType === "channel_memory" ? await runtime.prisma.channelMemoryNote.findUnique({ where: { id: job.data.entityId } }) : await runtime.prisma.eventMemory.findUnique({ where: { id: job.data.entityId } });
    if (!source) {
      return { skipped: true, reason: "entity not found" };
    }
    const value = "value" in source ? source.value : "";
    let vector;
    try {
      vector = await runtime.embeddingAdapter.embedOne(value, {
        dimensions: runtimeSettings.openaiEmbedDimensions
      });
    } catch (error) {
      runtime.logger.warn({ entityId: job.data.entityId, error: (0, import_shared.asErrorMessage)(error), jobId: job.id }, "embedding skipped because ollama is unavailable");
      return { skipped: true, reason: "ollama unavailable" };
    }
    await runtime.retrievalService.setEmbedding(job.data.entityType, job.data.entityId, (0, import_shared.toVectorLiteral)(vector), vector.length);
    return { skipped: false, entityType: job.data.entityType };
  };
}

// src/jobs/memory-formation.ts
var import_llm = require("@hori/llm");
var import_memory = require("@hori/memory");
var import_shared2 = require("@hori/shared");
var chunkSize = 80;
var maxMessagesByDepth = {
  channel: {
    recent: 700,
    deep: 3500
  },
  server: {
    recent: 1600,
    deep: 8e3
  }
};
function createMemoryFormationJob(runtime) {
  return async (job) => {
    const run = await runtime.prisma.memoryBuildRun.findUnique({
      where: { id: job.data.runId }
    });
    if (!run) {
      return { skipped: true, reason: "run not found" };
    }
    if (job.data.scope === "channel" && !job.data.channelId) {
      await markRunFailed(runtime, job.data.runId, "channel scope requires channelId");
      return { skipped: true, reason: "channelId required" };
    }
    const isOpenAI = runtime.env.LLM_PROVIDER === "openai";
    const runtimeSettings = await runtime.runtimeConfig.getRuntimeSettings();
    let formationEnv;
    let bestModelName;
    let bestModelReason;
    if (isOpenAI) {
      bestModelName = runtime.modelRouter.pickModelForSlot("memory", runtimeSettings.modelRouting);
      bestModelReason = `openai ${runtimeSettings.modelRouting.preset} memory slot`;
      formationEnv = {
        ...runtime.env,
        OLLAMA_FAST_MODEL: bestModelName,
        OLLAMA_SMART_MODEL: bestModelName
      };
    } else {
      const bestModel = await (0, import_llm.resolveBestInstalledChatModel)(
        runtime.env.OLLAMA_BASE_URL,
        runtime.env.OLLAMA_SMART_MODEL,
        runtime.logger
      );
      bestModelName = bestModel.model;
      bestModelReason = bestModel.reason;
      formationEnv = {
        ...runtime.env,
        OLLAMA_FAST_MODEL: bestModel.model,
        OLLAMA_SMART_MODEL: bestModel.model
      };
    }
    const embedding = runtime.modelRouter.pickEmbeddingModel({
      dimensions: runtimeSettings.openaiEmbedDimensions
    });
    const formationService = new import_memory.MemoryFormationService(
      runtime.prisma,
      runtime.retrievalService,
      runtime.llmClient,
      formationEnv,
      embedding.model,
      embedding.dimensions
    );
    await runtime.prisma.memoryBuildRun.update({
      where: { id: job.data.runId },
      data: {
        status: "running",
        startedAt: /* @__PURE__ */ new Date(),
        bestModel: bestModelName,
        progressJson: {
          phase: "loading_messages",
          processedChunks: 0,
          totalChunks: 0,
          model: bestModelName,
          modelReason: bestModelReason
        }
      }
    });
    try {
      const messages = await loadMessages(runtime, job.data);
      if (!messages.length) {
        await runtime.prisma.memoryBuildRun.update({
          where: { id: job.data.runId },
          data: {
            status: "finished",
            finishedAt: /* @__PURE__ */ new Date(),
            progressJson: { phase: "finished", processedChunks: 0, totalChunks: 0 },
            resultJson: {
              skipped: true,
              reason: "no messages in database for selected scope",
              model: bestModelName
            }
          }
        });
        return { skipped: true, reason: "no messages" };
      }
      const chunks = chunkMessages(messages, chunkSize);
      const totals = { extractedFacts: 0, added: 0, updated: 0, deleted: 0, skipped: 0 };
      const sampleFacts = [];
      for (let index = 0; index < chunks.length; index += 1) {
        const chunk = chunks[index] ?? [];
        const dominant = pickDominantUser(chunk, job.data.requestedBy);
        const channelId = pickDominantChannel(chunk, job.data.channelId ?? null);
        const priorSummaries = channelId ? await runtime.summaryService.getRecentSummaries(job.data.guildId, channelId, 2) : [];
        let result;
        try {
          result = await formationService.runFormation({
            guildId: job.data.guildId,
            channelId: channelId ?? job.data.channelId ?? "server",
            userId: dominant.userId,
            displayName: dominant.displayName,
            priorSummaries: priorSummaries.map((summary) => summary.summaryShort),
            messages: toFormationMessages(chunk),
            source: `memory_build:${job.data.scope}:${job.data.depth}`,
            createdBy: job.data.requestedBy
          });
        } catch (error) {
          runtime.logger.warn(
            { error: (0, import_shared2.asErrorMessage)(error), guildId: job.data.guildId, runId: job.data.runId, chunkIndex: index },
            "memory formation chunk failed"
          );
          totals.skipped += 1;
          continue;
        }
        totals.extractedFacts += result.extractedFacts;
        totals.added += result.added;
        totals.updated += result.updated;
        totals.deleted += result.deleted;
        totals.skipped += result.skipped;
        sampleFacts.push(...result.facts.slice(0, Math.max(0, 12 - sampleFacts.length)));
        const progress = {
          phase: "forming_memory",
          processedChunks: index + 1,
          totalChunks: chunks.length,
          totals,
          latestChannelId: channelId,
          latestUserId: dominant.userId,
          model: bestModelName,
          modelReason: bestModelReason
        };
        await job.updateProgress(progress);
        await runtime.prisma.memoryBuildRun.update({
          where: { id: job.data.runId },
          data: { progressJson: progress }
        });
      }
      const resultJson = {
        scope: job.data.scope,
        depth: job.data.depth,
        messageCount: messages.length,
        chunkCount: chunks.length,
        totals,
        sampleFacts,
        model: bestModelName,
        modelReason: bestModelReason
      };
      await runtime.prisma.memoryBuildRun.update({
        where: { id: job.data.runId },
        data: {
          status: "finished",
          finishedAt: /* @__PURE__ */ new Date(),
          progressJson: { phase: "finished", processedChunks: chunks.length, totalChunks: chunks.length, totals },
          resultJson
        }
      });
      return { skipped: false, ...resultJson };
    } catch (error) {
      const errorText = (0, import_shared2.asErrorMessage)(error);
      await markRunFailed(runtime, job.data.runId, errorText);
      throw error;
    }
  };
}
async function loadMessages(runtime, payload) {
  const take = maxMessagesByDepth[payload.scope][payload.depth];
  const messages = await runtime.prisma.message.findMany({
    where: {
      guildId: payload.guildId,
      ...payload.scope === "channel" && payload.channelId ? { channelId: payload.channelId } : {}
    },
    orderBy: { createdAt: "desc" },
    take,
    include: { user: true }
  });
  return messages.filter((message) => message.content.trim().length > 0).reverse();
}
function chunkMessages(messages, size) {
  const chunks = [];
  for (let index = 0; index < messages.length; index += size) {
    chunks.push(messages.slice(index, index + size));
  }
  return chunks;
}
function toFormationMessages(messages) {
  return messages.map((message) => {
    const author = message.user.globalName || message.user.username || message.userId;
    return {
      role: "user",
      content: `[${author} | userId=${message.userId} | channelId=${message.channelId}] ${message.content}`
    };
  });
}
function pickDominantUser(messages, fallbackUserId) {
  const counts = /* @__PURE__ */ new Map();
  for (const message of messages) {
    if (message.user.isBot) {
      continue;
    }
    const entry2 = counts.get(message.userId) ?? {
      count: 0,
      displayName: message.user.globalName || message.user.username || null
    };
    entry2.count += 1;
    counts.set(message.userId, entry2);
  }
  const [userId, entry] = [...counts.entries()].sort((left, right) => right[1].count - left[1].count)[0] ?? [
    fallbackUserId,
    { count: 0, displayName: null }
  ];
  return { userId, displayName: entry.displayName };
}
function pickDominantChannel(messages, fallbackChannelId) {
  const counts = /* @__PURE__ */ new Map();
  for (const message of messages) {
    counts.set(message.channelId, (counts.get(message.channelId) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? fallbackChannelId;
}
async function markRunFailed(runtime, runId, errorText) {
  await runtime.prisma.memoryBuildRun.update({
    where: { id: runId },
    data: {
      status: "failed",
      finishedAt: /* @__PURE__ */ new Date(),
      errorText
    }
  });
}

// src/jobs/profiles.ts
var import_llm2 = require("@hori/llm");
var import_memory2 = require("@hori/memory");
var import_shared3 = require("@hori/shared");
function createProfileJob(runtime) {
  return async (job) => {
    const profile = (0, import_llm2.getModelProfile)("smart");
    const runtimeSettings = await runtime.runtimeConfig.getRuntimeSettings();
    const stats = await runtime.analytics.getUserStats(job.data.guildId, job.data.userId);
    if (!stats || !runtime.profileService.isEligible(stats.totalMessages)) {
      return { skipped: true, reason: "user not eligible" };
    }
    const current = await runtime.profileService.getProfile(job.data.guildId, job.data.userId);
    if (current && !runtime.profileService.shouldRefreshProfile({
      totalMessages: stats.totalMessages,
      lastProfiledAt: current.lastProfiledAt,
      sourceWindowSize: current.sourceWindowSize
    })) {
      return { skipped: true, reason: "profile refresh not needed" };
    }
    const messages = await runtime.profileService.getRecentMessagesForProfile(job.data.guildId, job.data.userId, 50);
    const prompt = (0, import_llm2.buildUserProfilePrompt)(
      [
        `\u0421\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043A\u0430: totalMessages=${stats.totalMessages}, avgMessageLength=${stats.avgMessageLength}, totalReplies=${stats.totalReplies}, totalMentions=${stats.totalMentions}.`,
        "\u0421\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F:",
        ...messages.map((message) => `- ${message.content}`)
      ].join("\n")
    );
    let parsed;
    try {
      const response = await runtime.llmClient.chat({
        model: runtime.modelRouter.pickModel("profile", runtimeSettings.modelRouting),
        messages: prompt,
        format: "json",
        temperature: Math.min(profile.temperature, 0.2),
        topP: profile.topP,
        maxTokens: Math.min(profile.maxTokens, 220)
      });
      const raw = response.message.content.trim();
      try {
        parsed = JSON.parse(raw);
      } catch {
        const start = raw.indexOf("{");
        const end = raw.lastIndexOf("}");
        if (start !== -1 && end > start) {
          parsed = JSON.parse(raw.slice(start, end + 1));
        } else {
          throw new Error("no JSON object found in LLM response");
        }
      }
    } catch (error) {
      runtime.logger.warn({ error: (0, import_shared3.asErrorMessage)(error), guildId: job.data.guildId, jobId: job.id, userId: job.data.userId }, "profile refresh skipped because ollama is unavailable or returned invalid json");
      return { skipped: true, reason: "ollama unavailable" };
    }
    await runtime.profileService.upsertProfile({
      guildId: job.data.guildId,
      userId: job.data.userId,
      summaryShort: parsed.summaryShort ?? "\u041F\u0440\u043E\u0444\u0438\u043B\u044C \u0441\u044B\u0440\u043E\u0439, \u0434\u0430\u043D\u043D\u044B\u0445 \u043C\u0430\u043B\u043E\u0432\u0430\u0442\u043E.",
      styleTags: parsed.styleTags ?? [],
      topicTags: parsed.topicTags ?? [],
      confidenceScore: Number(parsed.confidenceScore ?? 0.4),
      sourceWindowSize: stats.totalMessages,
      isEligible: true
    });
    try {
      await runtime.redis.del(`ctx:profile:${job.data.guildId}:${job.data.userId}`);
    } catch {
    }
    const latestChannelId = messages[0]?.channelId;
    if (latestChannelId && messages.length) {
      try {
        const memoryModel = runtime.modelRouter.pickModelForSlot("memory", runtimeSettings.modelRouting);
        const embedding = runtime.modelRouter.pickEmbeddingModel({
          dimensions: runtimeSettings.openaiEmbedDimensions
        });
        const formationEnv = {
          ...runtime.env,
          OLLAMA_FAST_MODEL: memoryModel,
          OLLAMA_SMART_MODEL: memoryModel
        };
        const formationService = new import_memory2.MemoryFormationService(
          runtime.prisma,
          runtime.retrievalService,
          runtime.llmClient,
          formationEnv,
          embedding.model,
          embedding.dimensions
        );
        const priorSummaries = await runtime.summaryService.getRecentSummaries(job.data.guildId, latestChannelId, 2);
        await formationService.runFormation({
          guildId: job.data.guildId,
          channelId: latestChannelId,
          userId: job.data.userId,
          priorSummaries: priorSummaries.map((summary) => summary.summaryShort),
          source: "profile_job",
          createdBy: "worker",
          messages: messages.slice().reverse().map((message) => ({ role: "user", content: message.content }))
        });
      } catch (error) {
        runtime.logger.warn({ error: (0, import_shared3.asErrorMessage)(error), guildId: job.data.guildId, userId: job.data.userId, jobId: job.id }, "memory formation skipped");
      }
    }
    return { skipped: false };
  };
}

// src/jobs/search-cache.ts
function createSearchCacheCleanupJob(runtime) {
  return async (_job) => {
    const result = await runtime.searchCache.cleanupExpired();
    return { deleted: result.count };
  };
}

// src/jobs/session-evaluator.ts
var import_shared4 = require("@hori/shared");
var SESSION_INACTIVITY_MS = 10 * 60 * 1e3;
var SESSION_LOOKBACK_MS = 3 * 60 * 60 * 1e3;
function formatSessionTranscript(messages) {
  return messages.map((entry) => `${entry.role}: ${entry.content}`).join("\n");
}
function parseVerdict(raw) {
  const normalized = raw.trim().toUpperCase();
  if (normalized.includes("A")) {
    return "A";
  }
  if (normalized.includes("V")) {
    return "V";
  }
  return "B";
}
function clipBlock(value, maxLen) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen).trim() : trimmed;
}
function parseEvaluatorOutput(raw) {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const obj = JSON.parse(jsonMatch[0]);
      const verdictRaw = typeof obj.verdict === "string" ? obj.verdict.trim().toUpperCase() : "";
      const verdict = verdictRaw === "A" ? "A" : verdictRaw === "V" ? "V" : "B";
      return {
        verdict,
        characteristic: clipBlock(obj.characteristic, 400),
        lastChange: clipBlock(obj.lastChange, 240)
      };
    } catch {
    }
  }
  return {
    verdict: parseVerdict(raw),
    characteristic: null,
    lastChange: null
  };
}
function createSessionJob(runtime) {
  return async (job) => {
    const runtimeSettings = await runtime.runtimeConfig.getRuntimeSettings();
    const since = new Date(Date.now() - SESSION_LOOKBACK_MS);
    const rows = await runtime.prisma.message.findMany({
      where: {
        guildId: job.data.guildId,
        channelId: job.data.channelId,
        createdAt: { gte: since },
        OR: [
          { userId: job.data.userId },
          { user: { isBot: true } }
        ]
      },
      orderBy: { createdAt: "desc" },
      take: 80,
      include: {
        user: {
          select: {
            isBot: true
          }
        }
      }
    });
    if (!rows.length) {
      return { skipped: true, reason: "session not found" };
    }
    if (Date.now() - rows[0].createdAt.getTime() < SESSION_INACTIVITY_MS) {
      return { skipped: true, reason: "session still active" };
    }
    const sessionRows = [];
    for (const row of rows) {
      if (sessionRows.length) {
        const newest = sessionRows[sessionRows.length - 1];
        if (newest.createdAt.getTime() - row.createdAt.getTime() > SESSION_INACTIVITY_MS) {
          break;
        }
      }
      sessionRows.push(row);
    }
    const ordered = [...sessionRows].reverse();
    const sessionMessages = ordered.filter((row) => (0, import_shared4.normalizeWhitespace)(row.content).length > 0).map((row) => ({
      role: row.user.isBot ? "Hori" : "User",
      content: row.content,
      createdAt: row.createdAt
    }));
    if (sessionMessages.length < 3 || !sessionMessages.some((entry) => entry.role === "User") || !sessionMessages.some((entry) => entry.role === "Hori")) {
      return { skipped: true, reason: "session too small" };
    }
    const corePromptTemplates = await runtime.runtimeConfig.getCorePromptTemplates(job.data.guildId);
    const previousVector = await runtime.relationshipService.getVector(job.data.guildId, job.data.userId);
    const previousCharacteristic = previousVector.characteristic ?? "(\u043D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445)";
    const prompt = corePromptTemplates.relationshipEvaluatorPrompt.replace("{session_messages}", formatSessionTranscript(sessionMessages)).replace("{previous_characteristic}", previousCharacteristic);
    let verdict = "B";
    let characteristic = null;
    let lastChange = null;
    try {
      const evaluatorModel = runtimeSettings.modelRouting ? runtime.modelRouter.pickModelForSlot("classifier", runtimeSettings.modelRouting) : runtime.modelRouter.pickModel("summary", runtimeSettings.modelRouting);
      const response = await runtime.llmClient.chat({
        model: evaluatorModel,
        messages: [{ role: "system", content: prompt }],
        temperature: 0,
        topP: 0.1,
        maxTokens: 400
      });
      const parsed = parseEvaluatorOutput(response.message.content);
      verdict = parsed.verdict;
      characteristic = parsed.characteristic;
      lastChange = parsed.lastChange;
    } catch (error) {
      runtime.logger.warn(
        {
          error: (0, import_shared4.asErrorMessage)(error),
          guildId: job.data.guildId,
          channelId: job.data.channelId,
          userId: job.data.userId,
          jobId: job.id
        },
        "session evaluator skipped because llm is unavailable"
      );
      return { skipped: true, reason: "llm unavailable" };
    }
    const sessionStart = sessionMessages[0]?.createdAt ?? /* @__PURE__ */ new Date();
    const sessionEnd = sessionMessages[sessionMessages.length - 1]?.createdAt ?? /* @__PURE__ */ new Date();
    const recentLogs = await runtime.prisma.botEventLog.findMany({
      where: {
        guildId: job.data.guildId,
        channelId: job.data.channelId,
        userId: job.data.userId,
        createdAt: {
          gte: sessionStart,
          lte: sessionEnd
        }
      },
      select: {
        debugTrace: true
      }
    });
    const duplicateAggressionPenalty = verdict === "V" && recentLogs.some((entry) => {
      const trace = entry.debugTrace;
      return trace?.aggression?.checkerVerdict === "AGGRESSIVE";
    });
    const appliedVerdict = duplicateAggressionPenalty ? "B" : verdict;
    const autoApply = runtimeSettings.relationshipGrowthMode === "TRUSTED_AUTO" || runtimeSettings.relationshipGrowthMode === "FULL_AUTO";
    if (autoApply && appliedVerdict !== "B") {
      await runtime.relationshipService.applySessionVerdict(job.data.guildId, job.data.userId, appliedVerdict, {
        allowStatePromotion: runtimeSettings.relationshipGrowthMode === "FULL_AUTO",
        characteristic,
        lastChange
      });
    } else if (autoApply && (characteristic !== null || lastChange !== null)) {
      await runtime.relationshipService.applySessionVerdict(job.data.guildId, job.data.userId, "B", {
        allowStatePromotion: false,
        characteristic,
        lastChange
      });
    }
    await runtime.prisma.botEventLog.create({
      data: {
        guildId: job.data.guildId,
        channelId: job.data.channelId,
        userId: job.data.userId,
        eventType: "relationship_session_eval",
        routeReason: `verdict:${verdict}`,
        relationshipApplied: autoApply && appliedVerdict !== "B",
        debugTrace: {
          relationshipVerdict: verdict,
          appliedVerdict,
          duplicateAggressionPenalty,
          growthMode: runtimeSettings.relationshipGrowthMode,
          messageCount: sessionMessages.length,
          sessionStart: sessionStart.toISOString(),
          sessionEnd: sessionEnd.toISOString(),
          characteristic,
          lastChange
        }
      }
    });
    return {
      skipped: false,
      verdict,
      appliedVerdict,
      characteristic,
      lastChange,
      growthMode: runtimeSettings.relationshipGrowthMode
    };
  };
}

// src/jobs/summaries.ts
var import_llm3 = require("@hori/llm");
var import_shared5 = require("@hori/shared");
function createSummaryJob(runtime) {
  return async (job) => {
    const profile = (0, import_llm3.getModelProfile)("smart");
    const messages = await runtime.summaryService.getMessagesForNextSummary(
      job.data.guildId,
      job.data.channelId,
      runtime.env.SUMMARY_CHUNK_MESSAGE_COUNT
    );
    if (messages.length < runtime.env.SUMMARY_MIN_MESSAGES) {
      return { skipped: true, reason: "not enough messages" };
    }
    const runtimeSettings = await runtime.runtimeConfig.getRuntimeSettings();
    const prompt = (0, import_llm3.buildSummaryPrompt)(
      messages.map((message) => `[${message.user.globalName || message.user.username || message.userId}] ${message.content}`).join("\n"),
      "\u0421\u0434\u0435\u043B\u0430\u0439 \u043A\u0440\u0430\u0442\u043A\u0443\u044E \u0438 \u0434\u043B\u0438\u043D\u043D\u0443\u044E \u0441\u0432\u043E\u0434\u043A\u0443. \u0412 \u043F\u0435\u0440\u0432\u043E\u0439 \u0441\u0442\u0440\u043E\u043A\u0435 \u043A\u043E\u0440\u043E\u0442\u043A\u043E, \u0434\u0430\u043B\u044C\u0448\u0435 \u043F\u043E\u0434\u0440\u043E\u0431\u043D\u0435\u0435."
    );
    let response;
    try {
      response = await runtime.llmClient.chat({
        model: runtime.modelRouter.pickModel("summary", runtimeSettings.modelRouting),
        messages: prompt,
        temperature: profile.temperature,
        topP: profile.topP,
        maxTokens: profile.maxTokens
      });
    } catch (error) {
      runtime.logger.warn({ channelId: job.data.channelId, error: (0, import_shared5.asErrorMessage)(error), guildId: job.data.guildId, jobId: job.id }, "summary skipped because ollama is unavailable");
      return { skipped: true, reason: "ollama unavailable" };
    }
    const [summaryShort, ...rest] = response.message.content.split("\n");
    await runtime.summaryService.storeSummary({
      guildId: job.data.guildId,
      channelId: job.data.channelId,
      rangeStart: messages[0].createdAt,
      rangeEnd: messages[messages.length - 1].createdAt,
      summaryShort: summaryShort.trim(),
      summaryLong: rest.join("\n").trim() || summaryShort.trim(),
      topicTags: [],
      notableUsers: [...new Set(messages.map((message) => message.userId))].slice(0, 5)
    });
    return { skipped: false, count: messages.length };
  };
}

// src/jobs/topics.ts
var import_shared6 = require("@hori/shared");
function createTopicJob(runtime) {
  return async (job) => {
    if (!runtime.env.FEATURE_TOPIC_ENGINE_ENABLED) {
      return { skipped: true, reason: "feature disabled" };
    }
    const message = await runtime.prisma.message.findUnique({
      where: { id: job.data.messageId }
    });
    if (!message) {
      return { skipped: true, reason: "message not found" };
    }
    let embedding;
    if (message.content.length >= runtime.env.MESSAGE_EMBED_MIN_CHARS) {
      try {
        embedding = await runtime.embeddingAdapter.embedOne(message.content);
      } catch (error) {
        runtime.logger.warn({ error: (0, import_shared6.asErrorMessage)(error), messageId: message.id, jobId: job.id }, "topic embedding unavailable");
      }
    }
    return runtime.topicService.updateFromMessage({
      guildId: message.guildId,
      channelId: message.channelId,
      messageId: message.id,
      content: message.content,
      createdAt: message.createdAt,
      replyToMessageId: message.replyToMessageId,
      embedding
    });
  };
}

// src/index.ts
async function main() {
  const env = (0, import_config.loadEnv)();
  (0, import_config.assertEnvForRole)(env, "worker");
  const logger = (0, import_shared7.createLogger)(env.LOG_LEVEL);
  const prisma = (0, import_shared7.createPrismaClient)();
  const redis = (0, import_shared7.createRedisClient)(env.REDIS_URL);
  await (0, import_shared7.ensureInfrastructureReady)({
    role: "worker",
    nodeEnv: env.NODE_ENV,
    databaseUrl: env.DATABASE_URL,
    redisUrl: env.REDIS_URL,
    prisma,
    redis,
    logger
  });
  const queues = (0, import_shared7.createAppQueues)(env.REDIS_URL, env.JOB_QUEUE_PREFIX);
  const analytics = new import_analytics.AnalyticsQueryService(prisma);
  const summaryService = new import_memory3.SummaryService(prisma);
  const profileService = new import_memory3.ProfileService(prisma, env);
  const relationshipService = new import_memory3.RelationshipService(prisma);
  const retrievalService = new import_memory3.RetrievalService(prisma, logger);
  const topicService = new import_memory3.TopicService(prisma, {
    topicTtlMinutes: env.TOPIC_TTL_MINUTES,
    similarityThreshold: env.TOPIC_SIM_THRESHOLD
  });
  const searchCache = new import_search.SearchCacheService(prisma, redis);
  const runtimeConfig = new import_core.RuntimeConfigService(prisma, env);
  const { client: llmClient } = (0, import_core.createRuntimeLlmClient)(env, logger, runtimeConfig, "worker");
  const modelRouter = new import_llm4.ModelRouter(env);
  const embeddingAdapter = new import_llm4.EmbeddingAdapter(llmClient, modelRouter);
  const runtime = {
    env,
    logger,
    prisma,
    redis,
    queues,
    analytics,
    summaryService,
    profileService,
    retrievalService,
    relationshipService,
    topicService,
    searchCache,
    runtimeConfig,
    llmClient,
    modelRouter,
    embeddingAdapter
  };
  const workers = [
    (0, import_shared7.createWorker)(import_shared7.QUEUE_NAMES.summary, env.REDIS_URL, env.JOB_QUEUE_PREFIX, createSummaryJob(runtime), env.JOB_CONCURRENCY_SUMMARIES),
    (0, import_shared7.createWorker)(import_shared7.QUEUE_NAMES.profile, env.REDIS_URL, env.JOB_QUEUE_PREFIX, createProfileJob(runtime), env.JOB_CONCURRENCY_PROFILES),
    (0, import_shared7.createWorker)(import_shared7.QUEUE_NAMES.embedding, env.REDIS_URL, env.JOB_QUEUE_PREFIX, createEmbeddingJob(runtime), env.JOB_CONCURRENCY_EMBEDDINGS),
    (0, import_shared7.createWorker)(import_shared7.QUEUE_NAMES.topic, env.REDIS_URL, env.JOB_QUEUE_PREFIX, createTopicJob(runtime), 1),
    (0, import_shared7.createWorker)(import_shared7.QUEUE_NAMES.session, env.REDIS_URL, env.JOB_QUEUE_PREFIX, createSessionJob(runtime), 1),
    (0, import_shared7.createWorker)(import_shared7.QUEUE_NAMES.memoryFormation, env.REDIS_URL, env.JOB_QUEUE_PREFIX, createMemoryFormationJob(runtime), 1),
    (0, import_shared7.createWorker)(import_shared7.QUEUE_NAMES.searchCache, env.REDIS_URL, env.JOB_QUEUE_PREFIX, createSearchCacheCleanupJob(runtime), 1),
    (0, import_shared7.createWorker)(import_shared7.QUEUE_NAMES.cleanup, env.REDIS_URL, env.JOB_QUEUE_PREFIX, createCleanupJob(runtime), 1),
    (0, import_shared7.createWorker)(import_shared7.QUEUE_NAMES.conversationAnalysis, env.REDIS_URL, env.JOB_QUEUE_PREFIX, createConversationAnalysisJob(runtime), 1)
  ];
  await Promise.all([
    queues.cleanup.add("cleanup", { kind: "logs" }, { jobId: "cleanup:logs", repeat: { every: 24 * 60 * 60 * 1e3 } }),
    queues.cleanup.add("cleanup", { kind: "interjections" }, { jobId: "cleanup:interjections", repeat: { every: 24 * 60 * 60 * 1e3 } }),
    queues.searchCache.add(
      "search-cache",
      { nowIso: (/* @__PURE__ */ new Date()).toISOString() },
      { jobId: "search-cache:cleanup", repeat: { every: 60 * 60 * 1e3 } }
    )
  ]);
  for (const worker of workers) {
    worker.on("failed", (job, error) => {
      logger.error({ queue: worker.name, jobId: job?.id, error }, "worker job failed");
    });
  }
  logger.info("workers started");
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
