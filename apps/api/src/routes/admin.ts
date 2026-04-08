import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

function assertAdmin(request: FastifyRequest, reply: FastifyReply, expectedToken: string) {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");

  if (token !== expectedToken) {
    reply.code(401);
    throw new Error("unauthorized");
  }
}

export async function registerAdminRoutes(app: FastifyInstance) {
  app.get("/admin/guilds/:guildId/config", async (request, reply) => {
    try {
      assertAdmin(request, reply, app.runtime.env.API_ADMIN_TOKEN);
    } catch {
      return { error: "unauthorized" };
    }

    const guildId = (request.params as { guildId: string }).guildId;
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
