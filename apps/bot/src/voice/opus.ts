import { Buffer } from "node:buffer";
import { Transform } from "node:stream";

type OpusScriptConstructor = new (
  sampleRate: 8000 | 12000 | 16000 | 24000 | 48000,
  channels: number,
) => {
  decode(chunk: Buffer): Uint8Array | Int16Array | Buffer | null;
};

const OpusScript = require("opusscript") as OpusScriptConstructor;

export class OpusDecoder extends Transform {
  private readonly decoder: InstanceType<OpusScriptConstructor>;

  constructor(sampleRate: 8000 | 12000 | 16000 | 24000 | 48000, channels: number) {
    super();
    this.decoder = new OpusScript(sampleRate, channels);
  }

  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    try {
      const pcm = this.decoder.decode(chunk);
      if (pcm) {
        this.push(Buffer.from(pcm));
      }
      callback();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit("error", err);
      callback(err);
    }
  }
}