import type { Message } from "discord.js";

import { splitLongMessage } from "@hori/shared";

export async function sendReply(message: Message, text: string) {
  const chunks = splitLongMessage(text);

  for (let index = 0; index < chunks.length; index += 1) {
    if (index === 0) {
      await message.reply(chunks[index]);
    } else if ("send" in message.channel) {
      await message.channel.send(chunks[index]);
    }
  }
}
