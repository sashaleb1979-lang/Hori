import type { Job } from "bullmq";

import { asErrorMessage, normalizeWhitespace, type ContextMessage, type RelationshipHook, type SessionJobPayload } from "@hori/shared";

import type { WorkerRuntime } from "../index";

const SESSION_INACTIVITY_MS = 10 * 60 * 1000;
const SESSION_SLEEP_MS = 20 * 60 * 1000;

interface EvaluatedSessionTurn {
  role: "Summary" | "User" | "Hori";
  content: string;
  createdAt: Date;
}

interface EvaluatorResult {
  verdict: "A" | "B" | "V";
  characteristic: string | null;
  lastChange: string | null;
}

interface HookEvaluatorResult {
  hooks: Array<Omit<RelationshipHook, "id">>;
}

function formatSessionTranscript(messages: EvaluatedSessionTurn[]) {
  return messages.map((entry) => `${entry.role}: ${entry.content}`).join("\n");
}

function formatExistingHooks(hooks: RelationshipHook[]) {
  if (!hooks.length) {
    return "(нет устойчивых hooks)";
  }

  return hooks
    .map((hook) => `- ${hook.label}: ${hook.detail}${hook.useTag ? ` [use=${hook.useTag}]` : ""}${hook.avoidTag ? ` [avoid=${hook.avoidTag}]` : ""}`)
    .join("\n");
}

function buildHooksEvaluatorPrompt(turns: EvaluatedSessionTurn[], existingHooks: RelationshipHook[]) {
  return [
    "Ты обновляешь persistent social hooks пользователя для prompt Хори.",
    "Твоя задача: вернуть только устойчивые социальные рычаги, которые реально можно использовать в будущих сценах.",
    "Ограничения: максимум 5 hooks, не брать одноразовые шутки, не плодить микромелочь, label короткий, detail конкретный, useTag/avoidTag короткие.",
    `Старые hooks:\n${formatExistingHooks(existingHooks)}`,
    `Сессия:\n${formatSessionTranscript(turns)}`,
    "Ответь строго JSON без комментариев: {\"hooks\":[{\"label\":\"...\",\"detail\":\"...\",\"useTag\":\"...\",\"avoidTag\":\"...\",\"confidence\":0.0,\"freshness\":\"fresh|steady|stale\"}]}. Если устойчивых hooks нет — верни пустой массив."
  ].join("\n\n");
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

function clipBlock(value: unknown, maxLen: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen).trim() : trimmed;
}

function clipHookTag(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim().replace(/\s+/g, "_");
  return trimmed ? trimmed.slice(0, 48) : null;
}

function clipHookConfidence(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0.5;
  }

  return Math.max(0, Math.min(1, value));
}

function clipHookFreshness(value: unknown): "fresh" | "steady" | "stale" {
  return value === "fresh" || value === "stale" ? value : "steady";
}

export function parseEvaluatorOutput(raw: string): EvaluatorResult {
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

export function parseHookEvaluatorOutput(raw: string): HookEvaluatorResult {
  const jsonMatch = raw.match(/\{[\s\S]*\}/) ?? raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    return { hooks: [] };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as { hooks?: unknown } | unknown[];
    const hooksArray = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { hooks?: unknown }).hooks)
        ? (parsed as { hooks: unknown[] }).hooks
        : [];

    const hooks = hooksArray
      .map((hook) => {
        if (!hook || typeof hook !== "object") {
          return null;
        }

        const value = hook as Record<string, unknown>;
        const label = clipBlock(value.label, 48);
        const detail = clipBlock(value.detail, 220);
        if (!label || !detail) {
          return null;
        }

        return {
          label,
          detail,
          useTag: clipHookTag(value.useTag),
          avoidTag: clipHookTag(value.avoidTag),
          confidence: clipHookConfidence(value.confidence),
          freshness: clipHookFreshness(value.freshness)
        } satisfies Omit<RelationshipHook, "id">;
      })
      .filter((hook): hook is Omit<RelationshipHook, "id"> => Boolean(hook))
      .slice(0, 5);

    return { hooks };
  } catch {
    return { hooks: [] };
  }
}

function toEvaluatorTurns(messages: ContextMessage[]): EvaluatedSessionTurn[] {
  return messages
    .filter((entry) => normalizeWhitespace(entry.content).length > 0)
    .map((entry) => ({
      role: entry.userId === "session-summary"
        ? "Summary" as const
        : entry.isBot
          ? "Hori" as const
          : "User" as const,
      content: entry.content,
      createdAt: entry.createdAt
    }));
}

function pickEvaluatorModel(runtime: WorkerRuntime, runtimeSettings: Awaited<ReturnType<WorkerRuntime["runtimeConfig"]["getRuntimeSettings"]>>) {
  return runtimeSettings.modelRouting
    ? runtime.modelRouter.pickModelForSlot("classifier", runtimeSettings.modelRouting)
    : runtime.modelRouter.pickModel("summary", runtimeSettings.modelRouting);
}

export function createSessionJob(runtime: WorkerRuntime) {
  return async (job: Job<SessionJobPayload>) => {
    const runtimeSettings = await runtime.runtimeConfig.getRuntimeSettings();
    const corePromptTemplates = await runtime.runtimeConfig.getCorePromptTemplates(job.data.guildId);
    const sessionState = await runtime.sessionBuffer.getChannelSessionState(job.data.guildId, job.data.channelId);

    if (!sessionState) {
      return { skipped: true, reason: "session not found" };
    }

    if (Date.now() - sessionState.lastActivityAt.getTime() < SESSION_INACTIVITY_MS) {
      return { skipped: true, reason: "session still active" };
    }

    const participants = [...sessionState.participants];

    if (!participants.length) {
      return { skipped: true, reason: "session has no participants" };
    }

    const evaluatorModel = pickEvaluatorModel(runtime, runtimeSettings);
    const autoApply =
      runtimeSettings.relationshipGrowthMode === "TRUSTED_AUTO" ||
      runtimeSettings.relationshipGrowthMode === "FULL_AUTO";
    const results: Array<Record<string, unknown>> = [];
    let hasCompaction = sessionState.hasCompaction;

    for (const participantId of participants) {
      try {
        const compactedMessages = await runtime.sessionBuffer.getCompactedSessionMessages(
          job.data.guildId,
          participantId,
          job.data.channelId
        );
        const sessionTurns = toEvaluatorTurns(compactedMessages);

        hasCompaction = hasCompaction || compactedMessages.some((entry) => entry.userId === "session-summary");

        const userReplyCount = sessionTurns.filter((entry) => entry.role === "User").length;
        const horiReplyCount = sessionTurns.filter((entry) => entry.role === "Hori").length;
        if (userReplyCount < 3 || horiReplyCount < 1) {
          results.push({ userId: participantId, skipped: true, reason: "session too small" });
          continue;
        }

        const previousVector = await runtime.relationshipService.getVector(job.data.guildId, participantId);
        const previousCharacteristic = previousVector.characteristic ?? "(нет данных)";
        const relationshipPrompt = corePromptTemplates.relationshipEvaluatorPrompt
          .replace("{session_messages}", formatSessionTranscript(sessionTurns))
          .replace("{previous_characteristic}", previousCharacteristic);

        let verdict: "A" | "B" | "V" = "B";
        let characteristic: string | null = null;
        let lastChange: string | null = null;

        try {
          const response = await runtime.llmClient.chat({
            model: evaluatorModel,
            messages: [{ role: "system", content: relationshipPrompt }],
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
              userId: participantId,
              jobId: job.id
            },
            "session evaluator skipped because llm is unavailable"
          );
          results.push({ userId: participantId, skipped: true, reason: "llm unavailable" });
          continue;
        }

        const existingHooks = await runtime.relationshipService.listPromptHooks(job.data.guildId, participantId, 5).catch(() => []);
        let mergedHooks = existingHooks;
        try {
          const hookResponse = await runtime.llmClient.chat({
            model: evaluatorModel,
            messages: [{ role: "system", content: buildHooksEvaluatorPrompt(sessionTurns, existingHooks) }],
            temperature: 0,
            topP: 0.1,
            maxTokens: 450
          });
          const nextHooks = parseHookEvaluatorOutput(hookResponse.message.content).hooks;
          mergedHooks = await runtime.relationshipService.mergePromptHooks(job.data.guildId, participantId, nextHooks, 5);
        } catch (error) {
          runtime.logger.warn(
            {
              error: asErrorMessage(error),
              guildId: job.data.guildId,
              channelId: job.data.channelId,
              userId: participantId,
              jobId: job.id
            },
            "hook evaluator skipped because llm is unavailable"
          );
        }

        const sessionStart = sessionTurns[0]?.createdAt ?? new Date();
        const sessionEnd = sessionTurns[sessionTurns.length - 1]?.createdAt ?? new Date();
        const recentLogs = await runtime.prisma.botEventLog.findMany({
          where: {
            guildId: job.data.guildId,
            channelId: job.data.channelId,
            userId: participantId,
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

        if (autoApply && appliedVerdict !== "B") {
          await runtime.relationshipService.applySessionVerdict(job.data.guildId, participantId, appliedVerdict, {
            allowStatePromotion: runtimeSettings.relationshipGrowthMode === "FULL_AUTO",
            characteristic,
            lastChange
          });
        } else if (autoApply && (characteristic !== null || lastChange !== null)) {
          await runtime.relationshipService.applySessionVerdict(job.data.guildId, participantId, "B", {
            allowStatePromotion: false,
            characteristic,
            lastChange
          });
        }

        await runtime.prisma.botEventLog.create({
          data: {
            guildId: job.data.guildId,
            channelId: job.data.channelId,
            userId: participantId,
            eventType: "relationship_session_eval",
            routeReason: `verdict:${verdict}`,
            relationshipApplied: autoApply && appliedVerdict !== "B",
            debugTrace: {
              relationshipVerdict: verdict,
              appliedVerdict,
              duplicateAggressionPenalty,
              growthMode: runtimeSettings.relationshipGrowthMode,
              messageCount: sessionTurns.length,
              sessionStart: sessionStart.toISOString(),
              sessionEnd: sessionEnd.toISOString(),
              characteristic,
              lastChange,
              hooks: mergedHooks.map((hook) => ({
                label: hook.label,
                detail: hook.detail,
                useTag: hook.useTag ?? null,
                avoidTag: hook.avoidTag ?? null,
                confidence: hook.confidence,
                freshness: hook.freshness ?? "steady"
              }))
            } as never
          }
        });

        results.push({
          userId: participantId,
          skipped: false,
          verdict,
          appliedVerdict,
          characteristic,
          lastChange,
          hookCount: mergedHooks.length
        });
      } finally {
        await runtime.sessionBuffer.clearSession(job.data.guildId, participantId, job.data.channelId).catch(() => undefined);
      }
    }

    const sleepUntil = hasCompaction ? new Date(Date.now() + SESSION_SLEEP_MS) : null;
    if (sleepUntil) {
      await Promise.allSettled([
        runtime.sessionBuffer.setGuildSleepUntil(job.data.guildId, sleepUntil),
        runtime.sessionBuffer.setChannelSessionSleepUntil(job.data.guildId, job.data.channelId, sleepUntil)
      ]);
    }

    await runtime.prisma.botEventLog.create({
      data: {
        guildId: job.data.guildId,
        channelId: job.data.channelId,
        eventType: "session_closed",
        routeReason: sleepUntil ? "sleep_started" : "session_closed",
        usedSearch: false,
        relationshipApplied: false,
        debugTrace: {
          sessionSince: sessionState.sessionSince.toISOString(),
          lastActivityAt: sessionState.lastActivityAt.toISOString(),
          participantIds: participants,
          compactionCount: sessionState.compactionCount,
          hasCompaction,
          sleepUntil: sleepUntil?.toISOString() ?? null,
          results
        } as never
      }
    });

    return {
      skipped: false,
      participants: participants.length,
      compactionCount: sessionState.compactionCount,
      hasCompaction,
      sleepUntil: sleepUntil?.toISOString() ?? null,
      results
    };
  };
}
