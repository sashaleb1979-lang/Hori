import { createHash } from "node:crypto";

import type { AppPrismaClient, AppRedisClient } from "@hori/shared";

type JsonLike = string | number | boolean | null | JsonLike[] | { [key: string]: JsonLike };

export class SearchCacheService {
  constructor(
    private readonly prisma: AppPrismaClient,
    private readonly redis: AppRedisClient
  ) {}

  makeCacheKey(parts: string[]) {
    return createHash("sha256").update(parts.join("::")).digest("hex");
  }

  async get<T>(cacheKey: string): Promise<T | null> {
    const redisValue = await this.redis.get(`search:cache:${cacheKey}`);

    if (redisValue) {
      return JSON.parse(redisValue) as T;
    }

    const record = await this.prisma.searchCache.findUnique({
      where: { cacheKey }
    });

    if (!record || record.expiresAt.getTime() <= Date.now()) {
      return null;
    }

    await this.redis.set(`search:cache:${cacheKey}`, JSON.stringify(record.responseJson), "EX", 300);

    return record.responseJson as T;
  }

  async set(cacheKey: string, query: string, provider: string, responseJson: JsonLike, ttlSec: number) {
    const expiresAt = new Date(Date.now() + ttlSec * 1000);

    await Promise.all([
      this.redis.set(`search:cache:${cacheKey}`, JSON.stringify(responseJson), "EX", ttlSec),
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
    const key = `search:cooldown:${userId}`;
    const result = await this.redis.set(key, "1", "EX", cooldownSec, "NX");
    return result === "OK";
  }

  async cleanupExpired(now = new Date()): Promise<{ count: number }> {
    return this.prisma.searchCache.deleteMany({
      where: {
        expiresAt: { lt: now }
      }
    });
  }
}
