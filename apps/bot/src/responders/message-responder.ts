import { isAbsolute, resolve } from "node:path";

import type { Message } from "discord.js";

import { splitLongMessage, type BotReplyPayload } from "@hori/shared";

export interface SendReplyOptions {
  naturalChunks?: string[];
  naturalDelayMs?: number;
}

export async function sendReply(message: Message, reply: string | BotReplyPayload, options: SendReplyOptions = {}) {
  const text = typeof reply === "string" ? reply : reply.text;
  const media = typeof reply === "string" ? null : reply.media;
  const chunks = media || !options.naturalChunks?.length ? splitLongMessage(text) : options.naturalChunks;

  for (let index = 0; index < chunks.length; index += 1) {
    if (index > 0 && options.naturalChunks?.length) {
      await sleep(options.naturalDelayMs ?? 900);
    }

    if (index === 0) {
      await message.reply(media ? mediaReplyPayload(chunks[index], media.filePath) : chunks[index]);
    } else if ("send" in message.channel) {
      await message.channel.send(chunks[index]);
    }
  }
}

export async function sendReplyToChannel(
  channel: { send(payload: unknown): Promise<unknown> },
  reply: string | BotReplyPayload
) {
  const text = typeof reply === "string" ? reply : reply.text;
  const media = typeof reply === "string" ? null : reply.media;
  const chunks = splitLongMessage(text);

  for (const chunk of chunks) {
    await channel.send(media ? mediaReplyPayload(chunk, media.filePath) : chunk);
  }
}

function mediaReplyPayload(content: string, filePath: string) {
  const resolvedPath = isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);
  return content ? { content, files: [resolvedPath] } : { files: [resolvedPath] };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
