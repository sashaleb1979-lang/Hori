import IORedis from "ioredis";

declare global {
  // eslint-disable-next-line no-var
  var __horiRedis__: IORedis | undefined;
}

export function createRedisClient(redisUrl: string) {
  if (!global.__horiRedis__) {
    global.__horiRedis__ = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableAutoPipelining: true
    });
  }

  return global.__horiRedis__;
}

export function getBullConnection(redisUrl: string) {
  const url = new URL(redisUrl);
  const tls = url.protocol === "rediss:" ? {} : undefined;

  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    tls,
    maxRetriesPerRequest: null
  };
}

export type AppRedisClient = ReturnType<typeof createRedisClient>;

