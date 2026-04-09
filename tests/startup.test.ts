import { describe, expect, it, vi } from "vitest";

import { ensureInfrastructureReady, isUnsafeLoopbackUrl } from "@hori/shared";

describe("isUnsafeLoopbackUrl", () => {
  it("rejects loopback infrastructure URLs in production", () => {
    expect(isUnsafeLoopbackUrl("postgresql://postgres:postgres@localhost:5432/hori", "production")).toBe(true);
    expect(isUnsafeLoopbackUrl("redis://127.0.0.1:6379", "production")).toBe(true);
  });

  it("allows local infrastructure URLs outside production", () => {
    expect(isUnsafeLoopbackUrl("postgresql://postgres:postgres@localhost:5432/hori", "development")).toBe(false);
  });

  it("allows non-loopback URLs in production", () => {
    expect(isUnsafeLoopbackUrl("postgresql://postgres:postgres@hori-postgres.railway.internal:5432/hori", "production")).toBe(false);
    expect(isUnsafeLoopbackUrl("rediss://default:secret@redis.railway.internal:6379", "production")).toBe(false);
  });

  it("can continue without redis in local fallback mode", async () => {
    const prisma = {
      $connect: vi.fn().mockResolvedValue(undefined),
      $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }])
    };
    const redis = {
      status: "wait",
      connect: vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:6379")),
      ping: vi.fn(),
      disconnect: vi.fn(),
      on: vi.fn()
    };
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    const result = await ensureInfrastructureReady({
      role: "bot",
      nodeEnv: "development",
      databaseUrl: "postgresql://postgres:postgres@localhost:5432/hori",
      redisUrl: "redis://localhost:6379",
      prisma: prisma as never,
      redis: redis as never,
      logger: logger as never,
      allowRedisFailure: true
    });

    expect(result.redisReady).toBe(false);
    expect(logger.warn).toHaveBeenCalled();
    expect(redis.disconnect).toHaveBeenCalled();
  });

  it("still rejects redis failures in production", async () => {
    const prisma = {
      $connect: vi.fn().mockResolvedValue(undefined),
      $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }])
    };
    const redis = {
      status: "wait",
      connect: vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.5:6379")),
      ping: vi.fn(),
      disconnect: vi.fn(),
      on: vi.fn()
    };
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    await expect(
      ensureInfrastructureReady({
        role: "worker",
        nodeEnv: "production",
        databaseUrl: "postgresql://postgres:postgres@db.internal:5432/hori",
        redisUrl: "rediss://default:secret@redis.internal:6379",
        prisma: prisma as never,
        redis: redis as never,
        logger: logger as never,
        allowRedisFailure: true
      })
    ).rejects.toThrow(/Redis is not reachable/);
  });
});
