import type { Readable } from "node:stream";

import { Buffer } from "node:buffer";

export class AudioMonitor {
  private readonly readable: Readable;
  private buffers: Buffer[] = [];
  private readonly maxSize: number;
  private lastFlagged = -1;
  private ended = false;

  constructor(
    readable: Readable,
    maxSize: number,
    onStart: () => void,
    callback: (buffer: Buffer) => void,
  ) {
    this.readable = readable;
    this.maxSize = maxSize;

    this.readable.on("data", (chunk: Buffer) => {
      if (this.lastFlagged < 0) {
        this.lastFlagged = this.buffers.length;
      }

      this.buffers.push(chunk);
      let currentSize = this.buffers.reduce((acc, cur) => acc + cur.length, 0);
      while (currentSize > this.maxSize && this.buffers.length > 0) {
        const removed = this.buffers.shift();
        currentSize -= removed?.length ?? 0;
        this.lastFlagged -= 1;
      }
    });

    this.readable.on("end", () => {
      this.ended = true;
      if (this.lastFlagged < 0) {
        return;
      }
      callback(this.getBufferFromStart());
      this.lastFlagged = -1;
    });

    this.readable.on("speakingStopped", () => {
      if (this.ended || this.lastFlagged < 0) {
        return;
      }
      callback(this.getBufferFromStart());
    });

    this.readable.on("speakingStarted", () => {
      if (this.ended) {
        return;
      }
      onStart();
      this.reset();
    });
  }

  stop() {
    this.readable.removeAllListeners("data");
    this.readable.removeAllListeners("end");
    this.readable.removeAllListeners("speakingStopped");
    this.readable.removeAllListeners("speakingStarted");
  }

  getBufferFromStart() {
    return Buffer.concat(this.buffers);
  }

  reset() {
    this.buffers = [];
    this.lastFlagged = -1;
  }
}