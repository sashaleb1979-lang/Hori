import type { Job } from "bullmq";

import { RELATIONSHIP_EVALUATOR_PROMPT } from "@hori/core";
import { asErrorMessage, normalizeWhitespace, type SessionJobPayload } from "@hori/shared";

import type { WorkerRuntime } from "../index";

const SESSION_INACTIVITY_MS = 10 * 60 * 1000;
const SESSION_LOOKBACK_MS = 3 * 60 * 60 * 1000;

function formatSessionTranscript(messages: Array<{ role: "User" | "Hori"; content: string }>) {
  return messages.map((entry) => `${entry.role}: ${entry.content}`).join("\n");
}

function parseVerdict(raw: string): "A" | "B" | "V" {
  const normalized = raw.trim().toUpperCase();
  if (normalized.includes("A")) {
    return "A";
  }

  if (normalized.includes("V")) {
    return "V";
  }

  return "B";
}

export function createSessionJob(runtime: WorkerRuntime) {
  return async (job: Job<SessionJobPayload>) => {
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

    const sessionRows: typeof rows = [];
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
    const sessionMessages = ordered
      .filter((row) => normalizeWhitespace(row.content).length > 0)
      .map((row) => ({
        role: row.user.isBot ? "Hori" as const : "User" as const,
        content: row.content,
        createdAt: row.createdAt
      }));

    if (
      sessionMessages.length < 3 ||
      !sessionMessages.some((entry) => entry.role === "User") ||
      !sessionMessages.some((entry) => entry.role === "Hori")
    ) {
      return { skipped: true, reason: "session too small" };
    }

    const prompt = RELATIONSHIP_EVALUATOR_PROMPT.replace("{session_messages}", formatSessionTranscript(sessionMessages));
    let verdict: "A" | "B" | "V" = "B";

    try {
      const response = await runtime.llmClient.chat({
        model: runtime.modelRouter.pickModel("summary", runtimeSettings.modelRouting),
        messages: [{ role: "system", content: prompt }],
        temperature: 0,
        topP: 0.1,
        maxTokens: 8
      });
      verdict = parseVerdict(response.message.content);
    } catch (error) {
      runtime.logger.warn(
        {
          error: asErrorMessage(error),
          guildId: job.data.guildId,
          channelId: job.data.channelId,
          userId: job.data.userId,
          jobId: job.id
        },
        "session evaluator skipped because llm is unavailable"
      );
      return { skipped: true, reason: "llm unavailable" };
    }

    const sessionStart = sessionMessages[0]?.createdAt ?? new Date();
    const sessionEnd = sessionMessages[sessionMessages.length - 1]?.createdAt ?? new Date();
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
      const trace = entry.debugTrace as { aggression?: { checkerVerdict?: string } } | null;
      return trace?.aggression?.checkerVerdict === "AGGRESSIVE";
    });
    const appliedVerdict = duplicateAggressionPenalty ? "B" : verdict;
    const autoApply =
      runtimeSettings.relationshipGrowthMode === "TRUSTED_AUTO" ||
      runtimeSettings.relationshipGrowthMode === "FULL_AUTO";

    if (autoApply && appliedVerdict !== "B") {
      await runtime.relationshipService.applySessionVerdict(job.data.guildId, job.data.userId, appliedVerdict, {
        allowStatePromotion: runtimeSettings.relationshipGrowthMode === "FULL_AUTO"
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
          sessionEnd: sessionEnd.toISOString()
        } as never
      }
    });

    return {
      skipped: false,
      verdict,
      appliedVerdict,
      growthMode: runtimeSettings.relationshipGrowthMode
    };
  };
}
