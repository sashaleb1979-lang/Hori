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

// src/routes/import.ts
function assertAdmin3(request, reply, expectedToken) {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (token !== expectedToken) {
    reply.code(401);
    throw new Error("unauthorized");
  }
}
function isMediaOnly(content) {
  if (!content || !content.trim()) {
    return true;
  }
  const trimmed = content.trim();
  if (/^https?:\/\/\S+\.(png|jpe?g|gif|webp|mp4|webm|mov|mp3|ogg|wav)(\?\S*)?$/i.test(trimmed)) {
    return true;
  }
  if (/^https?:\/\/\S+$/i.test(trimmed) && trimmed.length < 200) {
    return false;
  }
  return false;
}
async function registerImportRoutes(app) {
  app.post("/api/import/chat-history", async (request, reply) => {
    try {
      assertAdmin3(request, reply, app.runtime.env.API_ADMIN_TOKEN);
    } catch {
      return { error: "unauthorized" };
    }
    const body = request.body;
    if (!body.guildId || !Array.isArray(body.messages)) {
      reply.code(400);
      return { error: "body must contain guildId (string) and messages (array)" };
    }
    if (body.messages.length > 5e4) {
      reply.code(400);
      return { error: "max 50000 messages per request" };
    }
    const result = {
      imported: 0,
      skipped: 0,
      errors: 0,
      usersFound: []
    };
    const seenUsers = /* @__PURE__ */ new Set();
    const guildId = body.guildId;
    await app.runtime.prisma.guild.upsert({
      where: { id: guildId },
      update: {},
      create: { id: guildId }
    });
    for (const entry of body.messages) {
      if (!entry.userId || !entry.content || !entry.timestamp) {
        result.skipped += 1;
        continue;
      }
      if (isMediaOnly(entry.content)) {
        result.skipped += 1;
        continue;
      }
      const createdAt = new Date(entry.timestamp);
      if (isNaN(createdAt.getTime())) {
        result.skipped += 1;
        continue;
      }
      const messageId = `import:${guildId}:${entry.userId}:${createdAt.getTime()}`;
      const channelId = entry.channelId ?? "imported";
      try {
        const existing = await app.runtime.prisma.message.findUnique({
          where: { id: messageId },
          select: { id: true }
        });
        if (existing) {
          result.skipped += 1;
          continue;
        }
        await app.runtime.prisma.user.upsert({
          where: { id: entry.userId },
          update: { username: entry.username ?? void 0 },
          create: { id: entry.userId, username: entry.username ?? null }
        });
        await app.runtime.prisma.message.create({
          data: {
            id: messageId,
            guildId,
            channelId,
            userId: entry.userId,
            content: entry.content,
            createdAt,
            charCount: entry.content.length,
            tokenEstimate: Math.ceil(entry.content.length / 4),
            mentionCount: 0,
            replyToMessageId: entry.replyToId ? `import:${guildId}:${entry.replyToId}` : void 0
          }
        });
        seenUsers.add(entry.userId);
        result.imported += 1;
      } catch (error) {
        result.errors += 1;
      }
    }
    result.usersFound = [...seenUsers];
    return result;
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
  await registerImportRoutes(app);
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
