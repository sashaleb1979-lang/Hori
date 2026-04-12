import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

interface ImportMessageEntry {
  userId: string;
  username?: string;
  content: string;
  timestamp: string;
  channelId?: string;
  channelName?: string;
  replyToId?: string;
}

interface ImportResult {
  imported: number;
  skipped: number;
  errors: number;
  usersFound: string[];
}

function assertAdmin(request: FastifyRequest, reply: FastifyReply, expectedToken: string) {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");

  if (token !== expectedToken) {
    reply.code(401);
    throw new Error("unauthorized");
  }
}

function isMediaOnly(content: string): boolean {
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

export async function registerImportRoutes(app: FastifyInstance) {
  app.post("/api/import/chat-history", async (request, reply) => {
    try {
      assertAdmin(request, reply, app.runtime.env.API_ADMIN_TOKEN);
    } catch {
      return { error: "unauthorized" };
    }

    const body = request.body as {
      guildId: string;
      messages: ImportMessageEntry[];
    };

    if (!body.guildId || !Array.isArray(body.messages)) {
      reply.code(400);
      return { error: "body must contain guildId (string) and messages (array)" };
    }

    if (body.messages.length > 50000) {
      reply.code(400);
      return { error: "max 50000 messages per request" };
    }

    const result: ImportResult = {
      imported: 0,
      skipped: 0,
      errors: 0,
      usersFound: [],
    };

    const seenUsers = new Set<string>();
    const guildId = body.guildId;

    await app.runtime.prisma.guild.upsert({
      where: { id: guildId },
      update: {},
      create: { id: guildId },
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
          select: { id: true },
        });

        if (existing) {
          result.skipped += 1;
          continue;
        }

        await app.runtime.prisma.user.upsert({
          where: { id: entry.userId },
          update: { username: entry.username ?? undefined },
          create: { id: entry.userId, username: entry.username ?? null },
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
            replyToMessageId: entry.replyToId ? `import:${guildId}:${entry.replyToId}` : undefined,
          },
        });

        seenUsers.add(entry.userId);
        result.imported += 1;
      } catch {
        result.errors += 1;
      }
    }

    result.usersFound = [...seenUsers];

    return result;
  });
}
