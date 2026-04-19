import type { Job } from "bullmq";

import { buildUserProfilePrompt, getModelProfile } from "@hori/llm";
import { MemoryFormationService } from "@hori/memory";
import { asErrorMessage, type ProfileJobPayload } from "@hori/shared";

import type { WorkerRuntime } from "../index";

export function createProfileJob(runtime: WorkerRuntime) {
  return async (job: Job<ProfileJobPayload>) => {
    const profile = getModelProfile("smart");
    const runtimeSettings = await runtime.runtimeConfig.getRuntimeSettings();
    const stats = await runtime.analytics.getUserStats(job.data.guildId, job.data.userId);

    if (!stats || !runtime.profileService.isEligible(stats.totalMessages)) {
      return { skipped: true, reason: "user not eligible" };
    }

    const current = await runtime.profileService.getProfile(job.data.guildId, job.data.userId);

    if (
      current &&
      !runtime.profileService.shouldRefreshProfile({
        totalMessages: stats.totalMessages,
        lastProfiledAt: current.lastProfiledAt,
        sourceWindowSize: current.sourceWindowSize
      })
    ) {
      return { skipped: true, reason: "profile refresh not needed" };
    }

    const messages = await runtime.profileService.getRecentMessagesForProfile(job.data.guildId, job.data.userId, 50);
    const prompt = buildUserProfilePrompt(
      [
        `Статистика: totalMessages=${stats.totalMessages}, avgMessageLength=${stats.avgMessageLength}, totalReplies=${stats.totalReplies}, totalMentions=${stats.totalMentions}.`,
        "Сообщения:",
        ...messages.map((message) => `- ${message.content}`)
      ].join("\n")
    );

    let parsed: {
      summaryShort?: string;
      styleTags?: string[];
      topicTags?: string[];
      confidenceScore?: number;
    };

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
      runtime.logger.warn({ error: asErrorMessage(error), guildId: job.data.guildId, jobId: job.id, userId: job.data.userId }, "profile refresh skipped because ollama is unavailable or returned invalid json");
      return { skipped: true, reason: "ollama unavailable" };
    }

    await runtime.profileService.upsertProfile({
      guildId: job.data.guildId,
      userId: job.data.userId,
      summaryShort: parsed.summaryShort ?? "Профиль сырой, данных маловато.",
      styleTags: parsed.styleTags ?? [],
      topicTags: parsed.topicTags ?? [],
      confidenceScore: Number(parsed.confidenceScore ?? 0.4),
      sourceWindowSize: stats.totalMessages,
      isEligible: true
    });

    // Invalidate Redis context cache so next request gets fresh data
    try {
      await runtime.redis.del(`ctx:profile:${job.data.guildId}:${job.data.userId}`);
    } catch { /* redis may be unavailable in local mode */ }

    const latestChannelId = messages[0]?.channelId;
    if (latestChannelId && messages.length) {
      try {
        const memoryModel = runtime.modelRouter.pickModelForSlot("memory", runtimeSettings.modelRouting);
        const formationEnv = {
          ...runtime.env,
          OLLAMA_FAST_MODEL: memoryModel,
          OLLAMA_SMART_MODEL: memoryModel
        };
        const formationService = new MemoryFormationService(runtime.prisma, runtime.retrievalService, runtime.llmClient, formationEnv, runtime.modelRouter.pickEmbedModel());
        const priorSummaries = await runtime.summaryService.getRecentSummaries(job.data.guildId, latestChannelId, 2);

        await formationService.runFormation({
          guildId: job.data.guildId,
          channelId: latestChannelId,
          userId: job.data.userId,
          priorSummaries: priorSummaries.map((summary) => summary.summaryShort),
          source: "profile_job",
          createdBy: "worker",
          messages: messages
            .slice()
            .reverse()
            .map((message) => ({ role: "user" as const, content: message.content })),
        });
      } catch (error) {
        runtime.logger.warn({ error: asErrorMessage(error), guildId: job.data.guildId, userId: job.data.userId, jobId: job.id }, "memory formation skipped");
      }
    }

    return { skipped: false };
  };
}

