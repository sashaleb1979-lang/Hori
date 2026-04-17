import type { Job } from "bullmq";

import { resolveBestInstalledChatModel, ModelRouter } from "@hori/llm";
import { MemoryFormationService, type FormationMessage, type MemoryFormationResult } from "@hori/memory";
import { asErrorMessage, type MemoryFormationJobPayload } from "@hori/shared";

import type { WorkerRuntime } from "../index";

const chunkSize = 80;
const maxMessagesByDepth = {
  channel: {
    recent: 700,
    deep: 3500
  },
  server: {
    recent: 1600,
    deep: 8000
  }
} as const;

interface BuildMessage {
  channelId: string;
  userId: string;
  content: string;
  createdAt: Date;
  user: {
    username: string | null;
    globalName: string | null;
    isBot: boolean;
  };
}

interface Totals extends Record<string, number> {
  extractedFacts: number;
  added: number;
  updated: number;
  deleted: number;
  skipped: number;
}

export function createMemoryFormationJob(runtime: WorkerRuntime) {
  return async (job: Job<MemoryFormationJobPayload>) => {
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

    const isOpenAI = (runtime.env as Record<string, unknown>).LLM_PROVIDER === "openai";
    let formationEnv: typeof runtime.env;
    let bestModelName: string;
    let bestModelReason: string;

    if (isOpenAI) {
      const oaiEnv = runtime.env as Record<string, unknown>;
      bestModelName = (oaiEnv.OPENAI_SMART_MODEL as string) ?? "gpt-4o-mini";
      bestModelReason = "openai provider";
      formationEnv = {
        ...runtime.env,
        OLLAMA_FAST_MODEL: bestModelName,
        OLLAMA_SMART_MODEL: bestModelName
      };
    } else {
      const bestModel = await resolveBestInstalledChatModel(
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

    const formationService = new MemoryFormationService(
      runtime.prisma,
      runtime.retrievalService,
      runtime.llmClient,
      formationEnv,
      runtime.modelRouter.pickEmbedModel()
    );

    await runtime.prisma.memoryBuildRun.update({
      where: { id: job.data.runId },
      data: {
        status: "running",
        startedAt: new Date(),
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
            finishedAt: new Date(),
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
      const totals: Totals = { extractedFacts: 0, added: 0, updated: 0, deleted: 0, skipped: 0 };
      const sampleFacts: string[] = [];

      for (let index = 0; index < chunks.length; index += 1) {
        const chunk = chunks[index] ?? [];
        const dominant = pickDominantUser(chunk, job.data.requestedBy);
        const channelId = pickDominantChannel(chunk, job.data.channelId ?? null);
        const priorSummaries = channelId
          ? await runtime.summaryService.getRecentSummaries(job.data.guildId, channelId, 2)
          : [];

        let result: MemoryFormationResult;
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
            { error: asErrorMessage(error), guildId: job.data.guildId, runId: job.data.runId, chunkIndex: index },
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
          finishedAt: new Date(),
          progressJson: { phase: "finished", processedChunks: chunks.length, totalChunks: chunks.length, totals },
          resultJson
        }
      });

      return { skipped: false, ...resultJson };
    } catch (error) {
      const errorText = asErrorMessage(error);
      await markRunFailed(runtime, job.data.runId, errorText);
      throw error;
    }
  };
}

async function loadMessages(runtime: WorkerRuntime, payload: MemoryFormationJobPayload): Promise<BuildMessage[]> {
  const take = maxMessagesByDepth[payload.scope][payload.depth];
  const messages = await runtime.prisma.message.findMany({
    where: {
      guildId: payload.guildId,
      ...(payload.scope === "channel" && payload.channelId ? { channelId: payload.channelId } : {})
    },
    orderBy: { createdAt: "desc" },
    take,
    include: { user: true }
  });

  return messages
    .filter((message) => message.content.trim().length > 0)
    .reverse();
}

function chunkMessages(messages: BuildMessage[], size: number) {
  const chunks: BuildMessage[][] = [];
  for (let index = 0; index < messages.length; index += size) {
    chunks.push(messages.slice(index, index + size));
  }
  return chunks;
}

function toFormationMessages(messages: BuildMessage[]): FormationMessage[] {
  return messages.map((message) => {
    const author = message.user.globalName || message.user.username || message.userId;
    return {
      role: "user" as const,
      content: `[${author} | userId=${message.userId} | channelId=${message.channelId}] ${message.content}`
    };
  });
}

function pickDominantUser(messages: BuildMessage[], fallbackUserId: string) {
  const counts = new Map<string, { count: number; displayName: string | null }>();

  for (const message of messages) {
    if (message.user.isBot) {
      continue;
    }

    const entry = counts.get(message.userId) ?? {
      count: 0,
      displayName: message.user.globalName || message.user.username || null
    };
    entry.count += 1;
    counts.set(message.userId, entry);
  }

  const [userId, entry] = [...counts.entries()].sort((left, right) => right[1].count - left[1].count)[0] ?? [
    fallbackUserId,
    { count: 0, displayName: null }
  ];

  return { userId, displayName: entry.displayName };
}

function pickDominantChannel(messages: BuildMessage[], fallbackChannelId: string | null) {
  const counts = new Map<string, number>();

  for (const message of messages) {
    counts.set(message.channelId, (counts.get(message.channelId) ?? 0) + 1);
  }

  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? fallbackChannelId;
}

async function markRunFailed(runtime: WorkerRuntime, runId: string, errorText: string) {
  await runtime.prisma.memoryBuildRun.update({
    where: { id: runId },
    data: {
      status: "failed",
      finishedAt: new Date(),
      errorText
    }
  });
}
