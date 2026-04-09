import type { FastifyInstance } from "fastify";

export async function registerHealthRoutes(app: FastifyInstance) {
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

