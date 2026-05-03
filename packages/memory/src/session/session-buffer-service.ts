import type { AppPrismaClient, AppRedisClient, ContextMessage } from "@hori/shared";

const SESSION_INACTIVITY_MS = 10 * 60 * 1000; // 10 min gap = session boundary
const SESSION_DEFAULT_TTL_SEC = 3 * 60 * 60;  // 3h = 10800 sec (rolling TTL)
const SESSION_DEFAULT_MAX_MESSAGES = 40;
const SESSION_CHAT_MAX_MESSAGES = 500;
const SESSION_LOOKBACK_SCAN_LIMIT = 1500;

export const SESSION_COMPACTION_CHUNK_MESSAGES = 50;
export const SESSION_COMPACTION_TAIL_MESSAGES = 8;

interface SessionCompactionSegment {
  sessionSince: string;
  rangeStart: string;
  rangeEnd: string;
  rangeEndMessageId: string;
  summary: string;
  messageCount: number;
}

interface SessionCompactionState {
  sessionSince: string;
  segments: SessionCompactionSegment[];
}

export interface SessionCompactionCandidate {
  sessionSince: string;
  priorSummaries: string[];
  messages: ContextMessage[];
  rangeStart: Date;
  rangeEnd: Date;
  rangeEndMessageId: string;
}

function sessionSinceKey(guildId: string, userId: string, channelId: string): string {
  return `session:since:${guildId}:${userId}:${channelId}`;
}

function sessionCompactionKey(guildId: string, userId: string, channelId: string): string {
  return `session:compaction:${guildId}:${userId}:${channelId}`;
}

/**
 * Tracks the start timestamp of the current conversation session per user/channel.
 * Session boundary = gap of SESSION_INACTIVITY_MS (10 min) between consecutive
 * user+bot messages.  The "since" timestamp is cached in Redis with a rolling
 * TTL (default 3 h).  Falls back gracefully when Redis is unavailable.
 */
export class SessionBufferService {
  constructor(
    private readonly prisma: AppPrismaClient,
    private readonly redis?: AppRedisClient
  ) {}

  /**
   * Returns messages belonging to the current session for this user in the
   * given channel (user messages + Hori replies, ordered oldest → newest).
   * Calling this also extends the rolling Redis TTL, keeping the session alive.
   */
  async getSessionMessages(
    guildId: string,
    userId: string,
    channelId: string,
    ttlSec = SESSION_DEFAULT_TTL_SEC,
    maxMessages = SESSION_DEFAULT_MAX_MESSAGES
  ): Promise<ContextMessage[]> {
    const since = await this.resolveSessionStart(guildId, userId, channelId, ttlSec);
    return this.loadSessionMessagesFromStart(guildId, userId, channelId, since, maxMessages);
  }

  async getCompactedSessionMessages(
    guildId: string,
    userId: string,
    channelId: string,
    ttlSec = SESSION_DEFAULT_TTL_SEC,
    maxMessages = SESSION_CHAT_MAX_MESSAGES
  ): Promise<ContextMessage[]> {
    const since = await this.resolveSessionStart(guildId, userId, channelId, ttlSec);
    const [messages, state] = await Promise.all([
      this.loadRecentSessionMessages(guildId, userId, channelId, since, maxMessages),
      this.getCompactionState(guildId, userId, channelId, ttlSec)
    ]);

    if (!state || state.sessionSince !== since.toISOString() || !state.segments.length) {
      return messages;
    }

    const tail = this.sliceAfterSegments(messages, state.segments);
    const summaries = state.segments.map((segment) => ({
      id: `session-summary:${segment.rangeEndMessageId}`,
      author: "Сводка",
      userId: "session-summary",
      isBot: true,
      content: `[Сводка предыдущего сегмента]\n${segment.summary}`,
      createdAt: new Date(segment.rangeEnd),
      replyToMessageId: null
    } satisfies ContextMessage));

    return [...summaries, ...tail];
  }

  async getCompactionCandidate(
    guildId: string,
    userId: string,
    channelId: string,
    options: {
      ttlSec?: number;
      maxMessages?: number;
      chunkMessages?: number;
      tailMessages?: number;
    } = {}
  ): Promise<SessionCompactionCandidate | null> {
    const ttlSec = options.ttlSec ?? SESSION_DEFAULT_TTL_SEC;
    const maxMessages = options.maxMessages ?? SESSION_CHAT_MAX_MESSAGES;
    const chunkMessages = options.chunkMessages ?? SESSION_COMPACTION_CHUNK_MESSAGES;
    const tailMessages = options.tailMessages ?? SESSION_COMPACTION_TAIL_MESSAGES;
    const since = await this.resolveSessionStart(guildId, userId, channelId, ttlSec);
    const state = await this.getCompactionState(guildId, userId, channelId, ttlSec);
    const priorSegments = state?.sessionSince === since.toISOString() ? state.segments : [];
    const candidateSince = priorSegments.length
      ? new Date(priorSegments[priorSegments.length - 1]!.rangeEnd)
      : since;
    const messages = await this.loadSessionMessagesFromStart(
      guildId,
      userId,
      channelId,
      candidateSince,
      maxMessages
    );
    const unsummarized = this.sliceAfterSegments(messages, priorSegments);

    if (unsummarized.length <= chunkMessages + tailMessages) {
      return null;
    }

    const chunk = unsummarized.slice(0, chunkMessages);
    const rangeStart = chunk[0]?.createdAt;
    const rangeEnd = chunk[chunk.length - 1]?.createdAt;
    const rangeEndMessageId = chunk[chunk.length - 1]?.id;
    if (!rangeStart || !rangeEnd || !rangeEndMessageId) {
      return null;
    }

    return {
      sessionSince: since.toISOString(),
      priorSummaries: priorSegments.map((segment) => segment.summary),
      messages: chunk,
      rangeStart,
      rangeEnd,
      rangeEndMessageId
    };
  }

  async storeCompactionSegment(input: {
    guildId: string;
    userId: string;
    channelId: string;
    sessionSince: string;
    rangeStart: Date;
    rangeEnd: Date;
    rangeEndMessageId: string;
    summary: string;
    messageCount: number;
    ttlSec?: number;
  }): Promise<void> {
    if (!this.redis) {
      return;
    }

    const ttlSec = input.ttlSec ?? SESSION_DEFAULT_TTL_SEC;
    const key = sessionCompactionKey(input.guildId, input.userId, input.channelId);
    const current = await this.getCompactionState(input.guildId, input.userId, input.channelId, ttlSec);
    const next: SessionCompactionState = !current || current.sessionSince !== input.sessionSince
      ? { sessionSince: input.sessionSince, segments: [] }
      : current;

    if (next.segments.some((segment) => segment.rangeEndMessageId === input.rangeEndMessageId)) {
      return;
    }

    next.segments.push({
      sessionSince: input.sessionSince,
      rangeStart: input.rangeStart.toISOString(),
      rangeEnd: input.rangeEnd.toISOString(),
      rangeEndMessageId: input.rangeEndMessageId,
      summary: input.summary.trim(),
      messageCount: input.messageCount
    });
    next.segments.sort((left, right) => left.rangeEnd.localeCompare(right.rangeEnd));

    await Promise.allSettled([
      this.redis.set(key, JSON.stringify(next), "EX", ttlSec),
      this.redis.set(sessionSinceKey(input.guildId, input.userId, input.channelId), input.sessionSince, "EX", ttlSec)
    ]);
  }

  /**
   * Forcibly clears the cached session start (e.g. after session-evaluator runs).
   * Next call to getSessionMessages will recompute the session start from DB.
   */
  async clearSession(guildId: string, userId: string, channelId: string): Promise<void> {
    if (!this.redis) return;
    await this.redis.del(
      sessionSinceKey(guildId, userId, channelId),
      sessionCompactionKey(guildId, userId, channelId)
    ).catch(() => null);
  }

  private async resolveSessionStart(guildId: string, userId: string, channelId: string, ttlSec: number): Promise<Date> {
    const key = sessionSinceKey(guildId, userId, channelId);
    const cached = this.redis ? await this.redis.get(key).catch(() => null) : null;

    if (cached) {
      const since = new Date(cached);
      await this.redis?.expire(key, ttlSec).catch(() => null);
      await this.redis?.expire(sessionCompactionKey(guildId, userId, channelId), ttlSec).catch(() => null);
      return since;
    }

    const since = await this.findSessionStart(guildId, userId, channelId, ttlSec * 1000);
    await this.redis?.set(key, since.toISOString(), "EX", ttlSec).catch(() => null);
    return since;
  }

  private async loadSessionMessagesFromStart(
    guildId: string,
    userId: string,
    channelId: string,
    since: Date,
    maxMessages: number
  ): Promise<ContextMessage[]> {
    const rows = await this.prisma.message.findMany({
      where: {
        guildId,
        channelId,
        createdAt: { gte: since },
        OR: [{ userId }, { user: { isBot: true } }]
      },
      orderBy: { createdAt: "asc" },
      take: maxMessages,
      include: { user: true }
    });

    return rows.map((row) => ({
      id: row.id,
      author: row.user.globalName || row.user.username || row.userId,
      userId: row.userId,
      isBot: row.user.isBot,
      content: row.content,
      createdAt: row.createdAt,
      replyToMessageId: row.replyToMessageId
    }));
  }

  private async loadRecentSessionMessages(
    guildId: string,
    userId: string,
    channelId: string,
    since: Date,
    maxMessages: number
  ): Promise<ContextMessage[]> {
    const rows = await this.prisma.message.findMany({
      where: {
        guildId,
        channelId,
        createdAt: { gte: since },
        OR: [{ userId }, { user: { isBot: true } }]
      },
      orderBy: { createdAt: "desc" },
      take: maxMessages,
      include: { user: true }
    });

    return rows.reverse().map((row) => ({
      id: row.id,
      author: row.user.globalName || row.user.username || row.userId,
      userId: row.userId,
      isBot: row.user.isBot,
      content: row.content,
      createdAt: row.createdAt,
      replyToMessageId: row.replyToMessageId
    }));
  }

  private async getCompactionState(guildId: string, userId: string, channelId: string, ttlSec: number): Promise<SessionCompactionState | null> {
    if (!this.redis) {
      return null;
    }

    const key = sessionCompactionKey(guildId, userId, channelId);
    const raw = await this.redis.get(key).catch(() => null);
    if (!raw) {
      return null;
    }

    await this.redis.expire(key, ttlSec).catch(() => null);

    try {
      const parsed = JSON.parse(raw) as SessionCompactionState;
      if (!parsed || typeof parsed.sessionSince !== "string" || !Array.isArray(parsed.segments)) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private sliceAfterSegments(messages: ContextMessage[], segments: SessionCompactionSegment[]) {
    if (!segments.length) {
      return messages;
    }

    let startIndex = 0;
    const firstLoadedAt = messages[0]?.createdAt.getTime() ?? Number.POSITIVE_INFINITY;
    for (const segment of segments) {
      const segmentEndAt = new Date(segment.rangeEnd).getTime();
      if (segmentEndAt < firstLoadedAt) {
        continue;
      }

      const index = messages.findIndex((message) => message.id === segment.rangeEndMessageId);
      if (index >= startIndex) {
        startIndex = index + 1;
        continue;
      }

      const firstAfterRange = messages.findIndex((message) => message.createdAt.getTime() > segmentEndAt);
      if (firstAfterRange >= startIndex) {
        startIndex = firstAfterRange;
      }
    }

    return messages.slice(startIndex);
  }

  /**
   * Scans recent user+bot messages to locate the start of the current session.
   * A session starts right after the most recent inactivity gap > SESSION_INACTIVITY_MS.
   * If no such gap exists, returns the oldest message timestamp in the lookback window.
   */
  private async findSessionStart(
    guildId: string,
    userId: string,
    channelId: string,
    maxLookbackMs: number
  ): Promise<Date> {
    const lookbackSince = new Date(Date.now() - maxLookbackMs);

    const rows = await this.prisma.message.findMany({
      where: {
        guildId,
        channelId,
        createdAt: { gte: lookbackSince },
        OR: [{ userId }, { user: { isBot: true } }]
      },
      orderBy: { createdAt: "desc" },
      take: SESSION_LOOKBACK_SCAN_LIMIT,
      select: { createdAt: true }
    });

    if (!rows.length) return lookbackSince;

    // Walk newest → oldest, find first gap > SESSION_INACTIVITY_MS
    for (let i = 0; i < rows.length - 1; i++) {
      const gap = rows[i]!.createdAt.getTime() - rows[i + 1]!.createdAt.getTime();
      if (gap > SESSION_INACTIVITY_MS) {
        // Session starts at rows[i] (first message after the gap)
        return rows[i]!.createdAt;
      }
    }

    // No gap found: session spans the whole lookback window
    return rows[rows.length - 1]!.createdAt;
  }
}
