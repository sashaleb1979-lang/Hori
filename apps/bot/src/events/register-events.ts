import { MessageFlags, REST, Routes } from "discord.js";

import type { BotRuntime } from "../bootstrap";
import { slashCommandDefinitions, contextMenuDefinitions } from "../commands/definitions";
import { routeInteraction } from "../router/interaction-router";
import { routeMessage } from "../router/message-router";

async function syncCommands(runtime: BotRuntime) {
  const rest = new REST({ version: "10" }).setToken(runtime.env.DISCORD_TOKEN!);
  const body = [...slashCommandDefinitions, ...contextMenuDefinitions];
  const slashCount = slashCommandDefinitions.length;
  const contextCount = contextMenuDefinitions.length;

  await rest.put(Routes.applicationCommands(runtime.env.DISCORD_CLIENT_ID!), { body });
  runtime.logger.info({ scope: "global", slash: slashCount, context: contextCount, total: body.length }, "discord commands synced globally");
}

export function registerEvents(runtime: BotRuntime) {
  runtime.client.once("clientReady", async () => {
    runtime.logger.info({ user: runtime.client.user?.tag }, "discord client ready");
    await syncCommands(runtime);
  });

  runtime.client.on("messageCreate", async (message) => {
    try {
      await routeMessage(runtime, message);
    } catch (error) {
      runtime.logger.error({ error }, "message handler failed");
    }
  });

  runtime.client.on("interactionCreate", async (interaction) => {
    try {
      if (interaction.isChatInputCommand() || interaction.isMessageContextMenuCommand() || interaction.isModalSubmit() || interaction.isButton()) {
        await routeInteraction(runtime, interaction);
      }
    } catch (error) {
      runtime.logger.error({ error }, "interaction handler failed");
      if (interaction.isRepliable() && !interaction.replied) {
        await interaction.reply({ content: "Что-то сломалось.", flags: MessageFlags.Ephemeral });
      }
    }
  });
}

