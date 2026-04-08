import type { FastifyInstance } from "fastify";

import { metricsRegistry } from "@hori/shared";

export async function registerMetricsRoutes(app: FastifyInstance) {
  app.get("/metrics", async (_request, reply) => {
    reply.header("Content-Type", metricsRegistry.contentType);
    return metricsRegistry.metrics();
  });
}

