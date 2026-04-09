import { createHash } from "node:crypto";

import { asErrorMessage, type AppLogger, type AppPrismaClient, type AppRedisClient } from "@hori/shared";

type JsonLike = string | number | boolean | null | JsonLike[] | { [key: string]: JsonLike };

export class SearchCacheService {
  private redisWarningLogged = false;

  constructor(
    private readonly prisma: AppPrismaClient,
    private readonly redis: AppRedisClient | null,
    private readonly logger?: AppLogger
  ) {}

  makeCacheKey(parts: string[]) {
    return createHash("sha256").update(parts.join("::")).digest("hex");
  }

  private warnRedisFallback(error: unknown, action: string) {
    if (this.redisWarningLogged || !this.logger) {
      return;
    }

    this.redisWarningLogged = true;
    this.logger.warn(
      { action, error: asErrorMessage(error) },
      "search cache redis unavailable, falling back to database-only mode"
    );
  }

  private async tryRedisGet(key: string) {
    if (!this.redis) {
      return null;
    }

    try {
      return await this.redis.get(key);
    } catch (error) {
      this.warnRedisFallback(error, "get");
      return null;
    }
  }

  private async tryRedisSet(key: string, value: string, ttlSec: number) {
    if (!this.redis) {
      return;
    }

    try {
      await this.redis.set(key, value, "EX", ttlSec);
    } catch (error) {
      this.warnRedisFallback(error, "set");
    }
  }

  async get<T>(cacheKey: string): Promise<T | null> {
    const redisKey = `search:cache:${cacheKey}`;
    const redisValue = await this.tryRedisGet(redisKey);

    if (redisValue) {
      return JSON.parse(redisValue) as T;
    }

    const record = await this.prisma.searchCache.findUnique({
      where: { cacheKey }
    });

    if (!record || record.expiresAt.getTime() <= Date.now()) {
      return null;
    }

    await this.tryRedisSet(redisKey, JSON.stringify(record.responseJson), 300);

    return record.responseJson as T;
  }

  async set(cacheKey: string, query: string, provider: string, responseJson: JsonLike, ttlSec: number) {
    const expiresAt = new Date(Date.now() + ttlSec * 1000);

    await Promise.all([
      this.tryRedisSet(`search:cache:${cacheKey}`, JSON.stringify(responseJson), ttlSec),
      this.prisma.searchCache.upsert({
        where: { cacheKey },
        update: {
          query,
          provider,
          responseJson: responseJson as never,
          expiresAt,
          lastAccessedAt: new Date()
        },
        create: {
          cacheKey,
          query,
          provider,
          responseJson: responseJson as never,
          expiresAt,
          lastAccessedAt: new Date()
        }
      })
    ]);
  }

  async claimCooldown(userId: string, cooldownSec: number) {
    if (!this.redis) {
      return true;
    }

    const key = `search:cooldown:${userId}`;

    try {
      const result = await this.redis.set(key, "1", "EX", cooldownSec, "NX");
      return result === "OK";
    } catch (error) {
      this.warnRedisFallback(error, "claimCooldown");
      return true;
    }
  }

  async cleanupExpired(now = new Date()): Promise<{ count: number }> {
    return this.prisma.searchCache.deleteMany({
      where: {
        expiresAt: { lt: now }
      }
    });
  }
}
