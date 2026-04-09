import Fastify from "fastify";

import { AnalyticsQueryService } from "@hori/analytics";
import { assertEnvForRole, loadEnv } from "@hori/config";
import { createLogger, createPrismaClient, createRedisClient, ensureInfrastructureReady } from "@hori/shared";

import { registerAdminRoutes } from "./routes/admin";
import { registerDebugRoutes } from "./routes/debug";
import { registerHealthRoutes } from "./routes/health";
import { registerMetricsRoutes } from "./routes/metrics";

declare module "fastify" {
  interface FastifyInstance {
    runtime: {
      env: ReturnType<typeof loadEnv>;
      logger: ReturnType<typeof createLogger>;
      prisma: ReturnType<typeof createPrismaClient>;
      redis: ReturnType<typeof createRedisClient>;
      analytics: AnalyticsQueryService;
    };
  }
}

export async function bootstrapApi() {
  const env = loadEnv();
  assertEnvForRole(env, "api");

  const logger = createLogger(env.LOG_LEVEL);
  const prisma = createPrismaClient();
  const redis = createRedisClient(env.REDIS_URL);
  await ensureInfrastructureReady({
    role: "api",
    nodeEnv: env.NODE_ENV,
    databaseUrl: env.DATABASE_URL,
    redisUrl: env.REDIS_URL,
    prisma,
    redis,
    logger
  });
  const analytics = new AnalyticsQueryService(prisma);
  const app = Fastify({ logger: false });

  app.decorate("runtime", {
    env,
    logger,
    prisma,
    redis,
    analytics
  });

  await registerHealthRoutes(app);
  await registerMetricsRoutes(app);
  await registerAdminRoutes(app);
  await registerDebugRoutes(app);

  return app;
}

