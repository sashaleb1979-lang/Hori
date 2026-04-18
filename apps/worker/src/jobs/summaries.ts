import type { Job } from "bullmq";

import { buildSummaryPrompt, getModelProfile } from "@hori/llm";
import { asErrorMessage, type SummaryJobPayload } from "@hori/shared";

import type { WorkerRuntime } from "../index";

export function createSummaryJob(runtime: WorkerRuntime) {
  return async (job: Job<SummaryJobPayload>) => {
    const profile = getModelProfile("smart");
    const messages = await runtime.summaryService.getMessagesForNextSummary(
      job.data.guildId,
      job.data.channelId,
      runtime.env.SUMMARY_CHUNK_MESSAGE_COUNT
    );

    if (messages.length < runtime.env.SUMMARY_MIN_MESSAGES) {
      return { skipped: true, reason: "not enough messages" };
    }

    const runtimeSettings = await runtime.runtimeConfig.getRuntimeSettings();
    const prompt = buildSummaryPrompt(
      messages.map((message) => `[${message.user.globalName || message.user.username || message.userId}] ${message.content}`).join("\n"),
      "Сделай краткую и длинную сводку. В первой строке коротко, дальше подробнее."
    );

    let response: Awaited<ReturnType<WorkerRuntime["llmClient"]["chat"]>>;

    try {
      response = await runtime.llmClient.chat({
        model: runtime.modelRouter.pickModel("summary", runtimeSettings.modelRouting),
        messages: prompt,
        temperature: profile.temperature,
        topP: profile.topP,
        maxTokens: profile.maxTokens
      });
    } catch (error) {
      runtime.logger.warn({ channelId: job.data.channelId, error: asErrorMessage(error), guildId: job.data.guildId, jobId: job.id }, "summary skipped because ollama is unavailable");
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

