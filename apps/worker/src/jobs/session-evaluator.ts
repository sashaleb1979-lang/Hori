import type { Job } from "bullmq";

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

interface EvaluatorResult {
  verdict: "A" | "B" | "V";
  characteristic: string | null;
  lastChange: string | null;
}

function clipBlock(value: unknown, maxLen: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen).trim() : trimmed;
}

export function parseEvaluatorOutput(raw: string): EvaluatorResult {
  // V5.1: evaluator возвращает JSON {verdict, characteristic, lastChange}.
  // Fallback: если JSON не парсится, пробуем старый формат с буквой.
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const obj = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      const verdictRaw = typeof obj.verdict === "string" ? obj.verdict.trim().toUpperCase() : "";
      const verdict: "A" | "B" | "V" = verdictRaw === "A" ? "A" : verdictRaw === "V" ? "V" : "B";
      return {
        verdict,
        characteristic: clipBlock(obj.characteristic, 400),
        lastChange: clipBlock(obj.lastChange, 240)
      };
    } catch {
      // fall through to plain parser
    }
  }
  return {
    verdict: parseVerdict(raw),
    characteristic: null,
    lastChange: null
  };
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

    // V6 Phase C: ≥3 USER replies AND ≥1 Hori reply.
    const userReplyCount = sessionMessages.filter((entry) => entry.role === "User").length;
    const horiReplyCount = sessionMessages.filter((entry) => entry.role === "Hori").length;
    if (userReplyCount < 3 || horiReplyCount < 1) {
      return { skipped: true, reason: "session too small" };
    }

    const corePromptTemplates = await runtime.runtimeConfig.getCorePromptTemplates(job.data.guildId);
    const previousVector = await runtime.relationshipService.getVector(job.data.guildId, job.data.userId);
    const previousCharacteristic = previousVector.characteristic ?? "(нет данных)";
    const prompt = corePromptTemplates.relationshipEvaluatorPrompt
      .replace("{session_messages}", formatSessionTranscript(sessionMessages))
      .replace("{previous_characteristic}", previousCharacteristic);
    let verdict: "A" | "B" | "V" = "B";
    let characteristic: string | null = null;
    let lastChange: string | null = null;

    try {
      // V5.1 Phase G: relationship evaluator идёт по слоту classifier (cheaper).
      const evaluatorModel = runtimeSettings.modelRouting
        ? runtime.modelRouter.pickModelForSlot("classifier", runtimeSettings.modelRouting)
        : runtime.modelRouter.pickModel("summary", runtimeSettings.modelRouting);
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
        allowStatePromotion: runtimeSettings.relationshipGrowthMode === "FULL_AUTO",
        characteristic,
        lastChange
      });
    } else if (autoApply && (characteristic !== null || lastChange !== null)) {
      // V5.1: даже при verdict=B сохраняем обновлённые micro-blocks (characteristic/lastChange).
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
        } as never
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
