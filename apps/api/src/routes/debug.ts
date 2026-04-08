import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

function assertAdmin(request: FastifyRequest, reply: FastifyReply, expectedToken: string) {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");

  if (token !== expectedToken) {
    reply.code(401);
    throw new Error("unauthorized");
  }
}

export async function registerDebugRoutes(app: FastifyInstance) {
  app.get("/debug/messages/:messageId/trace", async (request, reply) => {
    try {
      assertAdmin(request, reply, app.runtime.env.API_ADMIN_TOKEN);
    } catch {
      return { error: "unauthorized" };
    }

    const messageId = (request.params as { messageId: string }).messageId;
    const trace = await app.runtime.prisma.botEventLog.findFirst({
      where: { messageId },
      orderBy: { createdAt: "desc" }
    });

    return trace ?? { error: "not_found" };
  });
}
