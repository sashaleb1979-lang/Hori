import { Buffer } from "node:buffer";

export const VOICE_SAMPLE_RATE = 48_000;
export const VOICE_CHANNELS = 1;
export const VOICE_BITS_PER_SAMPLE = 16;

export function getWavHeader(
  audioLength: number,
  sampleRate: number,
  channelCount = VOICE_CHANNELS,
  bitsPerSample = VOICE_BITS_PER_SAMPLE,
): Buffer {
  const wavHeader = Buffer.alloc(44);
  wavHeader.write("RIFF", 0);
  wavHeader.writeUInt32LE(36 + audioLength, 4);
  wavHeader.write("WAVE", 8);
  wavHeader.write("fmt ", 12);
  wavHeader.writeUInt32LE(16, 16);
  wavHeader.writeUInt16LE(1, 20);
  wavHeader.writeUInt16LE(channelCount, 22);
  wavHeader.writeUInt32LE(sampleRate, 24);
  wavHeader.writeUInt32LE((sampleRate * bitsPerSample * channelCount) / 8, 28);
  wavHeader.writeUInt16LE((bitsPerSample * channelCount) / 8, 32);
  wavHeader.writeUInt16LE(bitsPerSample, 34);
  wavHeader.write("data", 36);
  wavHeader.writeUInt32LE(audioLength, 40);
  return wavHeader;
}

export function convertPcmToWav(pcmBuffer: Buffer): Buffer {
  const wavHeader = getWavHeader(pcmBuffer.length, VOICE_SAMPLE_RATE);
  return Buffer.concat([wavHeader, pcmBuffer]);
}