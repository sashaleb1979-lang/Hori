import type { Job } from "bullmq";

import type { CleanupJobPayload } from "@hori/shared";

import type { WorkerRuntime } from "../index";

export function createCleanupJob(runtime: WorkerRuntime) {
  return async (job: Job<CleanupJobPayload>) => {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    if (job.data.kind === "logs") {
      const result = await runtime.prisma.botEventLog.deleteMany({
        where: { createdAt: { lt: cutoff } }
      });
      return { deleted: result.count, kind: "logs" };
    }

    const result = await runtime.prisma.interjectionLog.deleteMany({
      where: { createdAt: { lt: cutoff } }
    });

    const [expiredMoods, oldQueueItems] = await Promise.all([
      runtime.prisma.moodState.deleteMany({
        where: { endsAt: { lt: cutoff } }
      }),
      runtime.prisma.replyQueueItem.deleteMany({
        where: {
          status: { in: ["done", "dropped"] },
          updatedAt: { lt: cutoff }
        }
      })
    ]);

    return {
      deleted: result.count + expiredMoods.count + oldQueueItems.count,
      kind: "interjections",
      interjections: result.count,
      expiredMoods: expiredMoods.count,
      oldQueueItems: oldQueueItems.count
    };
  };
}

