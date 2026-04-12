import type { AppEnv } from "@hori/config";
import type { AppPrismaClient, LlmChatMessage } from "@hori/shared";
import { toVectorLiteral } from "@hori/shared";

import { buildCompactionMessages, type CompactionPromptMessage } from "./compaction-prompt";

const candidateSearchLimit = 20;
const candidateGetAllLimit = 50;
const maxCandidatesPerDecision = 30;
const maxFactsPerRun = 12;

export type MemoryScope = "server" | "user" | "channel" | "event";
export type FormationActionEvent = "ADD" | "UPDATE" | "DELETE" | "NOOP";

export interface FormationMessage extends CompactionPromptMessage {}

export interface FormationCandidateMemory {
  id: string;
  scope: MemoryScope;
  key: string;
  text: string;
  type?: string;
  createdAt?: string;
}

export interface FormationAction {
  event: FormationActionEvent;
  scope: MemoryScope;
  id?: string;
  key?: string;
  eventKey?: string;
  text?: string;
  type?: string;
  reason?: string;
}

export interface MemoryFormationRequest {
  guildId: string;
  channelId: string;
  userId: string;
  displayName?: string | null;
  priorSummaries?: string[];
  messages: FormationMessage[];
  source?: string | null;
  createdBy?: string | null;
}

export interface MemoryFormationResult {
  extractedFacts: number;
  added: number;
  updated: number;
  deleted: number;
  skipped: number;
  compactedSummary: string;
  facts: string[];
  actions: FormationAction[];
}

export interface MemoryFormationLlm {
  chat(options: {
    model: string;
    messages: LlmChatMessage[];
    format?: "json";
    temperature?: number;
    maxTokens?: number;
  }): Promise<{ message: { role: "assistant"; content: string } }>;
  embed(model: string, input: string | string[]): Promise<number[][]>;
}

export interface MemoryFormationRetrieval {
  findRelevantServerMemory(
    guildId: string,
    queryEmbedding?: number[],
    limit?: number,
  ): Promise<Array<{ id: string; key: string; value: string; type: string; createdAt?: Date; updatedAt?: Date }>>;
  findRelevantUserMemory(
    guildId: string,
    userId: string,
    queryEmbedding?: number[],
    limit?: number,
  ): Promise<Array<{ id: string; key: string; value: string; createdAt?: Date }>>;
  findRelevantChannelMemory(
    guildId: string,
    channelId: string,
    queryEmbedding?: number[],
    limit?: number,
  ): Promise<Array<{ id: string; key: string; value: string; type: string; createdAt?: Date }>>;
  findRelevantEventMemory(
    guildId: string,
    channelId: string,
    queryEmbedding?: number[],
    limit?: number,
  ): Promise<Array<{ id: string; key: string; value: string; type: string; eventKey?: string; createdAt?: Date }>>;
  rememberServerFact(input: {
    guildId: string;
    key: string;
    value: string;
    type: string;
    source?: string | null;
    createdBy?: string | null;
  }): Promise<{ id: string }>;
  rememberChannelFact(input: {
    guildId: string;
    channelId: string;
    key: string;
    value: string;
    type: string;
    source?: string | null;
    createdBy?: string | null;
  }): Promise<{ id: string }>;
  rememberEventFact(input: {
    guildId: string;
    channelId?: string | null;
    eventKey: string;
    key: string;
    value: string;
    type: string;
    source?: string | null;
    createdBy?: string | null;
  }): Promise<{ id: string }>;
  setEmbedding(
    entityType: "server_memory" | "user_memory" | "channel_memory" | "event_memory",
    entityId: string,
    vectorLiteral: string,
  ): Promise<unknown>;
}

export class MemoryFormationService {
  constructor(
    private readonly prisma: AppPrismaClient,
    private readonly retrieval: MemoryFormationRetrieval,
    private readonly llm: MemoryFormationLlm,
    private readonly env: AppEnv,
  ) {}

  async runFormation(request: MemoryFormationRequest): Promise<MemoryFormationResult> {
    const compactedSummary = await this.compactConversationSegment(
      request.priorSummaries ?? [],
      request.messages,
    );

    const result: MemoryFormationResult = {
      extractedFacts: 0,
      added: 0,
      updated: 0,
      deleted: 0,
      skipped: 0,
      compactedSummary,
      facts: [],
      actions: [],
    };

    let facts: string[];
    try {
      facts = await this.extractFacts(request, compactedSummary);
    } catch {
      return result;
    }

    if (facts.length === 0) {
      return result;
    }

    result.extractedFacts = facts.length;
    result.facts = facts;

    const candidates = await this.gatherCandidates(request, facts);

    let actions: FormationAction[];
    try {
      actions = await this.decideActions(request, facts, candidates);
    } catch {
      return result;
    }

    result.actions = actions;

    await this.applyActions(request, actions, result);
    return result;
  }

  async compactConversationSegment(
    priorSummaries: string[],
    messages: readonly FormationMessage[],
  ): Promise<string> {
    if (messages.length === 0) {
      return "";
    }

    try {
      const response = await this.llm.chat({
        model: this.env.OLLAMA_FAST_MODEL,
        messages: buildCompactionMessages(priorSummaries, messages),
        temperature: 0.1,
        maxTokens: 220,
      });

      const compacted = response.message.content.trim();
      if (compacted) {
        return compacted;
      }
    } catch {
      // Fall through to local fallback if compaction LLM is unavailable.
    }

    return fallbackCompaction(messages);
  }

  private async extractFacts(request: MemoryFormationRequest, compactedSummary: string): Promise<string[]> {
    const response = await this.llm.chat({
      model: this.env.OLLAMA_FAST_MODEL,
      format: "json",
      temperature: 0.1,
      maxTokens: 320,
      messages: [
        {
          role: "system",
          content:
            "Ты модуль извлечения памяти. Выделяй только устойчивые факты: предпочтения, запреты, границы, договорённости, повторяющиеся темы, важные персональные сведения, channel context, server-wide context и важные события. Игнорируй мимолётные эмоции, шутки, одноразовые реплики и всё, что быстро устаревает. Верни JSON строго формата {\"facts\": string[]}",
        },
        {
          role: "user",
          content: [
            `guildId: ${request.guildId}`,
            `channelId: ${request.channelId}`,
            `userId: ${request.userId}`,
            request.displayName ? `displayName: ${request.displayName}` : null,
            "Сжатый сегмент разговора:",
            compactedSummary || fallbackCompaction(request.messages),
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    });

    return normalizeFacts(parseJsonResponse<{ facts?: unknown }>(response.message.content), maxFactsPerRun);
  }

  private async gatherCandidates(
    request: MemoryFormationRequest,
    facts: string[],
  ): Promise<FormationCandidateMemory[]> {
    const seen = new Set<string>();
    const candidates: FormationCandidateMemory[] = [];
    const limitPerFact = Math.max(1, Math.floor(candidateSearchLimit / Math.max(facts.length, 1)));

    let embeddings: number[][] = [];
    if (facts.length > 0) {
      try {
        embeddings = await this.llm.embed(this.env.OLLAMA_EMBED_MODEL, facts);
      } catch {
        embeddings = [];
      }
    }

    for (let index = 0; index < facts.length; index += 1) {
      if (candidates.length >= maxCandidatesPerDecision) {
        break;
      }

      const embedding = embeddings[index] ?? [];
      let serverResults: Array<{ id: string; key: string; value: string; type: string; createdAt?: Date; updatedAt?: Date }> = [];
      let userResults: Array<{ id: string; key: string; value: string; createdAt?: Date }> = [];
      let channelResults: Array<{ id: string; key: string; value: string; type: string; createdAt?: Date }> = [];
      let eventResults: Array<{ id: string; key: string; value: string; type: string; eventKey?: string; createdAt?: Date }> = [];
      try {
        [serverResults, userResults, channelResults, eventResults] = await Promise.all([
          this.retrieval.findRelevantServerMemory(request.guildId, embedding, limitPerFact),
          this.retrieval.findRelevantUserMemory(request.guildId, request.userId, embedding, limitPerFact),
          this.retrieval.findRelevantChannelMemory(request.guildId, request.channelId, embedding, limitPerFact),
          this.retrieval.findRelevantEventMemory(request.guildId, request.channelId, embedding, limitPerFact),
        ]);
      } catch {
        continue;
      }

      pushServerCandidates(candidates, seen, serverResults);
      pushUserCandidates(candidates, seen, userResults);
      pushChannelCandidates(candidates, seen, channelResults);
      pushEventCandidates(candidates, seen, eventResults);
    }

    if (candidates.length < maxCandidatesPerDecision) {
      const [recentServer, recentUser, recentChannel, recentEvents] = await Promise.all([
        this.prisma.serverMemory.findMany({
          where: { guildId: request.guildId },
          orderBy: { updatedAt: "desc" },
          take: candidateGetAllLimit,
          select: { id: true, key: true, value: true, type: true, createdAt: true },
        }),
        this.prisma.userMemoryNote.findMany({
          where: { guildId: request.guildId, userId: request.userId, active: true },
          orderBy: { createdAt: "desc" },
          take: candidateGetAllLimit,
          select: { id: true, key: true, value: true, createdAt: true },
        }),
        this.prisma.channelMemoryNote.findMany({
          where: { guildId: request.guildId, channelId: request.channelId, active: true },
          orderBy: { updatedAt: "desc" },
          take: candidateGetAllLimit,
          select: { id: true, key: true, value: true, type: true, createdAt: true },
        }),
        this.prisma.eventMemory.findMany({
          where: {
            guildId: request.guildId,
            active: true,
            OR: [{ channelId: request.channelId }, { channelId: null }],
          },
          orderBy: { updatedAt: "desc" },
          take: candidateGetAllLimit,
          select: { id: true, key: true, value: true, type: true, eventKey: true, createdAt: true },
        }),
      ]);

      pushServerCandidates(candidates, seen, recentServer);
      pushUserCandidates(candidates, seen, recentUser);
      pushChannelCandidates(candidates, seen, recentChannel);
      pushEventCandidates(candidates, seen, recentEvents);
    }

    return candidates.slice(0, maxCandidatesPerDecision);
  }

  private async decideActions(
    request: MemoryFormationRequest,
    facts: string[],
    candidates: FormationCandidateMemory[],
  ): Promise<FormationAction[]> {
    const response = await this.llm.chat({
      model: this.env.OLLAMA_SMART_MODEL,
      format: "json",
      temperature: 0.1,
      maxTokens: 900,
      messages: [
        {
          role: "system",
          content:
            "Ты модуль принятия memory-решений. Сравни новые факты с существующими memories и верни JSON строго формата {\"actions\": FormationAction[]}. event только ADD, UPDATE, DELETE или NOOP. scope только user, channel, server или event. user — личные предпочтения, запреты, биографические детали и устойчивые отношения текущего пользователя. channel — нормы, темы, локальные шутки и контекст текущего канала. server — общие факты сервера, коллективные договорённости, named entities и shared context. event — важные события, планы, дедлайны, конфликты, изменения или повторяющиеся эпизоды; для event добавляй eventKey. Для ADD/UPDATE давай короткий key, финальный text и необязательный type. Не дублируй существующие memories без причины.",
        },
        {
          role: "user",
          content: JSON.stringify(
            {
              guildId: request.guildId,
              channelId: request.channelId,
              userId: request.userId,
              facts,
              candidates,
            },
            null,
            2,
          ),
        },
      ],
    });

    return normalizeActions(parseJsonResponse<{ actions?: unknown }>(response.message.content));
  }

  private async applyActions(
    request: MemoryFormationRequest,
    actions: FormationAction[],
    result: MemoryFormationResult,
  ) {
    const updated = new Set<string>();
    const deleted = new Set<string>();

    for (const action of actions) {
      switch (action.event) {
        case "ADD": {
          const text = action.text?.trim();
          if (!text) {
            result.skipped += 1;
            continue;
          }

          const key = normalizeMemoryKey(action.key ?? text);
          if (action.scope === "server") {
            const stored = await this.retrieval.rememberServerFact({
              guildId: request.guildId,
              key,
              value: text,
              type: action.type ?? "fact",
              source: request.source ?? undefined,
              createdBy: request.createdBy ?? undefined,
            });
            await this.updateEmbedding("server_memory", stored.id, text);
          } else if (action.scope === "channel") {
            const stored = await this.retrieval.rememberChannelFact({
              guildId: request.guildId,
              channelId: request.channelId,
              key,
              value: text,
              type: action.type ?? "channel_fact",
              source: request.source ?? undefined,
              createdBy: request.createdBy ?? undefined,
            });
            await this.updateEmbedding("channel_memory", stored.id, text);
          } else if (action.scope === "event") {
            const stored = await this.retrieval.rememberEventFact({
              guildId: request.guildId,
              channelId: request.channelId,
              eventKey: normalizeMemoryKey(action.eventKey ?? action.key ?? text),
              key,
              value: text,
              type: action.type ?? "event",
              source: request.source ?? undefined,
              createdBy: request.createdBy ?? undefined,
            });
            await this.updateEmbedding("event_memory", stored.id, text);
          } else {
            const stored = await this.prisma.userMemoryNote.upsert({
              where: {
                guildId_userId_key: {
                  guildId: request.guildId,
                  userId: request.userId,
                  key,
                },
              },
              update: {
                value: text,
                source: request.source ?? undefined,
                createdBy: request.createdBy ?? undefined,
                active: true,
                expiresAt: null,
              },
              create: {
                guildId: request.guildId,
                userId: request.userId,
                key,
                value: text,
                source: request.source ?? undefined,
                createdBy: request.createdBy ?? undefined,
              },
            });
            await this.updateEmbedding("user_memory", stored.id, text);
          }
          result.added += 1;
          break;
        }

        case "UPDATE": {
          const text = action.text?.trim();
          if (!text) {
            result.skipped += 1;
            continue;
          }

          const dedupeId = `${action.scope}:${action.id ?? action.key ?? text}`;
          if (updated.has(dedupeId)) {
            result.skipped += 1;
            continue;
          }

          const key = normalizeMemoryKey(action.key ?? text);
          if (action.scope === "server") {
            let storedId: string;
            if (action.id) {
              const updatedRow = await this.prisma.serverMemory.update({
                where: { id: action.id },
                data: {
                  key,
                  value: text,
                  type: action.type ?? "fact",
                  source: request.source ?? undefined,
                  createdBy: request.createdBy ?? undefined,
                  updatedAt: new Date(),
                },
              });
              storedId = updatedRow.id;
            } else {
              const stored = await this.retrieval.rememberServerFact({
                guildId: request.guildId,
                key,
                value: text,
                type: action.type ?? "fact",
                source: request.source ?? undefined,
                createdBy: request.createdBy ?? undefined,
              });
              storedId = stored.id;
            }
            await this.updateEmbedding("server_memory", storedId, text);
          } else if (action.scope === "channel") {
            let storedId: string;
            if (action.id) {
              const updatedRow = await this.prisma.channelMemoryNote.update({
                where: { id: action.id },
                data: {
                  key,
                  value: text,
                  type: action.type ?? "channel_fact",
                  source: request.source ?? undefined,
                  createdBy: request.createdBy ?? undefined,
                  active: true,
                  expiresAt: null,
                  updatedAt: new Date(),
                },
              });
              storedId = updatedRow.id;
            } else {
              const stored = await this.retrieval.rememberChannelFact({
                guildId: request.guildId,
                channelId: request.channelId,
                key,
                value: text,
                type: action.type ?? "channel_fact",
                source: request.source ?? undefined,
                createdBy: request.createdBy ?? undefined,
              });
              storedId = stored.id;
            }
            await this.updateEmbedding("channel_memory", storedId, text);
          } else if (action.scope === "event") {
            let storedId: string;
            const eventKey = normalizeMemoryKey(action.eventKey ?? action.key ?? text);
            if (action.id) {
              const updatedRow = await this.prisma.eventMemory.update({
                where: { id: action.id },
                data: {
                  channelId: request.channelId,
                  eventKey,
                  key,
                  value: text,
                  type: action.type ?? "event",
                  source: request.source ?? undefined,
                  createdBy: request.createdBy ?? undefined,
                  active: true,
                  expiresAt: null,
                  updatedAt: new Date(),
                },
              });
              storedId = updatedRow.id;
            } else {
              const stored = await this.retrieval.rememberEventFact({
                guildId: request.guildId,
                channelId: request.channelId,
                eventKey,
                key,
                value: text,
                type: action.type ?? "event",
                source: request.source ?? undefined,
                createdBy: request.createdBy ?? undefined,
              });
              storedId = stored.id;
            }
            await this.updateEmbedding("event_memory", storedId, text);
          } else {
            let storedId: string;
            if (action.id) {
              const updatedRow = await this.prisma.userMemoryNote.update({
                where: { id: action.id },
                data: {
                  key,
                  value: text,
                  source: request.source ?? undefined,
                  createdBy: request.createdBy ?? undefined,
                  active: true,
                  expiresAt: null,
                },
              });
              storedId = updatedRow.id;
            } else {
              const upserted = await this.prisma.userMemoryNote.upsert({
                where: {
                  guildId_userId_key: {
                    guildId: request.guildId,
                    userId: request.userId,
                    key,
                  },
                },
                update: {
                  value: text,
                  source: request.source ?? undefined,
                  createdBy: request.createdBy ?? undefined,
                  active: true,
                  expiresAt: null,
                },
                create: {
                  guildId: request.guildId,
                  userId: request.userId,
                  key,
                  value: text,
                  source: request.source ?? undefined,
                  createdBy: request.createdBy ?? undefined,
                },
              });
              storedId = upserted.id;
            }
            await this.updateEmbedding("user_memory", storedId, text);
          }

          updated.add(dedupeId);
          result.updated += 1;
          break;
        }

        case "DELETE": {
          const dedupeId = `${action.scope}:${action.id ?? action.key ?? ""}`;
          if (deleted.has(dedupeId)) {
            result.skipped += 1;
            continue;
          }

          if (action.scope === "server") {
            if (action.id) {
              await this.prisma.serverMemory.deleteMany({
                where: { id: action.id, guildId: request.guildId },
              });
            } else if (action.key) {
              await this.prisma.serverMemory.deleteMany({
                where: { guildId: request.guildId, key: action.key },
              });
            } else {
              result.skipped += 1;
              continue;
            }
          } else if (action.scope === "channel") {
            if (action.id) {
              await this.prisma.channelMemoryNote.updateMany({
                where: { id: action.id, guildId: request.guildId, channelId: request.channelId },
                data: { active: false },
              });
            } else if (action.key) {
              await this.prisma.channelMemoryNote.updateMany({
                where: { guildId: request.guildId, channelId: request.channelId, key: action.key },
                data: { active: false },
              });
            } else {
              result.skipped += 1;
              continue;
            }
          } else if (action.scope === "event") {
            if (action.id) {
              await this.prisma.eventMemory.updateMany({
                where: { id: action.id, guildId: request.guildId },
                data: { active: false },
              });
            } else if (action.key) {
              await this.prisma.eventMemory.updateMany({
                where: { guildId: request.guildId, key: action.key },
                data: { active: false },
              });
            } else {
              result.skipped += 1;
              continue;
            }
          } else if (action.id) {
            await this.prisma.userMemoryNote.updateMany({
              where: { id: action.id, guildId: request.guildId, userId: request.userId },
              data: { active: false },
            });
          } else if (action.key) {
            await this.prisma.userMemoryNote.updateMany({
              where: {
                guildId: request.guildId,
                userId: request.userId,
                key: action.key,
              },
              data: { active: false },
            });
          } else {
            result.skipped += 1;
            continue;
          }

          deleted.add(dedupeId);
          result.deleted += 1;
          break;
        }

        case "NOOP":
        default:
          result.skipped += 1;
      }
    }
  }

  private async updateEmbedding(entityType: "server_memory" | "user_memory" | "channel_memory" | "event_memory", entityId: string, text: string) {
    try {
      const [embedding] = await this.llm.embed(this.env.OLLAMA_EMBED_MODEL, text);
      if (!embedding?.length) {
        return;
      }

      await this.retrieval.setEmbedding(entityType, entityId, toVectorLiteral(embedding));
    } catch {
      return;
    }
  }
}

function pushServerCandidates(
  target: FormationCandidateMemory[],
  seen: Set<string>,
  source: Array<{ id: string; key: string; value: string; type: string; createdAt?: Date }>,
) {
  for (const item of source) {
    const seenKey = `server:${item.id}`;
    if (seen.has(seenKey)) {
      continue;
    }
    seen.add(seenKey);
    target.push({
      id: item.id,
      scope: "server",
      key: item.key,
      text: item.value,
      type: item.type,
      createdAt: item.createdAt?.toISOString(),
    });
    if (target.length >= maxCandidatesPerDecision) {
      return;
    }
  }
}

function pushUserCandidates(
  target: FormationCandidateMemory[],
  seen: Set<string>,
  source: Array<{ id: string; key: string; value: string; createdAt?: Date }>,
) {
  for (const item of source) {
    const seenKey = `user:${item.id}`;
    if (seen.has(seenKey)) {
      continue;
    }
    seen.add(seenKey);
    target.push({
      id: item.id,
      scope: "user",
      key: item.key,
      text: item.value,
      createdAt: item.createdAt?.toISOString(),
    });
    if (target.length >= maxCandidatesPerDecision) {
      return;
    }
  }
}

function pushChannelCandidates(
  target: FormationCandidateMemory[],
  seen: Set<string>,
  source: Array<{ id: string; key: string; value: string; type: string; createdAt?: Date }>,
) {
  for (const item of source) {
    const seenKey = `channel:${item.id}`;
    if (seen.has(seenKey)) {
      continue;
    }
    seen.add(seenKey);
    target.push({
      id: item.id,
      scope: "channel",
      key: item.key,
      text: item.value,
      type: item.type,
      createdAt: item.createdAt?.toISOString(),
    });
    if (target.length >= maxCandidatesPerDecision) {
      return;
    }
  }
}

function pushEventCandidates(
  target: FormationCandidateMemory[],
  seen: Set<string>,
  source: Array<{ id: string; key: string; value: string; type: string; eventKey?: string; createdAt?: Date }>,
) {
  for (const item of source) {
    const seenKey = `event:${item.id}`;
    if (seen.has(seenKey)) {
      continue;
    }
    seen.add(seenKey);
    target.push({
      id: item.id,
      scope: "event",
      key: item.eventKey ? `${item.eventKey}:${item.key}` : item.key,
      text: item.value,
      type: item.type,
      createdAt: item.createdAt?.toISOString(),
    });
    if (target.length >= maxCandidatesPerDecision) {
      return;
    }
  }
}

function parseJsonResponse<T>(content: string): T | null {
  const trimmed = content.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end <= start) {
      return null;
    }
    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as T;
    } catch {
      return null;
    }
  }
}

function normalizeFacts(payload: { facts?: unknown } | null, limit: number): string[] {
  if (!payload || !Array.isArray(payload.facts)) {
    return [];
  }

  return [...new Set(payload.facts
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean))]
    .slice(0, limit);
}

function normalizeActions(payload: { actions?: unknown } | null): FormationAction[] {
  if (!payload || !Array.isArray(payload.actions)) {
    return [];
  }

  const normalized: FormationAction[] = [];
  for (const raw of payload.actions) {
    if (!raw || typeof raw !== "object") {
      continue;
    }

    const action = raw as Record<string, unknown>;
    const event = normalizeEvent(action.event);
    const scope = normalizeScope(action.scope, action.text);
    normalized.push({
      event,
      scope,
      id: typeof action.id === "string" ? action.id.trim() || undefined : undefined,
      key: typeof action.key === "string" ? action.key.trim() || undefined : undefined,
      eventKey: typeof action.eventKey === "string" ? action.eventKey.trim() || undefined : undefined,
      text: typeof action.text === "string" ? action.text.trim() || undefined : undefined,
      type: typeof action.type === "string" ? action.type.trim() || undefined : undefined,
      reason: typeof action.reason === "string" ? action.reason.trim() || undefined : undefined,
    });
  }

  return normalized;
}

function normalizeEvent(value: unknown): FormationActionEvent {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (normalized === "ADD" || normalized === "UPDATE" || normalized === "DELETE") {
    return normalized;
  }
  return "NOOP";
}

function normalizeScope(value: unknown, fallbackText: unknown): MemoryScope {
  if (value === "server" || value === "user" || value === "channel" || value === "event") {
    return value;
  }

  if (typeof fallbackText === "string" && /(ивент|событи|план|дедлайн|встреч|конфликт)/i.test(fallbackText)) {
    return "event";
  }

  if (typeof fallbackText === "string" && /(канал|тред|чат|локальн)/i.test(fallbackText)) {
    return "channel";
  }

  if (typeof fallbackText === "string" && /(сервер|общий|мем сервера|гильди)/i.test(fallbackText)) {
    return "server";
  }

  return "user";
}

function normalizeMemoryKey(value: string): string {
  const key = value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

  return key || "memory-note";
}

function fallbackCompaction(messages: readonly FormationMessage[]): string {
  return messages
    .map((message) => `${message.role}: ${message.content.trim()}`)
    .filter((line) => !line.endsWith(": "))
    .join("\n")
    .slice(0, 2000);
}
