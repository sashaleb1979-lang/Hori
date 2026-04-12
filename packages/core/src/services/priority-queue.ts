/**
 * Priority Task Queue
 * Source: AICO core/services/scheduler/priority_queue.py
 *
 * Simplified for Hori: 4 queue lanes, sorted-array heap,
 * fair dequeue with starvation protection.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export type QueueLane = "mention" | "reply" | "auto_interject" | "background";

export interface PrioritizedTask {
  /** Lower = higher priority (0 = highest) */
  priority: number;
  /** Monotonic counter for FIFO within same priority */
  seq: number;
  /** Unique task id */
  taskId: string;
  /** Which lane this task belongs to */
  lane: QueueLane;
  /** Arbitrary payload */
  payload: Record<string, unknown>;
  /** Timestamp when enqueued */
  enqueuedAt: number;
  /** Dedup key (defaults to taskId) */
  dedupeKey: string;
}

/* ------------------------------------------------------------------ */
/*  Queue implementation                                              */
/* ------------------------------------------------------------------ */

const LANE_ORDER: readonly QueueLane[] = [
  "mention",
  "reply",
  "auto_interject",
  "background",
] as const;

/**
 * Multi-lane priority task queue.
 * Mention lane is always drained first (user-facing).
 * Among background lanes, uses weighted starvation-aware selection.
 */
export class PriorityTaskQueue {
  private readonly maxPerLane: number;
  private seq = 0;

  private readonly lanes: Record<QueueLane, PrioritizedTask[]> = {
    mention: [],
    reply: [],
    auto_interject: [],
    background: [],
  };

  private readonly enqueuedKeys = new Set<string>();
  private readonly lastExecution: Partial<Record<QueueLane, number>> = {};

  constructor(maxPerLane = 200) {
    this.maxPerLane = maxPerLane;
  }

  /* ----- enqueue -------------------------------------------------- */

  enqueue(
    taskId: string,
    lane: QueueLane,
    priority: number,
    payload: Record<string, unknown> = {},
    dedupeKey?: string,
  ): boolean {
    const key = dedupeKey ?? taskId;
    if (this.enqueuedKeys.has(key)) return false;

    const heap = this.lanes[lane];
    if (heap.length >= this.maxPerLane) return false;

    const task: PrioritizedTask = {
      priority,
      seq: this.seq++,
      taskId,
      lane,
      payload,
      enqueuedAt: Date.now(),
      dedupeKey: key,
    };

    // Insert in sorted position (ascending by priority, then seq)
    const idx = this.findInsertIndex(heap, task);
    heap.splice(idx, 0, task);
    this.enqueuedKeys.add(key);
    return true;
  }

  /* ----- dequeue -------------------------------------------------- */

  /** Dequeue from a specific lane */
  dequeueFrom(lane: QueueLane): PrioritizedTask | null {
    const heap = this.lanes[lane];
    if (heap.length === 0) return null;
    const task = heap.shift()!;
    this.enqueuedKeys.delete(task.dedupeKey);
    this.lastExecution[lane] = Date.now();
    return task;
  }

  /** Fair dequeue: mention first, then starvation-weighted selection */
  dequeue(): PrioritizedTask | null {
    // Always drain mentions first (user-facing)
    if (this.lanes.mention.length > 0) {
      return this.dequeueFrom("mention");
    }

    // Weighted selection among remaining lanes
    let best: { weight: number; lane: QueueLane } | null = null;
    const now = Date.now();

    const laneWeights: Record<QueueLane, number> = {
      mention: 2.0,
      reply: 1.5,
      auto_interject: 1.0,
      background: 0.5,
    };

    for (const lane of LANE_ORDER) {
      if (lane === "mention") continue;
      const heap = this.lanes[lane];
      if (heap.length === 0) continue;

      const top = heap[0];
      const priorityWeight = 1 / (top.priority + 1);
      const lastExec = this.lastExecution[lane];
      const starvation = lastExec
        ? Math.min((now - lastExec) / 60_000, 5)
        : 5;
      const total = priorityWeight * starvation * laneWeights[lane];

      if (!best || total > best.weight) {
        best = { weight: total, lane };
      }
    }

    return best ? this.dequeueFrom(best.lane) : null;
  }

  /* ----- queries -------------------------------------------------- */

  hasTask(key: string): boolean {
    return this.enqueuedKeys.has(key);
  }

  size(lane?: QueueLane): number {
    if (lane) return this.lanes[lane].length;
    return LANE_ORDER.reduce((s, l) => s + this.lanes[l].length, 0);
  }

  peek(lane: QueueLane): PrioritizedTask | null {
    return this.lanes[lane][0] ?? null;
  }

  remove(taskId: string): boolean {
    for (const lane of LANE_ORDER) {
      const heap = this.lanes[lane];
      const idx = heap.findIndex((t) => t.taskId === taskId);
      if (idx !== -1) {
        const [removed] = heap.splice(idx, 1);
        this.enqueuedKeys.delete(removed.dedupeKey);
        return true;
      }
    }
    return false;
  }

  clear(lane?: QueueLane): void {
    if (lane) {
      for (const t of this.lanes[lane]) {
        this.enqueuedKeys.delete(t.dedupeKey);
      }
      this.lanes[lane] = [];
    } else {
      for (const l of LANE_ORDER) this.lanes[l] = [];
      this.enqueuedKeys.clear();
    }
  }

  stats(): Record<QueueLane, number> {
    return {
      mention: this.lanes.mention.length,
      reply: this.lanes.reply.length,
      auto_interject: this.lanes.auto_interject.length,
      background: this.lanes.background.length,
    };
  }

  /* ----- util ----------------------------------------------------- */

  private findInsertIndex(heap: PrioritizedTask[], task: PrioritizedTask): number {
    let lo = 0;
    let hi = heap.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      const cmp = heap[mid];
      if (cmp.priority < task.priority || (cmp.priority === task.priority && cmp.seq < task.seq)) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return lo;
  }
}
