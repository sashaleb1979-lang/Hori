import type { Job } from "bullmq";

import { buildSummaryPrompt } from "@hori/llm";
import type { SummaryJobPayload } from "@hori/shared";

import type { WorkerRuntime } from "../index";

export function createSummaryJob(runtime: WorkerRuntime) {
  return async (job: Job<SummaryJobPayload>) => {
    const messages = await runtime.summaryService.getMessagesForNextSummary(
      job.data.guildId,
      job.data.channelId,
      runtime.env.SUMMARY_CHUNK_MESSAGE_COUNT
    );

    if (messages.length < runtime.env.SUMMARY_MIN_MESSAGES) {
      return { skipped: true, reason: "not enough messages" };
    }

    const prompt = buildSummaryPrompt(
      messages.map((message) => `[${message.user.globalName || message.user.username || message.userId}] ${message.content}`).join("\n"),
      "Сделай краткую и длинную сводку. В первой строке коротко, дальше подробнее."
    );

    const response = await runtime.llmClient.chat({
      model: runtime.env.OLLAMA_SMART_MODEL,
      messages: prompt
    });

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

