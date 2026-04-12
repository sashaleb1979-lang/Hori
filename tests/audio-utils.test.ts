import { describe, expect, it } from "vitest";

import { convertPcmToWav, getWavHeader, VOICE_SAMPLE_RATE } from "../apps/bot/src/voice/audio-utils";

describe("audio-utils", () => {
  it("builds a valid 44-byte wav header", () => {
    const header = getWavHeader(320, VOICE_SAMPLE_RATE);

    expect(header.length).toBe(44);
    expect(header.toString("ascii", 0, 4)).toBe("RIFF");
    expect(header.toString("ascii", 8, 12)).toBe("WAVE");
  });

  it("prefixes pcm with wav header", () => {
    const pcm = Buffer.alloc(320, 1);
    const wav = convertPcmToWav(pcm);

    expect(wav.length).toBe(364);
    expect(wav.subarray(44)).toEqual(pcm);
  });
});