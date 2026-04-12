import type { Job } from "bullmq";

import { buildUserProfilePrompt, getModelProfile } from "@hori/llm";
import { asErrorMessage, type ProfileJobPayload } from "@hori/shared";

import type { WorkerRuntime } from "../index";

export function createProfileJob(runtime: WorkerRuntime) {
  return async (job: Job<ProfileJobPayload>) => {
    const profile = getModelProfile("smart");
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
        model: runtime.env.OLLAMA_SMART_MODEL,
        messages: prompt,
        format: "json",
        temperature: Math.min(profile.temperature, 0.2),
        topP: profile.topP,
        maxTokens: Math.min(profile.maxTokens, 220)
      });

      parsed = JSON.parse(response.message.content) as {
        summaryShort?: string;
        styleTags?: string[];
        topicTags?: string[];
        confidenceScore?: number;
      };
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

    return { skipped: false };
  };
}

