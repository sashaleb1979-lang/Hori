import type { Message } from "discord.js";

import { splitLongMessage, type BotReplyPayload } from "@hori/shared";

export async function sendReply(message: Message, reply: string | BotReplyPayload) {
  const text = typeof reply === "string" ? reply : reply.text;
  const media = typeof reply === "string" ? null : reply.media;
  const chunks = splitLongMessage(text);

  for (let index = 0; index < chunks.length; index += 1) {
    if (index === 0) {
      await message.reply(media ? mediaReplyPayload(chunks[index], media.filePath) : chunks[index]);
    } else if ("send" in message.channel) {
      await message.channel.send(chunks[index]);
    }
  }
}

function mediaReplyPayload(content: string, filePath: string) {
  return content ? { content, files: [filePath] } : { files: [filePath] };
}
