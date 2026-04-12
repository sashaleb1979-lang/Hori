import { describe, expect, it } from "vitest";

import { ReplyQueueService } from "@hori/core";
import type { AppPrismaClient } from "@hori/shared";

describe("ReplyQueueService", () => {
  it("uses busy-engine scoring and lane-aware dequeue ordering", async () => {
    const rows: Array<Record<string, unknown>> = [];

    const prisma = {
      replyQueueItem: {
        async findFirst(args: { where: Record<string, unknown>; orderBy?: unknown }) {
          const where = args.where;
          return (
            rows
              .filter((row) => {
                if (where.sourceMsgId && row.sourceMsgId !== where.sourceMsgId) {
                  return false;
                }

                if (where.guildId && row.guildId !== where.guildId) {
                  return false;
                }

                if (where.channelId && row.channelId !== where.channelId) {
                  return false;
                }

                if (where.status && row.status !== where.status) {
                  return false;
                }

                if (where.lockedUntil && typeof where.lockedUntil === "object" && "gt" in (where.lockedUntil as Record<string, unknown>)) {
                  return row.lockedUntil instanceof Date && row.lockedUntil > ((where.lockedUntil as { gt: Date }).gt);
                }

                return true;
              })
              .sort((left, right) => Number(left.priority ?? 0) - Number(right.priority ?? 0))[0] ?? null
          ) as Record<string, unknown> | null;
        },
        async count(args: { where: { guildId: string; channelId: string; status: { in: string[] } } }) {
          return rows.filter(
            (row) =>
              row.guildId === args.where.guildId &&
              row.channelId === args.where.channelId &&
              args.where.status.in.includes(String(row.status))
          ).length;
        },
        async create(args: { data: Record<string, unknown> }) {
          const row = { id: `queue-${rows.length + 1}`, createdAt: new Date(), updatedAt: new Date(), ...args.data };
          rows.push(row);
          return row;
        },
        async findMany(args: { where: Record<string, unknown> }) {
          return rows.filter(
            (row) =>
              row.guildId === args.where.guildId &&
              row.channelId === args.where.channelId &&
              row.status === args.where.status
          ) as Record<string, unknown>[];
        },
        async update(args: { where: { id: string }; data: Record<string, unknown> }) {
          const row = rows.find((entry) => entry.id === args.where.id)!;
          Object.assign(row, args.data, { updatedAt: new Date() });
          return row;
        },
        async updateMany() {
          return { count: 1 };
        },
      },
    } as unknown as AppPrismaClient;

    const service = new ReplyQueueService(prisma, 45);
    const now = new Date("2026-04-12T10:00:00Z");

    await service.claimOrQueue({
      guildId: "guild-1",
      channelId: "channel-1",
      sourceMsgId: "msg-processing",
      targetUserId: "user-a",
      messageKind: "info_question",
      mentionCount: 1,
      createdAt: now,
      triggerSource: "mention",
      explicitInvocation: true,
    });

    const queued = await service.claimOrQueue({
      guildId: "guild-1",
      channelId: "channel-1",
      sourceMsgId: "msg-queued",
      targetUserId: "user-b",
      messageKind: "reply_to_bot",
      mentionCount: 1,
      createdAt: now,
      triggerSource: "reply",
      explicitInvocation: true,
    });

    expect(queued.action).toBe("busy_ack");

    await prisma.replyQueueItem.update({
      where: { id: "queue-1" },
      data: { status: "done", lockedUntil: null },
    } as never);

    const next = await service.nextQueued("guild-1", "channel-1");
    expect(next?.sourceMsgId).toBe("msg-queued");
  });
});