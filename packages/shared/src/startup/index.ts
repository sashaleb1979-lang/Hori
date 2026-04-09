import type IORedis from "ioredis";

import type { AppLogger } from "../logger";
import type { AppPrismaClient } from "../prisma";
import { asErrorMessage } from "../utils";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const REDIS_LOGGER_BOUND = Symbol.for("hori.redis.logger.bound");

function isLoopbackHost(hostname: string) {
  return LOOPBACK_HOSTS.has(hostname.toLowerCase());
}

function getDefaultPort(protocol: string) {
  if (protocol === "redis:" || protocol === "rediss:") {
    return "6379";
  }

  if (protocol === "postgres:" || protocol === "postgresql:") {
    return "5432";
  }

  return "";
}

function formatTarget(url: string) {
  const parsed = new URL(url);
  return `${parsed.hostname}:${parsed.port || getDefaultPort(parsed.protocol) || "unknown"}`;
}

function bindRedisDiagnostics(redis: IORedis, logger: AppLogger) {
  const redisWithFlag = redis as IORedis & { [REDIS_LOGGER_BOUND]?: boolean };

  if (redisWithFlag[REDIS_LOGGER_BOUND]) {
    return;
  }

  redis.on("error", (error) => {
    logger.error({ error: asErrorMessage(error) }, "redis client error");
  });

  redisWithFlag[REDIS_LOGGER_BOUND] = true;
}

export function isUnsafeLoopbackUrl(url: string, nodeEnv: string) {
  const parsed = new URL(url);

  return nodeEnv === "production" && isLoopbackHost(parsed.hostname);
}

function assertInfrastructureUrl(name: "Postgres" | "Redis", url: string, nodeEnv: string) {
  if (!isUnsafeLoopbackUrl(url, nodeEnv)) {
    return;
  }

  const variableHint =
    name === "Postgres"
      ? "Set DB_URL or DATABASE_URL to your Railway Postgres reference variable."
      : "Set KV_URL or REDIS_URL to your Railway Redis reference variable.";

  throw new Error(
    `${name} is configured as ${formatTarget(url)} in production. This is a loopback address and will fail in Railway containers. ${variableHint}`
  );
}

function assertProcessMode(role: "bot" | "api" | "worker", nodeEnv: string) {
  if (nodeEnv !== "production") {
    return;
  }

  const lifecycleEvent = process.env.npm_lifecycle_event?.toLowerCase();
  const runtimeArgs = `${process.argv.join(" ")} ${process.execArgv.join(" ")}`.toLowerCase();
  const looksLikeWatchMode = lifecycleEvent === "dev" || runtimeArgs.includes("tsx") || runtimeArgs.includes(" watch ");

  if (!looksLikeWatchMode) {
    return;
  }

  throw new Error(
    `${role} is running in dev/watch mode while NODE_ENV=production. In Railway remove the custom start command or set it to "node scripts/start.mjs".`
  );
}

export async function ensureInfrastructureReady(options: {
  role: "bot" | "api" | "worker";
  nodeEnv: string;
  databaseUrl: string;
  redisUrl: string;
  prisma: AppPrismaClient;
  redis: IORedis;
  logger: AppLogger;
}) {
  assertProcessMode(options.role, options.nodeEnv);
  assertInfrastructureUrl("Postgres", options.databaseUrl, options.nodeEnv);
  assertInfrastructureUrl("Redis", options.redisUrl, options.nodeEnv);
  bindRedisDiagnostics(options.redis, options.logger);

  try {
    await options.prisma.$connect();
    await options.prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    throw new Error(`Postgres is not reachable at ${formatTarget(options.databaseUrl)}: ${asErrorMessage(error)}`);
  }

  try {
    if (options.redis.status === "wait" || options.redis.status === "end") {
      await options.redis.connect();
    }

    await options.redis.ping();
  } catch (error) {
    throw new Error(`Redis is not reachable at ${formatTarget(options.redisUrl)}: ${asErrorMessage(error)}`);
  }

  options.logger.info({ role: options.role }, "infrastructure ready");
}
