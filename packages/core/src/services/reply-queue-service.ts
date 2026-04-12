import type { AppPrismaClient, MessageKind, ReplyQueueTrace, TriggerSource } from "@hori/shared";

import { resolveRunAction } from "./busy-engine";
import { PriorityTaskQueue, type QueueLane } from "./priority-queue";

interface ReplyQueueItemSnapshot {
  id: string;
  guildId: string;
  channelId: string;
  targetUserId: string;
  sourceMsgId: string;
  priority: number;
  status: string;
  lockedUntil: Date | null;
  resultMsgId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

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
    messageKind: MessageKind;
    mentionCount: number;
    createdAt: Date;
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

    const queueDepth = await this.prisma.replyQueueItem.count({
      where: {
        guildId: input.guildId,
        channelId: input.channelId,
        status: { in: ["queued", "processing"] }
      }
    });

    const triggerSource = input.triggerSource ?? (input.explicitInvocation ? "name" : "auto_interject");
    const decision = resolveRunAction({
      triggerSource,
      messageKind: input.messageKind,
      ageMinutes: Math.max(0, (Date.now() - input.createdAt.getTime()) / 60_000),
      mentionCount: input.mentionCount,
      channelBusy: Boolean(busy),
      queueDepth
    });
    const priority = toStoredPriority(decision.scored.lane, decision.scored.score);

    if (decision.action === "drop") {
      const dropped = await this.prisma.replyQueueItem.create({
        data: {
          guildId: input.guildId,
          channelId: input.channelId,
          targetUserId: input.targetUserId,
          sourceMsgId: input.sourceMsgId,
          priority,
          status: "dropped"
        }
      });

      return { enabled: true, action: "dropped", itemId: dropped.id, reason: decision.reason };
    }

    if (!busy && queueDepth === 0) {
      const processing = await this.prisma.replyQueueItem.create({
        data: {
          guildId: input.guildId,
          channelId: input.channelId,
          targetUserId: input.targetUserId,
          sourceMsgId: input.sourceMsgId,
          priority,
          status: "processing",
          lockedUntil: new Date(Date.now() + this.busyTtlSec * 1000)
        }
      });

      return { enabled: true, action: "processing", itemId: processing.id, reason: decision.reason };
    }

    if (!input.explicitInvocation) {
      const dropped = await this.prisma.replyQueueItem.create({
        data: {
          guildId: input.guildId,
          channelId: input.channelId,
          targetUserId: input.targetUserId,
          sourceMsgId: input.sourceMsgId,
          priority,
          status: "dropped"
        }
      });

      return { enabled: true, action: "dropped", itemId: dropped.id, reason: decision.reason };
    }

    const queued = await this.prisma.replyQueueItem.create({
      data: {
        guildId: input.guildId,
        channelId: input.channelId,
        targetUserId: input.targetUserId,
        sourceMsgId: input.sourceMsgId,
        priority,
        status: "queued"
      }
    });

    return { enabled: true, action: "busy_ack", itemId: queued.id, reason: decision.reason };
  }

  async complete(itemId: string | null | undefined, resultMsgId?: string | null): Promise<void> {
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

  async nextQueued(guildId: string, channelId: string): Promise<ReplyQueueItemSnapshot | null> {
    const queued = await this.prisma.replyQueueItem.findMany({
      where: {
        guildId,
        channelId,
        status: "queued"
      },
      orderBy: [{ createdAt: "asc" }],
      take: 64
    });

    if (!queued.length) {
      return null;
    }

    const queue = new PriorityTaskQueue(Math.max(queued.length + 4, 16));

    for (const item of queued) {
      queue.enqueue(
        item.id,
        laneFromStoredPriority(item.priority),
        toTaskPriority(item.priority),
        { sourceMsgId: item.sourceMsgId },
        item.sourceMsgId
      );
    }

    const selected = queue.dequeue();
    if (!selected) {
      return null;
    }

    const next = queued.find((item) => item.id === selected.taskId) ?? null;
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

  async status(guildId: string, channelId?: string | null): Promise<{ queued: number; processing: number; dropped: number }> {
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

  async clear(guildId: string, channelId?: string | null): Promise<{ count: number }> {
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

function toStoredPriority(lane: QueueLane, score: number) {
  const laneBase: Record<QueueLane, number> = {
    mention: 900,
    reply: 700,
    auto_interject: 500,
    background: 300,
  };

  return laneBase[lane] + Math.max(0, Math.min(99, Math.round(score * 100)));
}

function laneFromStoredPriority(priority: number): QueueLane {
  if (priority >= 900) {
    return "mention";
  }

  if (priority >= 700) {
    return "reply";
  }

  if (priority >= 500) {
    return "auto_interject";
  }

  return "background";
}

function toTaskPriority(priority: number) {
  return Math.max(0, 1_000 - priority);
}
