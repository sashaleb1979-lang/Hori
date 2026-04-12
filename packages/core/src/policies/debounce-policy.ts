/**
 * Debounce Policy — per-channel inbound message debouncing
 * Source: OpenClaw channels/inbound-debounce-policy.ts
 *
 * Strips multi-channel abstraction. Discord-only.
 * Commands (/ prefix) bypass debounce.
 */

/* ------------------------------------------------------------------ */
/*  Config                                                            */
/* ------------------------------------------------------------------ */

export interface DebounceConfig {
  /** Default debounce window in ms */
  defaultMs: number;
  /** Per-channel overrides: channelId → ms */
  byChannel: Record<string, number>;
}

export const DEFAULT_DEBOUNCE: Readonly<DebounceConfig> = {
  defaultMs: 1500,
  byChannel: {},
};

/* ------------------------------------------------------------------ */
/*  shouldDebounce — from OpenClaw shouldDebounceTextInbound           */
/* ------------------------------------------------------------------ */

/**
 * Should this text message be batched into debounce window?
 * Returns false (skip debounce) for:
 *  - blank text
 *  - media / attachments
 *  - slash commands (/)
 *  - explicit opt-out
 */
export function shouldDebounce(params: {
  text: string | null | undefined;
  hasMedia?: boolean;
  allowDebounce?: boolean;
}): boolean {
  if (params.allowDebounce === false) return false;
  if (params.hasMedia) return false;

  const t = (params.text ?? "").trim();
  if (!t) return false;

  // Slash commands bypass debounce
  if (t.startsWith("/")) return false;

  return true;
}

/* ------------------------------------------------------------------ */
/*  Per-channel debouncer — from OpenClaw createChannelInboundDebouncer*/
/* ------------------------------------------------------------------ */

export function resolveDebounceMs(
  channelId: string,
  config: DebounceConfig = DEFAULT_DEBOUNCE,
): number {
  return config.byChannel[channelId] ?? config.defaultMs;
}

export interface DebouncerCallbacks<T> {
  buildKey: (item: T) => string | null | undefined;
  onFlush: (items: T[]) => void | Promise<void>;
}

interface DebounceBuffer<T> {
  items: T[];
  timeout: ReturnType<typeof setTimeout> | null;
}

/**
 * Creates a per-channel debouncer that collects items and flushes
 * them as a batch after the debounce window.
 */
export function createChannelDebouncer<T>(
  channelId: string,
  config: DebounceConfig,
  callbacks: DebouncerCallbacks<T>,
) {
  const ms = resolveDebounceMs(channelId, config);
  const buffers = new Map<string, DebounceBuffer<T>>();

  async function flushKey(key: string): Promise<void> {
    const buffer = buffers.get(key);
    if (!buffer) {
      return;
    }
    buffers.delete(key);
    if (buffer.timeout !== null) {
      clearTimeout(buffer.timeout);
      buffer.timeout = null;
    }
    if (buffer.items.length > 0) {
      await callbacks.onFlush(buffer.items);
    }
  }

  function scheduleFlush(key: string, buffer: DebounceBuffer<T>) {
    if (buffer.timeout !== null) {
      clearTimeout(buffer.timeout);
    }
    buffer.timeout = setTimeout(() => {
      void flushKey(key);
    }, ms);
    buffer.timeout.unref?.();
  }

  return {
    debounceMs: ms,

    async enqueue(item: T): Promise<void> {
      const key = callbacks.buildKey(item);
      if (!key) {
        await callbacks.onFlush([item]);
        return;
      }

      const existing = buffers.get(key);
      if (existing) {
        existing.items.push(item);
        scheduleFlush(key, existing);
        return;
      }

      const buffer: DebounceBuffer<T> = {
        items: [item],
        timeout: null,
      };
      buffers.set(key, buffer);
      scheduleFlush(key, buffer);
    },

    /** Force-flush without waiting */
    async flushNow(): Promise<void> {
      const keys = [...buffers.keys()];
      await Promise.all(keys.map((key) => flushKey(key)));
    },

    /** Number of items waiting */
    get pending(): number {
      let total = 0;
      for (const buffer of buffers.values()) {
        total += buffer.items.length;
      }
      return total;
    },

    /** Cancel pending flush */
    cancel(): void {
      for (const buffer of buffers.values()) {
        if (buffer.timeout !== null) {
          clearTimeout(buffer.timeout);
        }
      }
      buffers.clear();
    },
  };
}
