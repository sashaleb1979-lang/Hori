import type { AppPrismaClient, AppRedisClient, ContextMessage } from "@hori/shared";

const SESSION_INACTIVITY_MS = 10 * 60 * 1000; // 10 min gap = session boundary
const SESSION_DEFAULT_TTL_SEC = 3 * 60 * 60;  // 3h = 10800 sec (rolling TTL)
const SESSION_MAX_MESSAGES = 40;               // max messages returned per session

function sessionSinceKey(guildId: string, userId: string, channelId: string): string {
  return `session:since:${guildId}:${userId}:${channelId}`;
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
    ttlSec = SESSION_DEFAULT_TTL_SEC
  ): Promise<ContextMessage[]> {
    const key = sessionSinceKey(guildId, userId, channelId);
    let since: Date;

    const cached = this.redis ? await this.redis.get(key).catch(() => null) : null;

    if (cached) {
      since = new Date(cached);
      // Extend rolling TTL on every access
      await this.redis!.expire(key, ttlSec).catch(() => null);
    } else {
      since = await this.findSessionStart(guildId, userId, channelId, ttlSec * 1000);
      if (this.redis) {
        await this.redis.set(key, since.toISOString(), "EX", ttlSec).catch(() => null);
      }
    }

    const rows = await this.prisma.message.findMany({
      where: {
        guildId,
        channelId,
        createdAt: { gte: since },
        OR: [{ userId }, { user: { isBot: true } }]
      },
      orderBy: { createdAt: "asc" },
      take: SESSION_MAX_MESSAGES,
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

  /**
   * Forcibly clears the cached session start (e.g. after session-evaluator runs).
   * Next call to getSessionMessages will recompute the session start from DB.
   */
  async clearSession(guildId: string, userId: string, channelId: string): Promise<void> {
    if (!this.redis) return;
    await this.redis.del(sessionSinceKey(guildId, userId, channelId)).catch(() => null);
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
      take: 100,
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
