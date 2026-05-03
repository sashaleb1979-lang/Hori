import { OpenAIClient } from "@hori/llm";
import { buildCompactionMessages } from "@hori/memory";
import { asErrorMessage, type MessageEnvelope, type LlmChatMessage } from "@hori/shared";

import type { BotRuntime } from "../bootstrap";

const RECAP_MODEL = "gpt-5-nano";
const RECAP_REPEAT_WINDOW_MS = 60 * 60 * 1000;
const RECAP_WINDOW_MS = {
  day: 24 * 60 * 60 * 1000,
  recent: 2 * 60 * 60 * 1000
} as const;
const RECAP_MAX_UPDATE_AGE_MS = {
  day: 36 * 60 * 60 * 1000,
  recent: 6 * 60 * 60 * 1000
} as const;
const RECAP_MIN_NEW_MESSAGES = {
  day: 18,
  recent: 8
} as const;
const RECAP_RAW_FETCH_LIMIT = {
  day: 1200,
  recent: 320
} as const;
const RECAP_RAW_DIRECT_LIMIT = {
  day: 110,
  recent: 70
} as const;
const RECAP_RAW_CHUNK_SIZE = {
  day: 120,
  recent: 80
} as const;

const DAY_RECAP_PATTERNS = [
  /^(?:перескажи|дай\s+пересказ|сделай\s+пересказ|сводка)\s+(?:что\s+было\s+)?(?:в\s+чате\s+)?за\s+день(?:$|[\s?!.,:;])/iu,
  /^(?:что\s+было|итоги)\s+за\s+день(?:$|[\s?!.,:;])/iu
];
const RECENT_RECAP_PATTERNS = [
  /^(?:перескажи|дай\s+пересказ|сделай\s+пересказ|сводка)\s+(?:последнюю\s+активность|что\s+было\s+(?:недавно|за\s+последние\s+часы))(?:$|[\s?!.,:;])/iu,
  /^(?:последняя\s+активность|что\s+было\s+недавно)(?:$|[\s?!.,:;])/iu
];
const UPDATE_RECAP_PATTERN = /^обнови(?:\s+(?:пересказ|сводку))?(?:\s+(за\s+день|дневной|последнюю\s+активность|активность|активности|последнее))?(?:$|[\s?!.,:;])/iu;
const RECAP_EVENT_TYPES = ["chat_recap_day", "chat_recap_recent"] as const;

type ChatRecapMode = "day" | "recent";
type ChatRecapAction = "fresh" | "update";

interface ChatRecapCommand {
  action: ChatRecapAction;
  mode?: ChatRecapMode;
}

interface ChatRecapEventTrace {
  mode: ChatRecapMode;
  action: ChatRecapAction;
  windowStart: string;
  coveredUntil: string;
  coveredUntilMessageId: string | null;
  sourceSummaryCount: number;
  rawMessageCount: number;
  previousRecapMessageId?: string | null;
}

interface ChatRecapLogEvent {
  eventType: string;
  modelUsed: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  debugTrace: ChatRecapEventTrace;
}

export interface ChatRecapResult {
  reply: string;
  logEvent?: ChatRecapLogEvent;
}

interface StoredRecapEvent {
  eventType: string;
  createdAt: Date;
  messageId: string | null;
  trace: ChatRecapEventTrace;
}

interface SummaryRow {
  rangeStart: Date;
  rangeEnd: Date;
  summaryLong: string;
}

interface RawMessageRow {
  id: string;
  userId: string;
  content: string;
  createdAt: Date;
  user: {
    username: string | null;
    globalName: string | null;
    isBot: boolean;
  };
}

interface FreshRecapSource {
  summaryRows: SummaryRow[];
  rawMessages: RawMessageRow[];
  coveredUntil: Date | null;
  coveredUntilMessageId: string | null;
}

interface SourceBlocksResult {
  blocks: string[];
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export function parseChatRecapCommand(content: string): ChatRecapCommand | null {
  const trimmed = content.trim();
  if (!trimmed) {
    return null;
  }

  const updateMatch = UPDATE_RECAP_PATTERN.exec(trimmed);
  if (updateMatch) {
    const modeHint = updateMatch[1]?.toLowerCase() ?? "";
    if (modeHint.includes("день")) {
      return { action: "update", mode: "day" };
    }

    if (modeHint.includes("актив") || modeHint.includes("послед")) {
      return { action: "update", mode: "recent" };
    }

    return { action: "update" };
  }

  if (DAY_RECAP_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return { action: "fresh", mode: "day" };
  }

  if (RECENT_RECAP_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return { action: "fresh", mode: "recent" };
  }

  return null;
}

export function isChatRecapCodeword(content: string) {
  return parseChatRecapCommand(content) !== null;
}

export function buildDiscordMessageLink(guildId: string, channelId: string, messageId: string) {
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

export async function handleChatRecapCommand(
  runtime: BotRuntime,
  envelope: MessageEnvelope,
  cleanedContent: string,
): Promise<ChatRecapResult | null> {
  const command = parseChatRecapCommand(cleanedContent);
  if (!command) {
    return null;
  }

  if (command.action === "update") {
    return handleRecapUpdate(runtime, envelope, command.mode);
  }

  return handleFreshRecap(runtime, envelope, command.mode!);
}

function createFlexClient(runtime: BotRuntime) {
  if (!runtime.env.OPENAI_API_KEY) {
    return null;
  }

  return new OpenAIClient({
    ...runtime.env,
    OLLAMA_TIMEOUT_MS: Math.max(runtime.env.OLLAMA_TIMEOUT_MS ?? 60_000, 15 * 60 * 1000)
  }, runtime.logger);
}

async function handleFreshRecap(runtime: BotRuntime, envelope: MessageEnvelope, mode: ChatRecapMode): Promise<ChatRecapResult> {
  const latestRecap = await findLatestRecapEvent(runtime, envelope.guildId, envelope.channelId, mode);
  if (latestRecap && Date.now() - latestRecap.createdAt.getTime() < RECAP_REPEAT_WINDOW_MS) {
    const newMessages = await countRelevantMessagesSince(runtime, envelope, latestRecap.trace.coveredUntil, [latestRecap.messageId]);
    return { reply: buildRepeatRecapReply(envelope, latestRecap, mode, newMessages) };
  }

  const flexClient = createFlexClient(runtime);
  if (!flexClient) {
    return { reply: "Не могу пересказать чат сейчас: OpenAI summary path не настроен." };
  }

  const windowStart = new Date(Date.now() - RECAP_WINDOW_MS[mode]);
  const source = await collectFreshRecapSource(runtime, envelope, mode, windowStart);
  const blocksResult = await buildSourceBlocks(flexClient, mode, source.rawMessages, source.summaryRows);
  if (!blocksResult.blocks.length) {
    return { reply: buildQuietChannelReply(mode) };
  }

  try {
    const finalResponse = await flexClient.chat({
      model: RECAP_MODEL,
      serviceTier: "flex",
      messages: buildFreshRecapMessages(mode, windowStart, blocksResult.blocks),
      temperature: 0,
      maxTokens: mode === "day" ? 280 : 180
    });
    const reply = finalResponse.message.content.trim();
    if (!reply) {
      return { reply: "Не смогла собрать внятный пересказ. Попробуй ещё раз чуть позже." };
    }

    const promptTokens = (blocksResult.promptTokens ?? 0) + (finalResponse.usage?.promptTokens ?? 0);
    const completionTokens = (blocksResult.completionTokens ?? 0) + (finalResponse.usage?.completionTokens ?? 0);
    const totalTokens = (blocksResult.totalTokens ?? 0) + (finalResponse.usage?.totalTokens ?? 0);
    const coveredUntil = source.coveredUntil ?? envelope.createdAt;

    return {
      reply,
      logEvent: {
        eventType: eventTypeForMode(mode),
        modelUsed: `openai:${RECAP_MODEL}:flex`,
        promptTokens: promptTokens || undefined,
        completionTokens: completionTokens || undefined,
        totalTokens: totalTokens || undefined,
        debugTrace: {
          mode,
          action: "fresh",
          windowStart: windowStart.toISOString(),
          coveredUntil: coveredUntil.toISOString(),
          coveredUntilMessageId: source.coveredUntilMessageId,
          sourceSummaryCount: blocksResult.blocks.length,
          rawMessageCount: source.rawMessages.length
        }
      }
    };
  } catch (error) {
    runtime.logger.warn(
      { guildId: envelope.guildId, channelId: envelope.channelId, error: asErrorMessage(error) },
      "chat recap failed"
    );
    return { reply: "Сейчас не смогла собрать пересказ через дешёвый GPT-маршрут. Повтори чуть позже." };
  }
}

async function handleRecapUpdate(
  runtime: BotRuntime,
  envelope: MessageEnvelope,
  requestedMode?: ChatRecapMode,
): Promise<ChatRecapResult> {
  const latestRecap = await findLatestRecapEvent(runtime, envelope.guildId, envelope.channelId, requestedMode);
  if (!latestRecap) {
    return {
      reply: requestedMode === "day"
        ? "Сначала попроси пересказ за день, потом уже можно обновлять хвост."
        : requestedMode === "recent"
          ? "Сначала попроси пересказ последней активности, потом уже можно обновлять хвост."
          : "Пока нечего обновлять. Сначала попроси пересказ за день или последней активности."
    };
  }

  const mode = latestRecap.trace.mode;
  if (Date.now() - latestRecap.createdAt.getTime() > RECAP_MAX_UPDATE_AGE_MS[mode]) {
    return {
      reply: `Предыдущий пересказ ${modeLabel(mode)} уже устарел. Попроси новый: ${freshCommand(mode)}.`
    };
  }

  const flexClient = createFlexClient(runtime);
  if (!flexClient) {
    return { reply: "Не могу обновить пересказ сейчас: OpenAI summary path не настроен." };
  }

  const deltaMessages = await collectUpdateMessages(runtime, envelope, latestRecap);
  if (deltaMessages.length < RECAP_MIN_NEW_MESSAGES[mode]) {
    return {
      reply: buildSmallDeltaReply(envelope, latestRecap, mode, deltaMessages.length)
    };
  }

  try {
    const blocksResult = await buildSourceBlocks(flexClient, mode, deltaMessages, []);
    if (!blocksResult.blocks.length) {
      return { reply: buildSmallDeltaReply(envelope, latestRecap, mode, 0) };
    }

    const updateResponse = await flexClient.chat({
      model: RECAP_MODEL,
      serviceTier: "flex",
      messages: buildUpdateRecapMessages(mode, latestRecap, blocksResult.blocks),
      temperature: 0,
      maxTokens: 160
    });
    const updateText = updateResponse.message.content.trim();
    if (!updateText) {
      return { reply: buildSmallDeltaReply(envelope, latestRecap, mode, deltaMessages.length) };
    }

    const previousLink = latestRecap.messageId
      ? buildDiscordMessageLink(envelope.guildId, envelope.channelId, latestRecap.messageId)
      : null;
    const promptTokens = (blocksResult.promptTokens ?? 0) + (updateResponse.usage?.promptTokens ?? 0);
    const completionTokens = (blocksResult.completionTokens ?? 0) + (updateResponse.usage?.completionTokens ?? 0);
    const totalTokens = (blocksResult.totalTokens ?? 0) + (updateResponse.usage?.totalTokens ?? 0);
    const coveredUntil = deltaMessages.at(-1)?.createdAt ?? latestRecap.createdAt;
    const coveredUntilMessageId = deltaMessages.at(-1)?.id ?? null;

    return {
      reply: [
        `Апдейт к ${updateHeaderLabel(mode)}:`,
        updateText,
        previousLink ? `Предыдущий пересказ: ${previousLink}` : null
      ].filter(Boolean).join("\n\n"),
      logEvent: {
        eventType: eventTypeForMode(mode),
        modelUsed: `openai:${RECAP_MODEL}:flex`,
        promptTokens: promptTokens || undefined,
        completionTokens: completionTokens || undefined,
        totalTokens: totalTokens || undefined,
        debugTrace: {
          mode,
          action: "update",
          windowStart: latestRecap.trace.windowStart,
          coveredUntil: coveredUntil.toISOString(),
          coveredUntilMessageId,
          sourceSummaryCount: blocksResult.blocks.length,
          rawMessageCount: deltaMessages.length,
          previousRecapMessageId: latestRecap.messageId
        }
      }
    };
  } catch (error) {
    runtime.logger.warn(
      { guildId: envelope.guildId, channelId: envelope.channelId, error: asErrorMessage(error) },
      "chat recap update failed"
    );
    return { reply: "Сейчас не смогла обновить пересказ через дешёвый GPT-маршрут. Попробуй ещё раз чуть позже." };
  }
}

async function findLatestRecapEvent(
  runtime: BotRuntime,
  guildId: string,
  channelId: string,
  mode?: ChatRecapMode,
): Promise<StoredRecapEvent | null> {
  const event = await runtime.prisma.botEventLog.findFirst({
    where: {
      guildId,
      channelId,
      eventType: mode ? eventTypeForMode(mode) : { in: [...RECAP_EVENT_TYPES] }
    },
    orderBy: { createdAt: "desc" },
    select: {
      eventType: true,
      createdAt: true,
      messageId: true,
      debugTrace: true
    }
  });

  if (!event) {
    return null;
  }

  const trace = parseStoredRecapTrace(event.debugTrace, event.eventType);
  if (!trace) {
    return null;
  }

  return {
    eventType: event.eventType,
    createdAt: event.createdAt,
    messageId: event.messageId,
    trace
  };
}

function parseStoredRecapTrace(value: unknown, eventType: string): ChatRecapEventTrace | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const trace = value as Partial<ChatRecapEventTrace>;
  const mode = trace.mode ?? modeFromEventType(eventType);
  if (!mode || typeof trace.coveredUntil !== "string" || typeof trace.windowStart !== "string") {
    return null;
  }

  return {
    mode,
    action: trace.action === "update" ? "update" : "fresh",
    windowStart: trace.windowStart,
    coveredUntil: trace.coveredUntil,
    coveredUntilMessageId: typeof trace.coveredUntilMessageId === "string" ? trace.coveredUntilMessageId : null,
    sourceSummaryCount: Number.isFinite(trace.sourceSummaryCount) ? Number(trace.sourceSummaryCount) : 0,
    rawMessageCount: Number.isFinite(trace.rawMessageCount) ? Number(trace.rawMessageCount) : 0,
    previousRecapMessageId: typeof trace.previousRecapMessageId === "string" ? trace.previousRecapMessageId : null
  };
}

async function countRelevantMessagesSince(
  runtime: BotRuntime,
  envelope: MessageEnvelope,
  coveredUntilIso: string,
  extraExcludedIds: Array<string | null | undefined>,
) {
  const coveredUntil = new Date(coveredUntilIso);
  const excludedIds = [envelope.messageId, ...extraExcludedIds].filter((value): value is string => Boolean(value));

  const messages = await runtime.prisma.message.findMany({
    where: {
      guildId: envelope.guildId,
      channelId: envelope.channelId,
      createdAt: { gt: coveredUntil },
      ...(excludedIds.length ? { id: { notIn: excludedIds } } : {})
    },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: {
      id: true,
      userId: true,
      content: true,
      createdAt: true,
      user: {
        select: {
          username: true,
          globalName: true,
          isBot: true
        }
      }
    }
  });

  return messages.filter((message) => !isLikelyRecapCommandMessage(message.content)).length;
}

async function collectFreshRecapSource(
  runtime: BotRuntime,
  envelope: MessageEnvelope,
  mode: ChatRecapMode,
  windowStart: Date,
): Promise<FreshRecapSource> {
  const [summaryRows, recapEventIds] = await Promise.all([
    runtime.prisma.channelSummary.findMany({
      where: {
        guildId: envelope.guildId,
        channelId: envelope.channelId,
        rangeEnd: { gte: windowStart }
      },
      orderBy: { rangeEnd: "asc" },
      take: mode === "day" ? 24 : 8,
      select: {
        rangeStart: true,
        rangeEnd: true,
        summaryLong: true
      }
    }),
    listRecapMessageIds(runtime, envelope.guildId, envelope.channelId, windowStart)
  ]);

  const latestSummaryEnd = summaryRows.at(-1)?.rangeEnd ?? null;
  const rawMessages = await runtime.prisma.message.findMany({
    where: {
      guildId: envelope.guildId,
      channelId: envelope.channelId,
      createdAt: latestSummaryEnd ? { gt: latestSummaryEnd } : { gte: windowStart }
    },
    orderBy: { createdAt: summaryRows.length ? "asc" : "desc" },
    take: summaryRows.length ? Math.min(RECAP_RAW_DIRECT_LIMIT[mode] * 2, RECAP_RAW_FETCH_LIMIT[mode]) : RECAP_RAW_FETCH_LIMIT[mode],
    select: {
      id: true,
      userId: true,
      content: true,
      createdAt: true,
      user: {
        select: {
          username: true,
          globalName: true,
          isBot: true
        }
      }
    }
  });

  const orderedMessages = summaryRows.length ? rawMessages : [...rawMessages].reverse();
  const filteredMessages = orderedMessages.filter((message) => {
    if (message.id === envelope.messageId) {
      return false;
    }

    if (recapEventIds.has(message.id)) {
      return false;
    }

    return !isLikelyRecapCommandMessage(message.content);
  });

  return {
    summaryRows,
    rawMessages: filteredMessages,
    coveredUntil: filteredMessages.at(-1)?.createdAt ?? latestSummaryEnd,
    coveredUntilMessageId: filteredMessages.at(-1)?.id ?? null
  };
}

async function collectUpdateMessages(runtime: BotRuntime, envelope: MessageEnvelope, latestRecap: StoredRecapEvent) {
  const coveredUntil = new Date(latestRecap.trace.coveredUntil);
  const recapEventIds = await listRecapMessageIds(runtime, envelope.guildId, envelope.channelId, coveredUntil);
  const rawMessages = await runtime.prisma.message.findMany({
    where: {
      guildId: envelope.guildId,
      channelId: envelope.channelId,
      createdAt: { gt: coveredUntil }
    },
    orderBy: { createdAt: "asc" },
    take: RECAP_RAW_FETCH_LIMIT[latestRecap.trace.mode],
    select: {
      id: true,
      userId: true,
      content: true,
      createdAt: true,
      user: {
        select: {
          username: true,
          globalName: true,
          isBot: true
        }
      }
    }
  });

  return rawMessages.filter((message) => {
    if (message.id === envelope.messageId || message.id === latestRecap.messageId) {
      return false;
    }

    if (recapEventIds.has(message.id)) {
      return false;
    }

    return !isLikelyRecapCommandMessage(message.content);
  });
}

async function listRecapMessageIds(runtime: BotRuntime, guildId: string, channelId: string, since: Date) {
  const events = await runtime.prisma.botEventLog.findMany({
    where: {
      guildId,
      channelId,
      eventType: { in: [...RECAP_EVENT_TYPES] },
      createdAt: { gte: since }
    },
    select: {
      messageId: true
    }
  });

  return new Set(events.map((event) => event.messageId).filter((value): value is string => Boolean(value)));
}

async function buildSourceBlocks(
  flexClient: OpenAIClient,
  mode: ChatRecapMode,
  rawMessages: RawMessageRow[],
  summaryRows: SummaryRow[],
): Promise<SourceBlocksResult> {
  const blocks = summaryRows.map((row) => formatSummaryRow(row));

  if (!rawMessages.length) {
    return { blocks, promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  }

  if (rawMessages.length <= RECAP_RAW_DIRECT_LIMIT[mode]) {
    return {
      blocks: [...blocks, formatRawMessagesBlock(rawMessages)],
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0
    };
  }

  const chunkSummaries: string[] = [];
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;

  for (const chunk of chunkArray(rawMessages, RECAP_RAW_CHUNK_SIZE[mode])) {
    const response = await flexClient.chat({
      model: RECAP_MODEL,
      serviceTier: "flex",
      messages: buildCompactionMessages(
        [],
        chunk.map((message) => ({
          role: message.user.isBot ? "assistant" : "user",
          content: `${formatAuthorName(message)}: ${normalizeMessageContent(message.content)}`
        }))
      ),
      temperature: 0,
      maxTokens: 180
    });
    const summary = response.message.content.trim();
    if (summary) {
      chunkSummaries.push(summary);
    }
    promptTokens += response.usage?.promptTokens ?? 0;
    completionTokens += response.usage?.completionTokens ?? 0;
    totalTokens += response.usage?.totalTokens ?? 0;
  }

  return {
    blocks: [...blocks, ...chunkSummaries.map((summary, index) => `Сжатый блок ${index + 1}:\n${summary}`)],
    promptTokens,
    completionTokens,
    totalTokens
  };
}

function buildFreshRecapMessages(mode: ChatRecapMode, windowStart: Date, blocks: string[]): LlmChatMessage[] {
  return [
    {
      role: "system",
      content: mode === "day"
        ? [
          "Ты делаешь пользовательский пересказ чата за день.",
          "Опирайся на готовые summaries и свежие сообщения.",
          "Выдели главные темы, договорённости, сдвиги и незакрытые вопросы.",
          "Шутки или конфликты упоминай только если они реально влияли на разговор.",
          "Не перечисляй каждую реплику и не выдумывай детали.",
          "Формат: короткий абзац 'Что было', затем строка 'Главное:' и 3-6 пунктов через '- '.",
          "Пиши по-русски, без приветствия."
        ].join(" ")
        : [
          "Ты делаешь пересказ последней активности чата за последние пару часов.",
          "Собери плотную и короткую сводку по summaries и свежему хвосту сообщений.",
          "Выдели только то, что реально двигало разговор.",
          "Формат: один короткий абзац, затем до 4 пунктов через '- ' только если они добавляют смысл.",
          "Пиши по-русски, без приветствия."
        ].join(" ")
    },
    {
      role: "user",
      content: [
        `Окно пересказа начинается с ${windowStart.toISOString()}.`,
        "Источники:",
        blocks.join("\n\n---\n\n")
      ].join("\n\n")
    }
  ];
}

function buildUpdateRecapMessages(mode: ChatRecapMode, latestRecap: StoredRecapEvent, blocks: string[]): LlmChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "Ты обновляешь уже существующий пересказ чата.",
        `Режим: ${mode === "day" ? "за день" : "последняя активность"}.`,
        "Суммируй только новое после прошлого пересказа.",
        "Не повторяй старое и не переписывай уже сделанную сводку.",
        "Формат: одна короткая вводная строка и до 3 пунктов через '- ' при необходимости.",
        "Пиши по-русски, без приветствия."
      ].join(" ")
    },
    {
      role: "user",
      content: [
        `Прошлый пересказ был собран до ${latestRecap.trace.coveredUntil}.`,
        "Ниже только новый хвост сообщений:",
        blocks.join("\n\n---\n\n")
      ].join("\n\n")
    }
  ];
}

function buildRepeatRecapReply(
  envelope: MessageEnvelope,
  latestRecap: StoredRecapEvent,
  mode: ChatRecapMode,
  newMessages: number,
) {
  const link = latestRecap.messageId
    ? buildDiscordMessageLink(envelope.guildId, envelope.channelId, latestRecap.messageId)
    : null;
  const opener = link
    ? `Недавно уже пересказывала ${modeLabel(mode)}: ${link}`
    : `Недавно уже пересказывала ${modeLabel(mode)}.`;

  if (newMessages < RECAP_MIN_NEW_MESSAGES[mode]) {
    return `${opener}\nС тех пор новых сообщений мало (${newMessages}). Если всё же надо добить хвост, скажи: ${updateCommand(mode)}.`;
  }

  return `${opener}\nС тех пор накопилось ${newMessages} новых сообщений. Если нужно, скажи: ${updateCommand(mode)} — добавлю только свежий хвост.`;
}

function buildSmallDeltaReply(
  envelope: MessageEnvelope,
  latestRecap: StoredRecapEvent,
  mode: ChatRecapMode,
  newMessages: number,
) {
  const link = latestRecap.messageId
    ? buildDiscordMessageLink(envelope.guildId, envelope.channelId, latestRecap.messageId)
    : null;

  return [
    link
      ? `Недавно уже пересказывала ${modeLabel(mode)}: ${link}`
      : `Недавно уже пересказывала ${modeLabel(mode)}.`,
    `С тех пор нового мало (${newMessages}), отдельный апдейт сейчас не нужен.`
  ].join("\n");
}

function buildQuietChannelReply(mode: ChatRecapMode) {
  return mode === "day"
    ? "За последние сутки тут почти ничего внятного не накопилось."
    : "За последние пару часов тут почти ничего заметного не происходило.";
}

function formatSummaryRow(row: SummaryRow) {
  return `[${formatClock(row.rangeStart)}-${formatClock(row.rangeEnd)}] ${clampText(row.summaryLong, 800)}`;
}

function formatRawMessagesBlock(messages: RawMessageRow[]) {
  return [
    "Свежие сообщения:",
    ...messages
      .map((message) => formatRawMessageLine(message))
      .filter(Boolean)
  ].join("\n");
}

function formatRawMessageLine(message: RawMessageRow) {
  const normalized = normalizeMessageContent(message.content);
  if (!normalized) {
    return "";
  }

  return `[${formatClock(message.createdAt)}] ${formatAuthorName(message)}: ${clampText(normalized, 320)}`;
}

function formatAuthorName(message: RawMessageRow) {
  return message.user.globalName?.trim() || message.user.username?.trim() || message.userId;
}

function normalizeMessageContent(content: string) {
  return content.replace(/\s+/g, " ").trim();
}

function clampText(text: string, maxLength: number) {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function formatClock(date: Date) {
  return date.toISOString().slice(11, 16);
}

function eventTypeForMode(mode: ChatRecapMode) {
  return mode === "day" ? "chat_recap_day" : "chat_recap_recent";
}

function modeFromEventType(eventType: string): ChatRecapMode | null {
  if (eventType === "chat_recap_day") {
    return "day";
  }

  if (eventType === "chat_recap_recent") {
    return "recent";
  }

  return null;
}

function modeLabel(mode: ChatRecapMode) {
  return mode === "day" ? "за день" : "последнюю активность";
}

function freshCommand(mode: ChatRecapMode) {
  return mode === "day" ? '"перескажи за день"' : '"перескажи последнюю активность"';
}

function updateCommand(mode: ChatRecapMode) {
  return mode === "day" ? '"обнови пересказ за день"' : '"обнови пересказ активности"';
}

function updateHeaderLabel(mode: ChatRecapMode) {
  return mode === "day" ? "пересказу за день" : "сводке по последней активности";
}

function chunkArray<T>(items: readonly T[], chunkSize: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

function isLikelyRecapCommandMessage(content: string) {
  return parseChatRecapCommand(content) !== null;
}