import type { FastifyInstance } from "fastify";

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get("/health/live", async () => ({ status: "ok" }));

  app.get("/health/ready", async () => {
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
  });
}

