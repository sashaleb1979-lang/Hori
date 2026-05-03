import type { Job } from "bullmq";

import { OpenAIClient } from "@hori/llm";
import { buildCompactionMessages } from "@hori/memory";
import { asErrorMessage, type SessionCompactionJobPayload } from "@hori/shared";

import type { WorkerRuntime } from "../index";

const SESSION_COMPACTION_MODEL = "gpt-5-nano";

export function createSessionCompactionJob(runtime: WorkerRuntime) {
  const flexClient = runtime.env.OPENAI_API_KEY
    ? new OpenAIClient({
        ...runtime.env,
        OLLAMA_TIMEOUT_MS: Math.max(runtime.env.OLLAMA_TIMEOUT_MS ?? 60_000, 15 * 60 * 1000)
      }, runtime.logger)
    : null;

  return async (job: Job<SessionCompactionJobPayload>) => {
    if (!flexClient) {
      return { skipped: true, reason: "missing_openai_api_key" };
    }

    const candidate = await runtime.sessionBuffer.getCompactionCandidate(
      job.data.guildId,
      job.data.userId,
      job.data.channelId
    );

    if (!candidate) {
      return { skipped: true, reason: "nothing_to_compact" };
    }

    let summaryText = "";
    try {
      const response = await flexClient.chat({
        model: SESSION_COMPACTION_MODEL,
        serviceTier: "flex",
        messages: buildCompactionMessages(
          candidate.priorSummaries,
          candidate.messages.map((message) => ({
            role: message.isBot ? "assistant" : "user",
            content: message.content
          }))
        ),
        temperature: 0,
        maxTokens: 220
      });
      summaryText = response.message.content.trim();
    } catch (error) {
      runtime.logger.warn(
        {
          guildId: job.data.guildId,
          channelId: job.data.channelId,
          userId: job.data.userId,
          error: asErrorMessage(error)
        },
        "session compaction failed"
      );
      return { skipped: true, reason: "flex_unavailable" };
    }

    if (!summaryText) {
      return { skipped: true, reason: "empty_summary" };
    }

    await runtime.sessionBuffer.storeCompactionSegment({
      guildId: job.data.guildId,
      userId: job.data.userId,
      channelId: job.data.channelId,
      sessionSince: candidate.sessionSince,
      rangeStart: candidate.rangeStart,
      rangeEnd: candidate.rangeEnd,
      rangeEndMessageId: candidate.rangeEndMessageId,
      summary: summaryText,
      messageCount: candidate.messages.length
    });

    return {
      skipped: false,
      compactedMessages: candidate.messages.length,
      rangeEndMessageId: candidate.rangeEndMessageId
    };
  };
}