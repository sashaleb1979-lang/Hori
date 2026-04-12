import { describe, expect, it } from "vitest";

import { isValidTranscription } from "../apps/bot/src/voice/transcription";

describe("transcription", () => {
  it("rejects blank and placeholder audio", () => {
    expect(isValidTranscription("")).toBe(false);
    expect(isValidTranscription("   ")).toBe(false);
    expect(isValidTranscription("[BLANK_AUDIO]")).toBe(false);
  });

  it("accepts normal speech text", () => {
    expect(isValidTranscription("хори, ты тут?")).toBe(true);
  });
});