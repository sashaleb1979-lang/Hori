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
        async updateMany(args?: { where?: Record<string, unknown>; data?: Record<string, unknown> }) {
          let count = 0;

          for (const row of rows) {
            const where = args?.where ?? {};

            if (where.guildId && row.guildId !== where.guildId) {
              continue;
            }

            if (where.channelId && row.channelId !== where.channelId) {
              continue;
            }

            if (where.status) {
              if (
                typeof where.status === "object" &&
                "in" in (where.status as Record<string, unknown>) &&
                !((where.status as { in: string[] }).in.includes(String(row.status)))
              ) {
                continue;
              }

              if (typeof where.status === "string" && row.status !== where.status) {
                continue;
              }
            }

            if (where.lockedUntil && typeof where.lockedUntil === "object" && "lte" in (where.lockedUntil as Record<string, unknown>)) {
              if (!(row.lockedUntil instanceof Date) || row.lockedUntil > ((where.lockedUntil as { lte: Date }).lte)) {
                continue;
              }
            }

            if (where.createdAt && typeof where.createdAt === "object" && "lte" in (where.createdAt as Record<string, unknown>)) {
              if (!(row.createdAt instanceof Date) || row.createdAt > ((where.createdAt as { lte: Date }).lte)) {
                continue;
              }
            }

            Object.assign(row, args?.data ?? {}, { updatedAt: new Date() });
            count += 1;
          }

          return { count };
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

  it("reaps expired processing rows before treating the channel as busy", async () => {
    const rows: Array<Record<string, unknown>> = [
      {
        id: "queue-stale",
        guildId: "guild-1",
        channelId: "channel-1",
        targetUserId: "user-old",
        sourceMsgId: "msg-stale",
        priority: 980,
        status: "processing",
        lockedUntil: new Date(Date.now() - 1000),
        createdAt: new Date(Date.now() - 60_000),
        updatedAt: new Date(Date.now() - 60_000),
      },
    ];

    const prisma = {
      replyQueueItem: {
        async findFirst(args: { where: Record<string, unknown> }) {
          const where = args.where;
          return (
            rows.find((row) => {
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
            }) ?? null
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
        async updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }) {
          let count = 0;

          for (const row of rows) {
            if (args.where.guildId && row.guildId !== args.where.guildId) {
              continue;
            }

            if (args.where.channelId && row.channelId !== args.where.channelId) {
              continue;
            }

            if (args.where.status && row.status !== args.where.status) {
              continue;
            }

            if (args.where.lockedUntil && typeof args.where.lockedUntil === "object" && "lte" in (args.where.lockedUntil as Record<string, unknown>)) {
              if (!(row.lockedUntil instanceof Date) || row.lockedUntil > ((args.where.lockedUntil as { lte: Date }).lte)) {
                continue;
              }
            }

            if (args.where.createdAt && typeof args.where.createdAt === "object" && "lte" in (args.where.createdAt as Record<string, unknown>)) {
              if (!(row.createdAt instanceof Date) || row.createdAt > ((args.where.createdAt as { lte: Date }).lte)) {
                continue;
              }
            }

            Object.assign(row, args.data, { updatedAt: new Date() });
            count += 1;
          }

          return { count };
        },
      },
    } as unknown as AppPrismaClient;

    const service = new ReplyQueueService(prisma, 45);
    const result = await service.claimOrQueue({
      guildId: "guild-1",
      channelId: "channel-1",
      sourceMsgId: "msg-new",
      targetUserId: "user-new",
      messageKind: "direct_mention",
      mentionCount: 1,
      createdAt: new Date(),
      triggerSource: "mention",
      explicitInvocation: true,
    });

    expect(result.action).toBe("processing");
    expect(rows.find((row) => row.id === "queue-stale")?.status).toBe("dropped");
    expect(rows.find((row) => row.sourceMsgId === "msg-new")?.status).toBe("processing");
  });

  it("drops orphaned queued rows before they can keep a channel busy forever", async () => {
    const rows: Array<Record<string, unknown>> = [
      {
        id: "queue-orphaned",
        guildId: "guild-1",
        channelId: "channel-1",
        targetUserId: "user-old",
        sourceMsgId: "msg-orphaned",
        priority: 980,
        status: "queued",
        lockedUntil: null,
        createdAt: new Date(Date.now() - 60_000),
        updatedAt: new Date(Date.now() - 60_000),
      },
    ];

    const prisma = {
      replyQueueItem: {
        async findFirst(args: { where: Record<string, unknown> }) {
          const where = args.where;
          return (
            rows.find((row) => {
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
            }) ?? null
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
        async updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }) {
          let count = 0;

          for (const row of rows) {
            if (args.where.guildId && row.guildId !== args.where.guildId) {
              continue;
            }

            if (args.where.channelId && row.channelId !== args.where.channelId) {
              continue;
            }

            if (args.where.status && row.status !== args.where.status) {
              continue;
            }

            if (args.where.lockedUntil && typeof args.where.lockedUntil === "object" && "lte" in (args.where.lockedUntil as Record<string, unknown>)) {
              if (!(row.lockedUntil instanceof Date) || row.lockedUntil > ((args.where.lockedUntil as { lte: Date }).lte)) {
                continue;
              }
            }

            if (args.where.createdAt && typeof args.where.createdAt === "object" && "lte" in (args.where.createdAt as Record<string, unknown>)) {
              if (!(row.createdAt instanceof Date) || row.createdAt > ((args.where.createdAt as { lte: Date }).lte)) {
                continue;
              }
            }

            Object.assign(row, args.data, { updatedAt: new Date() });
            count += 1;
          }

          return { count };
        },
      },
    } as unknown as AppPrismaClient;

    const service = new ReplyQueueService(prisma, 45);
    const result = await service.claimOrQueue({
      guildId: "guild-1",
      channelId: "channel-1",
      sourceMsgId: "msg-new",
      targetUserId: "user-new",
      messageKind: "direct_mention",
      mentionCount: 1,
      createdAt: new Date(),
      triggerSource: "mention",
      explicitInvocation: true,
    });

    expect(result.action).toBe("processing");
    expect(rows.find((row) => row.id === "queue-orphaned")?.status).toBe("dropped");
    expect(rows.find((row) => row.sourceMsgId === "msg-new")?.status).toBe("processing");
  });

  it("abandons processing rows when invocation cleanup fails before a reply is delivered", async () => {
    const rows: Array<Record<string, unknown>> = [
      {
        id: "queue-processing",
        guildId: "guild-1",
        channelId: "channel-1",
        targetUserId: "user-old",
        sourceMsgId: "msg-processing",
        priority: 980,
        status: "processing",
        lockedUntil: new Date(Date.now() + 30_000),
        createdAt: new Date(Date.now() - 60_000),
        updatedAt: new Date(Date.now() - 60_000),
      },
    ];

    const prisma = {
      replyQueueItem: {
        async updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }) {
          let count = 0;

          for (const row of rows) {
            if (args.where.id && row.id !== args.where.id) {
              continue;
            }

            if (args.where.status && row.status !== args.where.status) {
              continue;
            }

            Object.assign(row, args.data, { updatedAt: new Date() });
            count += 1;
          }

          return { count };
        },
      },
    } as unknown as AppPrismaClient;

    const service = new ReplyQueueService(prisma, 45);

    await service.abandon("queue-processing");

    expect(rows[0]?.status).toBe("dropped");
    expect(rows[0]?.lockedUntil).toBeNull();
  });
});
