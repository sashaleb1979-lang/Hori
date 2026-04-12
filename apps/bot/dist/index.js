"use strict";

// src/bootstrap.ts
var import_analytics2 = require("@hori/analytics");
var import_config = require("@hori/config");
var import_core2 = require("@hori/core");
var import_llm = require("@hori/llm");
var import_memory = require("@hori/memory");
var import_search = require("@hori/search");
var import_shared5 = require("@hori/shared");

// src/gateway/create-discord-client.ts
var import_discord = require("discord.js");
function createDiscordClient() {
  return new import_discord.Client({
    intents: [
      import_discord.GatewayIntentBits.Guilds,
      import_discord.GatewayIntentBits.GuildMessages,
      import_discord.GatewayIntentBits.MessageContent,
      import_discord.GatewayIntentBits.GuildMembers
    ],
    partials: [import_discord.Partials.Channel, import_discord.Partials.Message]
  });
}

// src/events/register-events.ts
var import_discord5 = require("discord.js");

// src/commands/definitions.ts
var import_discord2 = require("discord.js");
var import_shared = require("@hori/shared");
var slashCommandDefinitions = [
  new import_discord2.SlashCommandBuilder().setName("bot-help").setDescription("\u041A\u043E\u0440\u043E\u0442\u043A\u0430\u044F \u0441\u043F\u0440\u0430\u0432\u043A\u0430 \u043F\u043E \u0430\u0434\u043C\u0438\u043D-\u043A\u043E\u043C\u0430\u043D\u0434\u0430\u043C"),
  new import_discord2.SlashCommandBuilder().setName("bot-style").setDescription("\u041D\u0430\u0441\u0442\u0440\u043E\u0438\u0442\u044C \u0441\u0442\u0438\u043B\u044C \u0425\u043E\u0440\u0438").addStringOption((option) => option.setName("bot-name").setDescription("\u0418\u043C\u044F \u0431\u043E\u0442\u0430")).addIntegerOption((option) => option.setName("roughness").setDescription("\u0413\u0440\u0443\u0431\u043E\u0441\u0442\u044C 0-5").setMinValue(0).setMaxValue(5)).addIntegerOption((option) => option.setName("sarcasm").setDescription("\u0421\u0430\u0440\u043A\u0430\u0437\u043C 0-5").setMinValue(0).setMaxValue(5)).addIntegerOption((option) => option.setName("roast").setDescription("\u0421\u0442\u0451\u0431 0-5").setMinValue(0).setMaxValue(5)).addStringOption(
    (option) => option.setName("reply-length").setDescription("\u041F\u0440\u0435\u0434\u043F\u043E\u0447\u0442\u0438\u0442\u0435\u043B\u044C\u043D\u0430\u044F \u0434\u043B\u0438\u043D\u0430").addChoices(
      { name: "short", value: "short" },
      { name: "medium", value: "medium" },
      { name: "long", value: "long" }
    )
  ).addStringOption((option) => option.setName("preferred-style").setDescription("\u041F\u0440\u0435\u0434\u043F\u043E\u0447\u0442\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u0441\u0442\u0438\u043B\u044C \u0440\u0435\u0447\u0438")).addStringOption((option) => option.setName("forbidden-words").setDescription("CSV \u0441\u043F\u0438\u0441\u043E\u043A \u0437\u0430\u043F\u0440\u0435\u0449\u0451\u043D\u043D\u044B\u0445 \u0441\u043B\u043E\u0432")).addStringOption((option) => option.setName("forbidden-topics").setDescription("CSV \u0441\u043F\u0438\u0441\u043E\u043A \u0437\u0430\u043F\u0440\u0435\u0449\u0451\u043D\u043D\u044B\u0445 \u0442\u0435\u043C")),
  new import_discord2.SlashCommandBuilder().setName("bot-memory").setDescription("\u0423\u043F\u0440\u0430\u0432\u043B\u044F\u0442\u044C \u0434\u043E\u043B\u0433\u043E\u0439 \u043F\u0430\u043C\u044F\u0442\u044C\u044E").addSubcommand(
    (subcommand) => subcommand.setName("remember").setDescription("\u0417\u0430\u043F\u043E\u043C\u043D\u0438\u0442\u044C \u0444\u0430\u043A\u0442").addStringOption((option) => option.setName("key").setDescription("\u041A\u043B\u044E\u0447").setRequired(true)).addStringOption((option) => option.setName("value").setDescription("\u0417\u043D\u0430\u0447\u0435\u043D\u0438\u0435").setRequired(true))
  ).addSubcommand(
    (subcommand) => subcommand.setName("forget").setDescription("\u0417\u0430\u0431\u044B\u0442\u044C \u0444\u0430\u043A\u0442").addStringOption((option) => option.setName("key").setDescription("\u041A\u043B\u044E\u0447").setRequired(true))
  ),
  new import_discord2.SlashCommandBuilder().setName("bot-relationship").setDescription("\u041D\u0430\u0441\u0442\u0440\u043E\u0438\u0442\u044C \u043E\u0442\u043D\u043E\u0448\u0435\u043D\u0438\u0435 \u043A \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044E").addUserOption((option) => option.setName("user").setDescription("\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C").setRequired(true)).addStringOption((option) => option.setName("tone-bias").setDescription("neutral, friendly, sharp, playful")).addIntegerOption((option) => option.setName("roast-level").setDescription("0-5").setMinValue(0).setMaxValue(5)).addIntegerOption((option) => option.setName("praise-bias").setDescription("0-5").setMinValue(0).setMaxValue(5)).addIntegerOption((option) => option.setName("interrupt-priority").setDescription("0-5").setMinValue(0).setMaxValue(5)).addBooleanOption((option) => option.setName("do-not-mock").setDescription("\u041D\u0435 \u043F\u043E\u0434\u043A\u0430\u043B\u044B\u0432\u0430\u0442\u044C")).addBooleanOption((option) => option.setName("do-not-initiate").setDescription("\u041D\u0435 \u0438\u043D\u0438\u0446\u0438\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043E\u0431\u0449\u0435\u043D\u0438\u0435")).addStringOption((option) => option.setName("protected-topics").setDescription("CSV protected topics")),
  new import_discord2.SlashCommandBuilder().setName("bot-feature").setDescription("\u041F\u0435\u0440\u0435\u043A\u043B\u044E\u0447\u0438\u0442\u044C feature flag").addStringOption(
    (option) => option.setName("key").setDescription("\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0444\u043B\u0430\u0433\u0430").setRequired(true).addChoices(
      { name: "web_search", value: "web_search" },
      { name: "auto_interject", value: "auto_interject" },
      { name: "user_profiles", value: "user_profiles" },
      { name: "context_actions", value: "context_actions" },
      { name: "roast", value: "roast" },
      { name: "context_v2_enabled", value: "context_v2_enabled" },
      { name: "context_confidence_enabled", value: "context_confidence_enabled" },
      { name: "topic_engine_enabled", value: "topic_engine_enabled" },
      { name: "affinity_signals_enabled", value: "affinity_signals_enabled" },
      { name: "mood_engine_enabled", value: "mood_engine_enabled" },
      { name: "reply_queue_enabled", value: "reply_queue_enabled" },
      { name: "media_reactions_enabled", value: "media_reactions_enabled" },
      { name: "runtime_config_cache_enabled", value: "runtime_config_cache_enabled" },
      { name: "embedding_cache_enabled", value: "embedding_cache_enabled" },
      { name: "channel_aware_mode", value: "channel_aware_mode" },
      { name: "message_kind_aware_mode", value: "message_kind_aware_mode" },
      { name: "anti_slop_strict_mode", value: "anti_slop_strict_mode" },
      { name: "playful_mode_enabled", value: "playful_mode_enabled" },
      { name: "irritated_mode_enabled", value: "irritated_mode_enabled" },
      { name: "ideological_flavour_enabled", value: "ideological_flavour_enabled" },
      { name: "analogy_ban_enabled", value: "analogy_ban_enabled" },
      { name: "slang_layer_enabled", value: "slang_layer_enabled" },
      { name: "self_interjection_constraints_enabled", value: "self_interjection_constraints_enabled" }
    )
  ).addBooleanOption((option) => option.setName("enabled").setDescription("\u0412\u043A\u043B\u044E\u0447\u0438\u0442\u044C/\u0432\u044B\u043A\u043B\u044E\u0447\u0438\u0442\u044C").setRequired(true)),
  new import_discord2.SlashCommandBuilder().setName("bot-debug").setDescription("\u041F\u043E\u043B\u0443\u0447\u0438\u0442\u044C debug trace \u043F\u043E \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044E").addStringOption((option) => option.setName("message-id").setDescription("ID \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F").setRequired(true)),
  new import_discord2.SlashCommandBuilder().setName("bot-profile").setDescription("\u041F\u043E\u0441\u043C\u043E\u0442\u0440\u0435\u0442\u044C \u043F\u0440\u043E\u0444\u0438\u043B\u044C \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F").addUserOption((option) => option.setName("user").setDescription("\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C").setRequired(true)),
  new import_discord2.SlashCommandBuilder().setName("bot-channel").setDescription("\u041D\u0430\u0441\u0442\u0440\u043E\u0438\u0442\u044C \u043A\u0430\u043D\u0430\u043B").addChannelOption(
    (option) => option.setName("channel").setDescription("\u041A\u0430\u043D\u0430\u043B").addChannelTypes(import_discord2.ChannelType.GuildText, import_discord2.ChannelType.PublicThread, import_discord2.ChannelType.PrivateThread).setRequired(true)
  ).addBooleanOption((option) => option.setName("allow-bot-replies").setDescription("\u0420\u0430\u0437\u0440\u0435\u0448\u0438\u0442\u044C \u043E\u0442\u0432\u0435\u0442\u044B")).addBooleanOption((option) => option.setName("allow-interjections").setDescription("\u0420\u0430\u0437\u0440\u0435\u0448\u0438\u0442\u044C \u0430\u0432\u0442\u043E\u0432\u043C\u0435\u0448\u0430\u0442\u0435\u043B\u044C\u0441\u0442\u0432\u0430")).addBooleanOption((option) => option.setName("is-muted").setDescription("\u0425\u043E\u0440\u0438 \u0434\u043E\u043B\u0436\u043D\u0430 \u043C\u043E\u043B\u0447\u0430\u0442\u044C")).addStringOption((option) => option.setName("topic-interest-tags").setDescription("CSV tags")),
  new import_discord2.SlashCommandBuilder().setName("bot-summary").setDescription("\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u043F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u0435 channel summaries").addChannelOption(
    (option) => option.setName("channel").setDescription("\u041A\u0430\u043D\u0430\u043B").addChannelTypes(import_discord2.ChannelType.GuildText, import_discord2.ChannelType.PublicThread, import_discord2.ChannelType.PrivateThread).setRequired(true)
  ),
  new import_discord2.SlashCommandBuilder().setName("bot-stats").setDescription("\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u043D\u0435\u0434\u0435\u043B\u044C\u043D\u0443\u044E \u0441\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043A\u0443"),
  new import_discord2.SlashCommandBuilder().setName("bot-topic").setDescription("\u041F\u043E\u0441\u043C\u043E\u0442\u0440\u0435\u0442\u044C \u0438\u043B\u0438 \u0441\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u0430\u043A\u0442\u0438\u0432\u043D\u0443\u044E \u0442\u0435\u043C\u0443").addSubcommand(
    (subcommand) => subcommand.setName("status").setDescription("\u0410\u043A\u0442\u0438\u0432\u043D\u0430\u044F \u0442\u0435\u043C\u0430 \u043A\u0430\u043D\u0430\u043B\u0430").addChannelOption(
      (option) => option.setName("channel").setDescription("\u041A\u0430\u043D\u0430\u043B").addChannelTypes(import_discord2.ChannelType.GuildText, import_discord2.ChannelType.PublicThread, import_discord2.ChannelType.PrivateThread)
    )
  ).addSubcommand(
    (subcommand) => subcommand.setName("reset").setDescription("\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u0430\u043A\u0442\u0438\u0432\u043D\u0443\u044E \u0442\u0435\u043C\u0443").addChannelOption(
      (option) => option.setName("channel").setDescription("\u041A\u0430\u043D\u0430\u043B").addChannelTypes(import_discord2.ChannelType.GuildText, import_discord2.ChannelType.PublicThread, import_discord2.ChannelType.PrivateThread)
    )
  ),
  new import_discord2.SlashCommandBuilder().setName("bot-mood").setDescription("\u0423\u043F\u0440\u0430\u0432\u043B\u044F\u0442\u044C mood Hori").addSubcommand((subcommand) => subcommand.setName("status").setDescription("\u0422\u0435\u043A\u0443\u0449\u0438\u0439 mood")).addSubcommand(
    (subcommand) => subcommand.setName("set").setDescription("\u0417\u0430\u0434\u0430\u0442\u044C mood").addStringOption(
      (option) => option.setName("mode").setDescription("\u0420\u0435\u0436\u0438\u043C").setRequired(true).addChoices(
        { name: "normal", value: "normal" },
        { name: "playful", value: "playful" },
        { name: "dry", value: "dry" },
        { name: "irritated", value: "irritated" },
        { name: "focused", value: "focused" },
        { name: "sleepy", value: "sleepy" },
        { name: "detached", value: "detached" }
      )
    ).addIntegerOption((option) => option.setName("minutes").setDescription("\u0421\u043A\u043E\u043B\u044C\u043A\u043E \u043C\u0438\u043D\u0443\u0442").setMinValue(1).setMaxValue(1440)).addStringOption((option) => option.setName("reason").setDescription("\u041F\u0440\u0438\u0447\u0438\u043D\u0430"))
  ).addSubcommand((subcommand) => subcommand.setName("clear").setDescription("\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C mood")),
  new import_discord2.SlashCommandBuilder().setName("bot-queue").setDescription("\u0423\u043F\u0440\u0430\u0432\u043B\u044F\u0442\u044C reply queue").addSubcommand(
    (subcommand) => subcommand.setName("status").setDescription("\u0421\u0442\u0430\u0442\u0443\u0441 \u043E\u0447\u0435\u0440\u0435\u0434\u0438").addChannelOption(
      (option) => option.setName("channel").setDescription("\u041A\u0430\u043D\u0430\u043B").addChannelTypes(import_discord2.ChannelType.GuildText, import_discord2.ChannelType.PublicThread, import_discord2.ChannelType.PrivateThread)
    )
  ).addSubcommand(
    (subcommand) => subcommand.setName("clear").setDescription("\u041E\u0447\u0438\u0441\u0442\u0438\u0442\u044C \u043E\u0447\u0435\u0440\u0435\u0434\u044C").addChannelOption(
      (option) => option.setName("channel").setDescription("\u041A\u0430\u043D\u0430\u043B").addChannelTypes(import_discord2.ChannelType.GuildText, import_discord2.ChannelType.PublicThread, import_discord2.ChannelType.PrivateThread)
    )
  ),
  new import_discord2.SlashCommandBuilder().setName("bot-media").setDescription("\u0423\u043F\u0440\u0430\u0432\u043B\u044F\u0442\u044C media registry").addSubcommand(
    (subcommand) => subcommand.setName("add").setDescription("\u0417\u0430\u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 media-\u0444\u0430\u0439\u043B").addStringOption((option) => option.setName("id").setDescription("media id").setRequired(true)).addStringOption(
      (option) => option.setName("type").setDescription("\u0422\u0438\u043F").setRequired(true).addChoices(
        { name: "image", value: "image" },
        { name: "gif", value: "gif" },
        { name: "video", value: "video" },
        { name: "audio", value: "audio" }
      )
    ).addStringOption((option) => option.setName("path").setDescription("\u0410\u0431\u0441\u043E\u043B\u044E\u0442\u043D\u044B\u0439 \u043F\u0443\u0442\u044C \u043A \u0444\u0430\u0439\u043B\u0443").setRequired(true)).addStringOption((option) => option.setName("trigger-tags").setDescription("CSV trigger tags")).addStringOption((option) => option.setName("tone-tags").setDescription("CSV tone tags")).addStringOption((option) => option.setName("channels").setDescription("CSV channel kinds")).addStringOption((option) => option.setName("moods").setDescription("CSV moods")).addBooleanOption((option) => option.setName("nsfw").setDescription("NSFW"))
  ).addSubcommand((subcommand) => subcommand.setName("list").setDescription("\u0421\u043F\u0438\u0441\u043E\u043A media")).addSubcommand(
    (subcommand) => subcommand.setName("disable").setDescription("\u041E\u0442\u043A\u043B\u044E\u0447\u0438\u0442\u044C media").addStringOption((option) => option.setName("id").setDescription("media id").setRequired(true))
  ),
  new import_discord2.SlashCommandBuilder().setName("bot-ai-url").setDescription("\u0421\u043C\u0435\u043D\u0438\u0442\u044C Ollama URL (\u0442\u043E\u043B\u044C\u043A\u043E \u0432\u043B\u0430\u0434\u0435\u043B\u0435\u0446 \u0431\u043E\u0442\u0430)").addStringOption((option) => option.setName("url").setDescription("\u041D\u043E\u0432\u044B\u0439 URL (https://...)").setRequired(true))
].map((command) => command.toJSON());
var contextMenuDefinitions = [
  new import_discord2.ContextMenuCommandBuilder().setName(import_shared.CONTEXT_ACTIONS.explain).setType(import_discord2.ApplicationCommandType.Message),
  new import_discord2.ContextMenuCommandBuilder().setName(import_shared.CONTEXT_ACTIONS.summarize).setType(import_discord2.ApplicationCommandType.Message),
  new import_discord2.ContextMenuCommandBuilder().setName(import_shared.CONTEXT_ACTIONS.tone).setType(import_discord2.ApplicationCommandType.Message)
].map((command) => command.toJSON());

// src/router/interaction-router.ts
var import_discord3 = require("discord.js");
var import_shared2 = require("@hori/shared");
function ensureModerator(interaction) {
  return interaction.memberPermissions?.has(import_discord3.PermissionFlagsBits.ManageGuild) ?? false;
}
async function routeInteraction(runtime, interaction) {
  if (interaction.isChatInputCommand()) {
    if (!interaction.guildId) {
      await interaction.reply({ content: "\u0422\u043E\u043B\u044C\u043A\u043E \u0432\u043D\u0443\u0442\u0440\u0438 \u0441\u0435\u0440\u0432\u0435\u0440\u0430.", flags: import_discord3.MessageFlags.Ephemeral });
      return;
    }
    const isModerator = ensureModerator(interaction);
    if (!isModerator && interaction.commandName !== "bot-help") {
      await interaction.reply({ content: "\u042D\u0442\u043E \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u043C\u043E\u0434\u0435\u0440\u043E\u0432.", flags: import_discord3.MessageFlags.Ephemeral });
      return;
    }
    switch (interaction.commandName) {
      case "bot-help":
        await interaction.reply({ content: await runtime.slashAdmin.handleHelp(), flags: import_discord3.MessageFlags.Ephemeral });
        return;
      case "bot-ai-url": {
        const isOwner = runtime.env.DISCORD_OWNER_IDS.includes(interaction.user.id);
        if (!isOwner) {
          await interaction.reply({ content: "\u042D\u0442\u0430 \u043A\u043E\u043C\u0430\u043D\u0434\u0430 \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u0432\u043B\u0430\u0434\u0435\u043B\u044C\u0446\u0430 \u0431\u043E\u0442\u0430.", flags: import_discord3.MessageFlags.Ephemeral });
          return;
        }
        const newUrl = interaction.options.getString("url", true).trim();
        try {
          new URL(newUrl);
        } catch {
          await interaction.reply({ content: `\u041D\u0435\u0432\u0430\u043B\u0438\u0434\u043D\u044B\u0439 URL: ${newUrl}`, flags: import_discord3.MessageFlags.Ephemeral });
          return;
        }
        const oldUrl = runtime.env.OLLAMA_BASE_URL ?? "(\u043D\u0435 \u0437\u0430\u0434\u0430\u043D)";
        await interaction.deferReply({ flags: import_discord3.MessageFlags.Ephemeral });
        let status = "\u23F3 \u043F\u0440\u043E\u0432\u0435\u0440\u044F\u044E...";
        let appliedUrl = oldUrl;
        try {
          const probe = await fetch(new URL("/api/tags", newUrl), { signal: AbortSignal.timeout(5e3) });
          if (probe.ok) {
            const data = await probe.json();
            const models = data.models?.map((m) => m.name).join(", ") ?? "?";
            runtime.env.OLLAMA_BASE_URL = newUrl;
            appliedUrl = newUrl;
            status = `\u2705 Ollama \u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D (\u043C\u043E\u0434\u0435\u043B\u0438: ${models})`;
            try {
              await (0, import_shared2.persistOllamaBaseUrl)(runtime.prisma, newUrl, interaction.user.id);
              status += "\n\u{1F4BE} URL \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D \u0438 \u043F\u0435\u0440\u0435\u0436\u0438\u0432\u0451\u0442 \u0440\u0435\u0441\u0442\u0430\u0440\u0442.";
            } catch (error) {
              runtime.logger.warn({ error: (0, import_shared2.asErrorMessage)(error), url: newUrl }, "failed to persist ollama url");
              status += "\n\u26A0\uFE0F URL \u043F\u0440\u0438\u043C\u0435\u043D\u0451\u043D \u0442\u043E\u043B\u044C\u043A\u043E \u0432 \u043F\u0430\u043C\u044F\u0442\u0438 \u043F\u0440\u043E\u0446\u0435\u0441\u0441\u0430. \u041F\u043E\u0441\u043B\u0435 \u0440\u0435\u0441\u0442\u0430\u0440\u0442\u0430 \u043F\u043E\u043D\u0430\u0434\u043E\u0431\u0438\u0442\u0441\u044F \u0437\u0430\u0434\u0430\u0442\u044C \u0435\u0433\u043E \u0441\u043D\u043E\u0432\u0430.";
            }
          } else {
            status = `\u274C URL \u043D\u0435 \u043F\u0440\u0438\u043C\u0435\u043D\u0451\u043D: Ollama \u0432\u0435\u0440\u043D\u0443\u043B ${probe.status}`;
          }
        } catch (err) {
          status = `\u274C URL \u043D\u0435 \u043F\u0440\u0438\u043C\u0435\u043D\u0451\u043D: ${err instanceof Error ? err.message : "unknown"}`;
        }
        await interaction.editReply({
          content: `AI URL ${appliedUrl === newUrl ? "\u043E\u0431\u043D\u043E\u0432\u043B\u0451\u043D" : "\u043D\u0435 \u0438\u0437\u043C\u0435\u043D\u0451\u043D"}
\u0422\u0435\u043A\u0443\u0449\u0438\u0439: \`${appliedUrl}\`
\u041F\u0440\u043E\u0432\u0435\u0440\u044F\u043B\u0438: \`${newUrl}\`

${status}`
        });
        return;
      }
      case "bot-style":
        await interaction.reply({
          content: await runtime.slashAdmin.updateStyle(interaction.guildId, {
            botName: interaction.options.getString("bot-name"),
            roughnessLevel: interaction.options.getInteger("roughness"),
            sarcasmLevel: interaction.options.getInteger("sarcasm"),
            roastLevel: interaction.options.getInteger("roast"),
            replyLength: interaction.options.getString("reply-length"),
            preferredStyle: interaction.options.getString("preferred-style"),
            forbiddenWords: interaction.options.getString("forbidden-words"),
            forbiddenTopics: interaction.options.getString("forbidden-topics")
          }),
          flags: import_discord3.MessageFlags.Ephemeral
        });
        return;
      case "bot-memory": {
        const subcommand = interaction.options.getSubcommand();
        const key = interaction.options.getString("key", true);
        const content = subcommand === "remember" ? await runtime.slashAdmin.remember(
          interaction.guildId,
          interaction.user.id,
          key,
          interaction.options.getString("value", true)
        ) : await runtime.slashAdmin.forget(interaction.guildId, key);
        await interaction.reply({ content, flags: import_discord3.MessageFlags.Ephemeral });
        return;
      }
      case "bot-relationship":
        await interaction.reply({
          content: await runtime.slashAdmin.updateRelationship(
            interaction.guildId,
            interaction.options.getUser("user", true).id,
            interaction.user.id,
            {
              toneBias: interaction.options.getString("tone-bias") ?? "neutral",
              roastLevel: interaction.options.getInteger("roast-level") ?? 0,
              praiseBias: interaction.options.getInteger("praise-bias") ?? 0,
              interruptPriority: interaction.options.getInteger("interrupt-priority") ?? 0,
              doNotMock: interaction.options.getBoolean("do-not-mock") ?? false,
              doNotInitiate: interaction.options.getBoolean("do-not-initiate") ?? false,
              protectedTopics: (interaction.options.getString("protected-topics") ?? "").split(",").map((part) => part.trim()).filter(Boolean)
            }
          ),
          flags: import_discord3.MessageFlags.Ephemeral
        });
        return;
      case "bot-feature":
        await interaction.reply({
          content: await runtime.slashAdmin.updateFeature(
            interaction.guildId,
            interaction.options.getString("key", true),
            interaction.options.getBoolean("enabled", true)
          ),
          flags: import_discord3.MessageFlags.Ephemeral
        });
        return;
      case "bot-debug":
        await interaction.reply({
          content: await runtime.slashAdmin.debugTrace(interaction.options.getString("message-id", true)),
          flags: import_discord3.MessageFlags.Ephemeral
        });
        return;
      case "bot-profile":
        await interaction.reply({
          content: await runtime.slashAdmin.profile(interaction.guildId, interaction.options.getUser("user", true).id),
          flags: import_discord3.MessageFlags.Ephemeral
        });
        return;
      case "bot-channel":
        await interaction.reply({
          content: await runtime.slashAdmin.channelConfig(
            interaction.guildId,
            interaction.options.getChannel("channel", true).id,
            {
              allowBotReplies: interaction.options.getBoolean("allow-bot-replies"),
              allowInterjections: interaction.options.getBoolean("allow-interjections"),
              isMuted: interaction.options.getBoolean("is-muted"),
              topicInterestTags: interaction.options.getString("topic-interest-tags")
            }
          ),
          flags: import_discord3.MessageFlags.Ephemeral
        });
        return;
      case "bot-summary":
        await interaction.reply({
          content: await runtime.slashAdmin.summary(interaction.guildId, interaction.options.getChannel("channel", true).id),
          flags: import_discord3.MessageFlags.Ephemeral
        });
        return;
      case "bot-stats":
        await interaction.reply({ content: await runtime.slashAdmin.stats(interaction.guildId), flags: import_discord3.MessageFlags.Ephemeral });
        return;
      case "bot-topic": {
        const channelId = interaction.options.getChannel("channel")?.id ?? interaction.channelId;
        const content = interaction.options.getSubcommand() === "reset" ? await runtime.slashAdmin.topicReset(interaction.guildId, channelId) : await runtime.slashAdmin.topicStatus(interaction.guildId, channelId);
        await interaction.reply({ content, flags: import_discord3.MessageFlags.Ephemeral });
        return;
      }
      case "bot-mood": {
        const subcommand = interaction.options.getSubcommand();
        const content = subcommand === "set" ? await runtime.slashAdmin.moodSet(
          interaction.guildId,
          interaction.options.getString("mode", true),
          interaction.options.getInteger("minutes") ?? 60,
          interaction.options.getString("reason")
        ) : subcommand === "clear" ? await runtime.slashAdmin.moodClear(interaction.guildId) : await runtime.slashAdmin.moodStatus(interaction.guildId);
        await interaction.reply({ content, flags: import_discord3.MessageFlags.Ephemeral });
        return;
      }
      case "bot-queue": {
        const channelId = interaction.options.getChannel("channel")?.id ?? null;
        const content = interaction.options.getSubcommand() === "clear" ? await runtime.slashAdmin.queueClear(interaction.guildId, channelId) : await runtime.slashAdmin.queueStatus(interaction.guildId, channelId);
        await interaction.reply({ content, flags: import_discord3.MessageFlags.Ephemeral });
        return;
      }
      case "bot-media": {
        const subcommand = interaction.options.getSubcommand();
        const content = subcommand === "add" ? await runtime.slashAdmin.mediaAdd({
          mediaId: interaction.options.getString("id", true),
          type: interaction.options.getString("type", true),
          filePath: interaction.options.getString("path", true),
          triggerTags: interaction.options.getString("trigger-tags"),
          toneTags: interaction.options.getString("tone-tags"),
          allowedChannels: interaction.options.getString("channels"),
          allowedMoods: interaction.options.getString("moods"),
          nsfw: interaction.options.getBoolean("nsfw")
        }) : subcommand === "disable" ? await runtime.slashAdmin.mediaDisable(interaction.options.getString("id", true)) : await runtime.slashAdmin.mediaList();
        await interaction.reply({ content, flags: import_discord3.MessageFlags.Ephemeral });
        return;
      }
      default:
        await interaction.reply({ content: "\u041D\u0435 \u0437\u043D\u0430\u044E \u0442\u0430\u043A\u0443\u044E \u043A\u043E\u043C\u0430\u043D\u0434\u0443.", flags: import_discord3.MessageFlags.Ephemeral });
        return;
    }
  }
  if (!interaction.isMessageContextMenuCommand() || !interaction.guildId) {
    return;
  }
  const featureFlags = await runtime.runtimeConfig.getFeatureFlags(interaction.guildId);
  if (!featureFlags.contextActions) {
    await interaction.reply({ content: "\u041A\u043E\u043D\u0442\u0435\u043A\u0441\u0442\u043D\u044B\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044F \u0432\u044B\u043A\u043B\u044E\u0447\u0435\u043D\u044B.", flags: import_discord3.MessageFlags.Ephemeral });
    return;
  }
  const action = interaction.commandName === import_shared2.CONTEXT_ACTIONS.explain ? "explain" : interaction.commandName === import_shared2.CONTEXT_ACTIONS.summarize ? "summarize" : "tone";
  const result = await runtime.orchestrator.handleContextAction({
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    requesterId: interaction.user.id,
    requesterIsModerator: ensureModerator(interaction),
    action,
    sourceMessageId: interaction.targetId
  });
  await interaction.reply({ content: result, flags: import_discord3.MessageFlags.Ephemeral });
}

// src/router/message-router.ts
var import_discord4 = require("discord.js");
var import_analytics = require("@hori/analytics");
var import_core = require("@hori/core");

// src/router/background-jobs.ts
var import_shared3 = require("@hori/shared");
async function enqueueBackgroundJobs(runtime, envelope) {
  const jobs = [
    {
      queue: "summary",
      task: runtime.queues.summary.add(
        "summary",
        { guildId: envelope.guildId, channelId: envelope.channelId },
        { jobId: `summary:${envelope.guildId}:${envelope.channelId}` }
      )
    },
    {
      queue: "profile",
      task: runtime.queues.profile.add(
        "profile",
        { guildId: envelope.guildId, userId: envelope.userId },
        { jobId: `profile:${envelope.guildId}:${envelope.userId}` }
      )
    },
    {
      queue: "embedding",
      task: envelope.content.length >= runtime.env.MESSAGE_EMBED_MIN_CHARS ? runtime.queues.embedding.add(
        "embedding",
        { entityType: "message", entityId: envelope.messageId },
        { jobId: `embedding:${envelope.messageId}` }
      ) : Promise.resolve()
    },
    {
      queue: "topic",
      task: runtime.queues.topic.add(
        "topic",
        { guildId: envelope.guildId, channelId: envelope.channelId, messageId: envelope.messageId },
        { jobId: `topic:${envelope.messageId}` }
      )
    }
  ];
  const results = await Promise.allSettled(jobs.map((job) => job.task));
  for (const [index, result] of results.entries()) {
    if (result.status === "rejected") {
      runtime.logger.warn(
        {
          queue: jobs[index]?.queue,
          messageId: envelope.messageId,
          error: (0, import_shared3.asErrorMessage)(result.reason)
        },
        "background queue enqueue failed"
      );
    }
  }
}

// src/responders/message-responder.ts
var import_shared4 = require("@hori/shared");
async function sendReply(message, reply) {
  const text = typeof reply === "string" ? reply : reply.text;
  const media = typeof reply === "string" ? null : reply.media;
  const chunks = (0, import_shared4.splitLongMessage)(text);
  for (let index = 0; index < chunks.length; index += 1) {
    if (index === 0) {
      await message.reply(media ? mediaReplyPayload(chunks[index], media.filePath) : chunks[index]);
    } else if ("send" in message.channel) {
      await message.channel.send(chunks[index]);
    }
  }
}
function mediaReplyPayload(content, filePath) {
  return content ? { content, files: [filePath] } : { files: [filePath] };
}

// src/router/message-router.ts
var intentRouter = new import_core.IntentRouter();
var inboundDebouncers = /* @__PURE__ */ new Map();
async function detectTriggerSource(message, botName, botId) {
  const content = message.content.trim();
  if (message.mentions.has(botId)) {
    return { triggerSource: "mention", wasMentioned: true, implicitMentionKinds: [] };
  }
  if (message.reference?.messageId) {
    try {
      const referenced = await message.fetchReference();
      if (referenced.author.id === botId) {
        return { triggerSource: "reply", wasMentioned: false, implicitMentionKinds: ["reply_to_bot"] };
      }
    } catch {
      return { triggerSource: void 0, wasMentioned: false, implicitMentionKinds: [] };
    }
  }
  if (new RegExp(`^${escapeRegExp(botName)}[,:!\\s-]*`, "i").test(content)) {
    return { triggerSource: "name", wasMentioned: false, implicitMentionKinds: ["name_in_text"] };
  }
  return { triggerSource: void 0, wasMentioned: false, implicitMentionKinds: [] };
}
async function shouldAutoInterject(runtime, message) {
  if (!message.guildId) {
    return false;
  }
  const recentCount = await runtime.prisma.interjectionLog.count({
    where: {
      guildId: message.guildId,
      channelId: message.channelId,
      createdAt: {
        gte: new Date(Date.now() - 60 * 60 * 1e3)
      }
    }
  });
  if (recentCount >= runtime.env.AUTOINTERJECT_MAX_PER_HOUR) {
    return false;
  }
  const recentInterjection = await runtime.prisma.interjectionLog.findFirst({
    where: {
      guildId: message.guildId,
      channelId: message.channelId
    },
    orderBy: { createdAt: "desc" }
  });
  if (recentInterjection && Date.now() - recentInterjection.createdAt.getTime() < runtime.env.AUTOINTERJECT_COOLDOWN_SEC * 1e3) {
    return false;
  }
  return /что думаете|кто прав|мнение|как считаете/i.test(message.content);
}
async function routeMessage(runtime, message) {
  if (!message.inGuild() || message.author.bot || !runtime.client.user) {
    return;
  }
  const routingConfig = await runtime.runtimeConfig.getRoutingConfig(message.guildId, message.channelId);
  const botName = routingConfig.guildSettings.botName;
  const botId = runtime.client.user.id;
  const member = message.member ?? await message.guild.members.fetch(message.author.id);
  const triggerContext = await detectTriggerSource(message, botName, botId);
  const activation = (0, import_core.resolveActivation)(
    {
      canDetectMention: true,
      wasMentioned: triggerContext.wasMentioned,
      hasAnyMention: message.mentions.users.size > 0,
      implicitMentionKinds: [
        ...(0, import_core.implicitMentionKindWhen)("reply_to_bot", triggerContext.implicitMentionKinds.includes("reply_to_bot")),
        ...(0, import_core.implicitMentionKindWhen)("name_in_text", triggerContext.implicitMentionKinds.includes("name_in_text"))
      ]
    },
    {
      isGroup: true,
      requireMention: true,
      allowedImplicitMentionKinds: ["reply_to_bot", "name_in_text"],
      allowTextCommands: true,
      hasControlCommand: /^(запомни|забудь)\b/i.test(message.content.trim()),
      commandAuthorized: member.permissions.has(import_discord4.PermissionFlagsBits.ManageGuild)
    }
  );
  const triggerSource = triggerContext.triggerSource ?? (activation.shouldBypassMention ? "name" : void 0);
  const explicitInvocation = activation.effectiveWasMentioned;
  const autoInterject = !explicitInvocation && routingConfig.featureFlags.autoInterject && routingConfig.channelPolicy.allowInterjections && !routingConfig.channelPolicy.isMuted && (!runtime.env.AUTOINTERJECT_CHANNEL_ALLOWLIST.length || runtime.env.AUTOINTERJECT_CHANNEL_ALLOWLIST.includes(message.channelId)) && await shouldAutoInterject(runtime, message);
  const envelope = buildEnvelope(message, member, botName, botId, triggerSource, explicitInvocation, autoInterject);
  await runtime.ingestService.ingestMessage({
    ...envelope,
    guildName: message.guild.name,
    channelName: envelope.channelName,
    isBotUser: false
  });
  (0, import_analytics.trackIngestedMessage)();
  await enqueueBackgroundJobs(runtime, envelope);
  if (!explicitInvocation && !autoInterject) {
    return;
  }
  if (routingConfig.channelPolicy.isMuted || !routingConfig.channelPolicy.allowBotReplies) {
    await runtime.prisma.botEventLog.create({
      data: {
        guildId: envelope.guildId,
        channelId: envelope.channelId,
        messageId: envelope.messageId,
        userId: envelope.userId,
        eventType: "suppressed",
        intent: explicitInvocation ? "chat" : "ignore",
        routeReason: routingConfig.channelPolicy.isMuted ? "channel muted" : "channel replies disabled",
        usedSearch: false,
        relationshipApplied: false,
        debugTrace: {
          triggerSource: envelope.triggerSource,
          explicitInvocation,
          policy: routingConfig.channelPolicy
        }
      }
    });
    return;
  }
  const allowDebounce = explicitInvocation && (triggerSource === "reply" || triggerSource === "name");
  if ((0, import_core.shouldDebounce)({ text: message.content, hasMedia: message.attachments.size > 0, allowDebounce })) {
    const debouncer = getOrCreateInboundDebouncer(message.channelId);
    await debouncer.enqueue({ runtime, message, routingConfig, triggerSource });
    return;
  }
  await processInvocation(runtime, message, routingConfig, triggerSource, autoInterject);
}
function buildEnvelope(message, member, botName, botId, triggerSource, explicitInvocation, autoInterject, contentOverride) {
  const guildId = message.guildId;
  if (!guildId) {
    throw new Error("Cannot build a guild message envelope without a guildId");
  }
  return {
    messageId: message.id,
    guildId,
    channelId: message.channelId,
    userId: message.author.id,
    username: message.author.username,
    displayName: member.displayName,
    channelName: "name" in message.channel ? message.channel.name : null,
    content: contentOverride ?? message.content,
    createdAt: message.createdAt,
    replyToMessageId: message.reference?.messageId ?? null,
    mentionCount: message.mentions.users.size,
    mentionedBot: message.mentions.has(botId),
    mentionsBotByName: new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escapeRegExp(botName)}(?=$|[^\\p{L}\\p{N}_])`, "iu").test(message.content),
    mentionedUserIds: [...message.mentions.users.keys()],
    triggerSource: triggerSource ?? (autoInterject ? "auto_interject" : void 0),
    isModerator: member.permissions.has(import_discord4.PermissionFlagsBits.ManageGuild),
    explicitInvocation
  };
}
async function processInvocation(runtime, message, routingConfig, triggerSource, autoInterject, contentOverride) {
  if (!message.inGuild() || !runtime.client.user) {
    return;
  }
  const member = message.member ?? await message.guild.members.fetch(message.author.id);
  const botName = routingConfig.guildSettings.botName;
  const botId = runtime.client.user.id;
  const explicitInvocation = Boolean(triggerSource) || /^(запомни|забудь)\b/i.test((contentOverride ?? message.content).trim());
  const envelope = buildEnvelope(message, member, botName, botId, triggerSource, explicitInvocation, autoInterject, contentOverride);
  const preliminaryIntent = intentRouter.route(envelope, botName);
  const queueMessageKind = (0, import_core.detectMessageKind)({
    content: preliminaryIntent.cleanedContent,
    intent: preliminaryIntent.intent,
    message: envelope
  });
  let queueItemId = null;
  let queueTrace = { enabled: false, action: "none" };
  if (routingConfig.featureFlags.replyQueueEnabled) {
    queueTrace = await runtime.replyQueue.claimOrQueue({
      guildId: envelope.guildId,
      channelId: envelope.channelId,
      sourceMsgId: envelope.messageId,
      targetUserId: envelope.userId,
      messageKind: queueMessageKind,
      mentionCount: Math.max(1, envelope.mentionCount),
      createdAt: envelope.createdAt,
      triggerSource: envelope.triggerSource,
      explicitInvocation
    });
    if (queueTrace.action === "dropped") {
      return;
    }
    if (queueTrace.action === "busy_ack") {
      await sendReply(message, "\u0429\u0430, \u044F \u0435\u0449\u0451 \u043F\u0440\u043E\u0448\u043B\u043E\u0435 \u0434\u043E\u0436\u0451\u0432\u044B\u0432\u0430\u044E. \u041F\u043E\u0434\u043E\u0436\u0434\u0438 \u0447\u0443\u0442\u044C.");
      return;
    }
    queueItemId = queueTrace.itemId ?? null;
  }
  const result = await runtime.orchestrator.handleMessage(envelope, routingConfig, queueTrace);
  if (!result.reply) {
    if (queueItemId) {
      await runtime.replyQueue.complete(queueItemId);
      await drainReplyQueue(runtime, message);
    }
    return;
  }
  await sendReply(message, result.reply);
  if (queueItemId) {
    await runtime.replyQueue.complete(queueItemId);
    await drainReplyQueue(runtime, message);
  }
  if (autoInterject) {
    await runtime.prisma.interjectionLog.create({
      data: {
        guildId: envelope.guildId,
        channelId: envelope.channelId,
        userId: envelope.userId,
        reason: "auto_interject",
        confidence: 0.8,
        outcome: "sent"
      }
    });
  }
}
function getOrCreateInboundDebouncer(channelId) {
  const existing = inboundDebouncers.get(channelId);
  if (existing) {
    return existing;
  }
  const debouncer = (0, import_core.createChannelDebouncer)(channelId, import_core.DEFAULT_DEBOUNCE, {
    buildKey: (item) => `${item.message.channelId}:${item.message.author.id}`,
    onFlush: async (items) => {
      const latest = items.at(-1);
      if (!latest) {
        return;
      }
      const combinedContent = items.map((item) => item.message.content.trim()).filter(Boolean).join("\n");
      await processInvocation(latest.runtime, latest.message, latest.routingConfig, latest.triggerSource, false, combinedContent);
    }
  });
  inboundDebouncers.set(channelId, debouncer);
  return debouncer;
}
async function drainReplyQueue(runtime, message) {
  if (!message.guildId) {
    return;
  }
  const next = await runtime.replyQueue.nextQueued(message.guildId, message.channelId);
  if (!next) {
    return;
  }
  try {
    const queuedMessage = await message.channel.messages.fetch(next.sourceMsgId);
    await routeMessage(runtime, queuedMessage);
  } catch (error) {
    await runtime.replyQueue.complete(next.id);
    runtime.logger.warn({ error, sourceMsgId: next.sourceMsgId }, "queued reply source message could not be fetched");
  }
}
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// src/events/register-events.ts
async function syncCommands(runtime) {
  const rest = new import_discord5.REST({ version: "10" }).setToken(runtime.env.DISCORD_TOKEN);
  const body = [...slashCommandDefinitions, ...contextMenuDefinitions];
  if (runtime.env.DISCORD_DEV_GUILD_ID) {
    await rest.put(
      import_discord5.Routes.applicationGuildCommands(runtime.env.DISCORD_CLIENT_ID, runtime.env.DISCORD_DEV_GUILD_ID),
      { body }
    );
    runtime.logger.info({ scope: "guild", guildId: runtime.env.DISCORD_DEV_GUILD_ID }, "discord commands synced");
    return;
  }
  await rest.put(import_discord5.Routes.applicationCommands(runtime.env.DISCORD_CLIENT_ID), { body });
  runtime.logger.info({ scope: "global" }, "discord commands synced");
}
function registerEvents(runtime) {
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
      if (interaction.isChatInputCommand() || interaction.isMessageContextMenuCommand()) {
        await routeInteraction(runtime, interaction);
      }
    } catch (error) {
      runtime.logger.error({ error }, "interaction handler failed");
      if (interaction.isRepliable() && !interaction.replied) {
        await interaction.reply({ content: "\u0427\u0442\u043E-\u0442\u043E \u0441\u043B\u043E\u043C\u0430\u043B\u043E\u0441\u044C.", flags: import_discord5.MessageFlags.Ephemeral });
      }
    }
  });
}

// src/bootstrap.ts
function createNoopQueues(logger, prefix) {
  let warned = false;
  const createNoopQueue = (queueName) => ({
    async add(jobName) {
      if (!warned) {
        warned = true;
        logger.warn(
          { queue: queueName, jobName },
          "redis unavailable, background jobs are disabled in local fallback mode"
        );
      }
      return null;
    }
  });
  return {
    summary: createNoopQueue("summary"),
    profile: createNoopQueue("profile"),
    embedding: createNoopQueue("embedding"),
    topic: createNoopQueue("topic"),
    cleanup: createNoopQueue("cleanup"),
    searchCache: createNoopQueue("searchCache"),
    prefix
  };
}
async function bootstrapBot() {
  const env = (0, import_config.loadEnv)();
  (0, import_config.assertEnvForRole)(env, "bot");
  const logger = (0, import_shared5.createLogger)(env.LOG_LEVEL);
  const prisma = (0, import_shared5.createPrismaClient)();
  const redis = (0, import_shared5.createRedisClient)(env.REDIS_URL);
  const { redisReady } = await (0, import_shared5.ensureInfrastructureReady)({
    role: "bot",
    nodeEnv: env.NODE_ENV,
    databaseUrl: env.DATABASE_URL,
    redisUrl: env.REDIS_URL,
    prisma,
    redis,
    logger,
    allowRedisFailure: env.NODE_ENV !== "production"
  });
  if (!env.OLLAMA_BASE_URL) {
    const persistedOllamaUrl = await (0, import_shared5.loadPersistedOllamaBaseUrl)(prisma, logger);
    if (persistedOllamaUrl) {
      env.OLLAMA_BASE_URL = persistedOllamaUrl;
    }
  }
  const queues = redisReady ? (0, import_shared5.createAppQueues)(env.REDIS_URL, env.JOB_QUEUE_PREFIX) : createNoopQueues(logger, env.JOB_QUEUE_PREFIX);
  const client = createDiscordClient();
  const analytics = new import_analytics2.AnalyticsQueryService(prisma);
  const summaryService = new import_memory.SummaryService(prisma);
  const relationshipService = new import_memory.RelationshipService(prisma);
  const retrievalService = new import_memory.RetrievalService(prisma);
  const profileService = new import_memory.ProfileService(prisma, env);
  const runtimeConfig = new import_core2.RuntimeConfigService(prisma, env);
  const affinityService = new import_core2.AffinityService(prisma);
  const moodService = new import_core2.MoodService(prisma);
  const mediaReactionService = new import_core2.MediaReactionService(prisma);
  const replyQueueService = new import_core2.ReplyQueueService(prisma, env.REPLY_QUEUE_BUSY_TTL_SEC);
  const contextService = new import_memory.ContextService(prisma, summaryService, profileService, relationshipService, retrievalService);
  const llmClient = new import_llm.OllamaClient(env, logger);
  if (env.OLLAMA_BASE_URL) {
    try {
      const probe = await fetch(new URL("/api/tags", env.OLLAMA_BASE_URL), {
        signal: AbortSignal.timeout(5e3)
      });
      if (probe.ok) {
        const data = await probe.json();
        const models = data.models?.map((m) => m.name) ?? [];
        logger.info({ url: env.OLLAMA_BASE_URL, models }, `ollama reachable: url=${env.OLLAMA_BASE_URL} models=${models.join(",")}`);
      } else {
        logger.warn({ url: env.OLLAMA_BASE_URL, status: probe.status }, `ollama responded with error: url=${env.OLLAMA_BASE_URL} status=${probe.status} \u2014 fallback replies until fixed`);
      }
    } catch (error) {
      const errorText = error instanceof Error ? error.message : String(error);
      logger.warn({ url: env.OLLAMA_BASE_URL, error: errorText }, `ollama unreachable: url=${env.OLLAMA_BASE_URL} error=${errorText} \u2014 bot will use fallback replies. Run start-tunnel.ps1 and /bot-ai-url`);
    }
  } else {
    logger.warn("OLLAMA_BASE_URL not set \u2014 bot will use fallback replies for all LLM calls");
  }
  const modelRouter = new import_llm.ModelRouter(env);
  const embeddingAdapter = new import_llm.EmbeddingAdapter(llmClient, env);
  const searchCache = new import_search.SearchCacheService(prisma, redisReady ? redis : null, logger);
  const searchClient = new import_search.BraveSearchClient(env, logger, searchCache);
  const toolOrchestrator = new import_llm.ToolOrchestrator(llmClient, logger);
  const ingestService = new import_analytics2.MessageIngestService(prisma, logger);
  const slashAdmin = new import_core2.SlashAdminService(prisma, analytics, relationshipService, retrievalService, summaryService, runtimeConfig, moodService, replyQueueService);
  const orchestrator = (0, import_core2.createChatOrchestrator)({
    env,
    logger,
    prisma,
    analytics,
    contextService,
    retrieval: retrievalService,
    llmClient,
    modelRouter,
    toolOrchestrator,
    searchClient,
    embeddingAdapter,
    runtimeConfig,
    relationships: relationshipService,
    affinity: affinityService,
    mood: moodService,
    media: mediaReactionService
  });
  const runtime = {
    env,
    client,
    logger,
    prisma,
    redis,
    queues,
    ingestService,
    analytics,
    slashAdmin,
    runtimeConfig,
    orchestrator,
    replyQueue: replyQueueService
  };
  registerEvents(runtime);
  await client.login(env.DISCORD_TOKEN);
  return runtime;
}

// src/index.ts
bootstrapBot().catch((error) => {
  console.error(error);
  process.exit(1);
});
