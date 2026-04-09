"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/bootstrap.ts
var import_fastify = __toESM(require("fastify"));
var import_analytics = require("@hori/analytics");
var import_config = require("@hori/config");
var import_shared2 = require("@hori/shared");

// src/routes/admin.ts
function assertAdmin(request, reply, expectedToken) {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (token !== expectedToken) {
    reply.code(401);
    throw new Error("unauthorized");
  }
}
async function registerAdminRoutes(app) {
  app.get("/admin/guilds/:guildId/config", async (request, reply) => {
    try {
      assertAdmin(request, reply, app.runtime.env.API_ADMIN_TOKEN);
    } catch {
      return { error: "unauthorized" };
    }
    const guildId = request.params.guildId;
    const [guild, channelConfigs, featureFlags, topProfiles] = await Promise.all([
      app.runtime.prisma.guild.findUnique({ where: { id: guildId } }),
      app.runtime.prisma.channelConfig.findMany({ where: { guildId }, orderBy: { updatedAt: "desc" } }),
      app.runtime.prisma.featureFlag.findMany({ where: { scope: "guild", scopeId: guildId } }),
      app.runtime.prisma.userProfile.findMany({
        where: { guildId, isEligible: true },
        orderBy: { confidenceScore: "desc" },
        take: 10
      })
    ]);
    return {
      guild,
      channelConfigs,
      featureFlags,
      topProfiles
    };
  });
}

// src/routes/debug.ts
function assertAdmin2(request, reply, expectedToken) {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (token !== expectedToken) {
    reply.code(401);
    throw new Error("unauthorized");
  }
}
async function registerDebugRoutes(app) {
  app.get("/debug/messages/:messageId/trace", async (request, reply) => {
    try {
      assertAdmin2(request, reply, app.runtime.env.API_ADMIN_TOKEN);
    } catch {
      return { error: "unauthorized" };
    }
    const messageId = request.params.messageId;
    const trace = await app.runtime.prisma.botEventLog.findFirst({
      where: { messageId },
      orderBy: { createdAt: "desc" }
    });
    return trace ?? { error: "not_found" };
  });
}

// src/routes/health.ts
async function registerHealthRoutes(app) {
  app.get("/health/live", async () => ({ status: "ok" }));
  app.get("/health/ready", async (_, reply) => {
    try {
      const [dbResult, redisResult] = await Promise.all([
        app.runtime.prisma.$queryRaw`SELECT 1`,
        app.runtime.redis.ping()
      ]);
      return {
        status: "ready",
        checks: {
          database: Array.isArray(dbResult) ? "ok" : "ok",
          redis: redisResult
        }
      };
    } catch (error) {
      reply.code(503);
      return {
        status: "not_ready",
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
}

// src/routes/metrics.ts
var import_shared = require("@hori/shared");
async function registerMetricsRoutes(app) {
  app.get("/metrics", async (_request, reply) => {
    reply.header("Content-Type", import_shared.metricsRegistry.contentType);
    return import_shared.metricsRegistry.metrics();
  });
}

// src/bootstrap.ts
async function bootstrapApi() {
  const env = (0, import_config.loadEnv)();
  (0, import_config.assertEnvForRole)(env, "api");
  const logger = (0, import_shared2.createLogger)(env.LOG_LEVEL);
  const prisma = (0, import_shared2.createPrismaClient)();
  const redis = (0, import_shared2.createRedisClient)(env.REDIS_URL);
  await (0, import_shared2.ensureInfrastructureReady)({
    role: "api",
    nodeEnv: env.NODE_ENV,
    databaseUrl: env.DATABASE_URL,
    redisUrl: env.REDIS_URL,
    prisma,
    redis,
    logger,
    allowRedisFailure: env.NODE_ENV !== "production"
  });
  const analytics = new import_analytics.AnalyticsQueryService(prisma);
  const app = (0, import_fastify.default)({ logger: false });
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

// src/index.ts
async function main() {
  const app = await bootstrapApi();
  await app.listen({
    host: app.runtime.env.API_HOST,
    port: app.runtime.env.API_PORT
  });
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
