import { describe, expect, it, vi } from "vitest";

import { createChannelDebouncer } from "@hori/core";

describe("debounce-policy", () => {
  it("buffers independently by key inside the same channel", async () => {
    vi.useFakeTimers();
    try {
      const flushed: string[][] = [];
      const debouncer = createChannelDebouncer(
        "demo-channel",
        { defaultMs: 10, byChannel: {} },
        {
          buildKey: (item: { id: string }) => item.id,
          onFlush: async (items) => {
            flushed.push(items.map((item) => item.id));
          },
        },
      );

      await debouncer.enqueue({ id: "a" });
      await debouncer.enqueue({ id: "b" });
      await debouncer.enqueue({ id: "a" });

      await vi.advanceTimersByTimeAsync(15);

      expect(flushed).toHaveLength(2);
      expect(flushed).toContainEqual(["a", "a"]);
      expect(flushed).toContainEqual(["b"]);
    } finally {
      vi.useRealTimers();
    }
  });
});