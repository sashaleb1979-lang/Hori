import type { AppPrismaClient, ReplyQueueTrace, TriggerSource } from "@hori/shared";

export class ReplyQueueService {
  constructor(
    private readonly prisma: AppPrismaClient,
    private readonly busyTtlSec = 45
  ) {}

  async claimOrQueue(input: {
    guildId: string;
    channelId: string;
    sourceMsgId: string;
    targetUserId: string;
    triggerSource?: TriggerSource;
    explicitInvocation: boolean;
  }): Promise<ReplyQueueTrace> {
    const existing = await this.prisma.replyQueueItem.findFirst({
      where: { sourceMsgId: input.sourceMsgId },
      orderBy: { createdAt: "desc" }
    });

    if (existing?.status === "processing") {
      return { enabled: true, action: "processing", itemId: existing.id };
    }

    if (existing?.status === "queued") {
      return { enabled: true, action: "busy_ack", itemId: existing.id, reason: "already_queued" };
    }

    if (existing?.status === "done") {
      return { enabled: true, action: "dropped", itemId: existing.id, reason: "already_done" };
    }

    if (existing?.status === "dropped") {
      return { enabled: true, action: "dropped", itemId: existing.id, reason: "already_dropped" };
    }

    const busy = await this.prisma.replyQueueItem.findFirst({
      where: {
        guildId: input.guildId,
        channelId: input.channelId,
        status: "processing",
        lockedUntil: { gt: new Date() }
      },
      orderBy: { createdAt: "asc" }
    });

    if (busy) {
      if (!input.explicitInvocation || input.triggerSource === "auto_interject") {
        const dropped = await this.prisma.replyQueueItem.create({
          data: {
            guildId: input.guildId,
            channelId: input.channelId,
            targetUserId: input.targetUserId,
            sourceMsgId: input.sourceMsgId,
            priority: 0,
            status: "dropped"
          }
        });

        return { enabled: true, action: "dropped", itemId: dropped.id, reason: "channel_busy_auto" };
      }

      const queued = await this.prisma.replyQueueItem.create({
        data: {
          guildId: input.guildId,
          channelId: input.channelId,
          targetUserId: input.targetUserId,
          sourceMsgId: input.sourceMsgId,
          priority: 10,
          status: "queued"
        }
      });

      return { enabled: true, action: "busy_ack", itemId: queued.id, reason: "channel_busy" };
    }

    const processing = await this.prisma.replyQueueItem.create({
      data: {
        guildId: input.guildId,
        channelId: input.channelId,
        targetUserId: input.targetUserId,
        sourceMsgId: input.sourceMsgId,
        priority: input.explicitInvocation ? 10 : 1,
        status: "processing",
        lockedUntil: new Date(Date.now() + this.busyTtlSec * 1000)
      }
    });

    return { enabled: true, action: "processing", itemId: processing.id };
  }

  async complete(itemId: string | null | undefined, resultMsgId?: string | null) {
    if (!itemId) {
      return;
    }

    await this.prisma.replyQueueItem.updateMany({
      where: { id: itemId, status: "processing" },
      data: {
        status: "done",
        lockedUntil: null,
        resultMsgId: resultMsgId ?? undefined
      }
    });
  }

  async nextQueued(guildId: string, channelId: string) {
    const next = await this.prisma.replyQueueItem.findFirst({
      where: {
        guildId,
        channelId,
        status: "queued"
      },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }]
    });

    if (!next) {
      return null;
    }

    await this.prisma.replyQueueItem.update({
      where: { id: next.id },
      data: {
        status: "processing",
        lockedUntil: new Date(Date.now() + this.busyTtlSec * 1000)
      }
    });

    return next;
  }

  async status(guildId: string, channelId?: string | null) {
    const where = {
      guildId,
      ...(channelId ? { channelId } : {})
    };

    const [queued, processing, dropped] = await Promise.all([
      this.prisma.replyQueueItem.count({ where: { ...where, status: "queued" } }),
      this.prisma.replyQueueItem.count({ where: { ...where, status: "processing" } }),
      this.prisma.replyQueueItem.count({ where: { ...where, status: "dropped" } })
    ]);

    return { queued, processing, dropped };
  }

  async clear(guildId: string, channelId?: string | null) {
    return this.prisma.replyQueueItem.updateMany({
      where: {
        guildId,
        ...(channelId ? { channelId } : {}),
        status: { in: ["queued", "processing"] }
      },
      data: {
        status: "dropped",
        lockedUntil: null
      }
    });
  }
}
