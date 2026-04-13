"use strict";

// src/bootstrap.ts
var import_analytics2 = require("@hori/analytics");
var import_config = require("@hori/config");
var import_core2 = require("@hori/core");
var import_llm = require("@hori/llm");
var import_memory2 = require("@hori/memory");
var import_search = require("@hori/search");
var import_shared6 = require("@hori/shared");

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
var panelTabChoices = [
  { name: "\u0413\u043B\u0430\u0432\u043D\u0430\u044F", value: "main" },
  { name: "\u0412\u043B\u0430\u0434\u0435\u043B\u0435\u0446", value: "owner" },
  { name: "\u0421\u0442\u0438\u043B\u044C", value: "style" },
  { name: "\u0416\u0438\u0432\u043E\u0441\u0442\u044C", value: "liveliness" },
  { name: "\u041F\u0430\u043C\u044F\u0442\u044C", value: "memory" },
  { name: "\u041B\u044E\u0434\u0438", value: "people" },
  { name: "\u041A\u0430\u043D\u0430\u043B\u044B", value: "channels" },
  { name: "\u041F\u043E\u0438\u0441\u043A", value: "search" },
  { name: "\u042D\u043A\u0441\u043F\u0435\u0440\u0438\u043C\u0435\u043D\u0442\u044B", value: "experiments" },
  { name: "\u0414\u0438\u0430\u0433\u043D\u043E\u0441\u0442\u0438\u043A\u0430", value: "diagnostics" }
];
var stateTabChoices = [
  { name: "\u041F\u0435\u0440\u0441\u043E\u043D\u0430", value: "persona" },
  { name: "\u041C\u043E\u0437\u0433\u0438", value: "brain" },
  { name: "\u041F\u0430\u043C\u044F\u0442\u044C", value: "memory" },
  { name: "\u041A\u0430\u043D\u0430\u043B", value: "channel" },
  { name: "\u041F\u043E\u0438\u0441\u043A", value: "search" },
  { name: "\u041E\u0447\u0435\u0440\u0435\u0434\u044C", value: "queue" },
  { name: "\u041C\u0435\u0434\u0438\u0430", value: "media" },
  { name: "\u0424\u0438\u0447\u0438", value: "features" },
  { name: "Trace", value: "trace" },
  { name: "\u0422\u043E\u043A\u0435\u043D\u044B", value: "tokens" }
];
var powerProfileChoices = [
  { name: "economy", value: "economy" },
  { name: "balanced", value: "balanced" },
  { name: "expanded", value: "expanded" },
  { name: "max", value: "max" }
];
var replyLengthChoices = [
  { name: "short", value: "short" },
  { name: "medium", value: "medium" },
  { name: "long", value: "long" },
  { name: "inherit/default", value: "inherit" }
];
var moodChoices = [
  { name: "normal", value: "normal" },
  { name: "playful", value: "playful" },
  { name: "dry", value: "dry" },
  { name: "irritated", value: "irritated" },
  { name: "focused", value: "focused" },
  { name: "sleepy", value: "sleepy" },
  { name: "detached", value: "detached" }
];
var mediaTypeChoices = [
  { name: "image", value: "image" },
  { name: "gif", value: "gif" },
  { name: "video", value: "video" },
  { name: "audio", value: "audio" }
];
var horiCommandDefinition = new import_discord2.SlashCommandBuilder().setName("hori").setDescription("\u0413\u043B\u0430\u0432\u043D\u044B\u0439 \u0446\u0435\u043D\u0442\u0440 \u0443\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u044F \u0425\u043E\u0440\u0438").addSubcommand(
  (subcommand) => subcommand.setName("panel").setDescription("Owner: \u043E\u0442\u043A\u0440\u044B\u0442\u044C master panel \u0425\u043E\u0440\u0438").addStringOption(
    (option) => option.setName("tab").setDescription("\u0412\u043A\u043B\u0430\u0434\u043A\u0430").addChoices(...panelTabChoices)
  )
).addSubcommand(
  (subcommand) => subcommand.setName("state").setDescription("Owner: \u043F\u0430\u043D\u0435\u043B\u044C \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u044F \u0425\u043E\u0440\u0438").addStringOption(
    (option) => option.setName("tab").setDescription("\u0420\u0430\u0437\u0434\u0435\u043B \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u044F").addChoices(...stateTabChoices)
  )
).addSubcommand(
  (subcommand) => subcommand.setName("search").setDescription("\u0421\u0434\u0435\u043B\u0430\u0442\u044C web search \u0447\u0435\u0440\u0435\u0437 \u0443\u0441\u0438\u043B\u0435\u043D\u043D\u044B\u0439 fallback").addStringOption((option) => option.setName("query").setDescription("\u0427\u0442\u043E \u0438\u0441\u043A\u0430\u0442\u044C").setRequired(true))
).addSubcommand(
  (subcommand) => subcommand.setName("memory-build").setDescription("\u0414\u043E\u043B\u0433\u043E \u0441\u043E\u0431\u0440\u0430\u0442\u044C active memory \u0438\u0437 \u0443\u0436\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D\u043D\u044B\u0445 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0439").addStringOption(
    (option) => option.setName("scope").setDescription("\u041E\u0431\u043B\u0430\u0441\u0442\u044C").setRequired(true).addChoices(
      { name: "\u0442\u0435\u043A\u0443\u0449\u0438\u0439 \u043A\u0430\u043D\u0430\u043B", value: "channel" },
      { name: "\u0432\u0435\u0441\u044C \u0441\u0435\u0440\u0432\u0435\u0440", value: "server" }
    )
  ).addStringOption(
    (option) => option.setName("depth").setDescription("\u0413\u043B\u0443\u0431\u0438\u043D\u0430").addChoices(
      { name: "recent", value: "recent" },
      { name: "deep", value: "deep" }
    )
  )
).addSubcommand(
  (subcommand) => subcommand.setName("profile").setDescription("\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u043A\u0440\u0430\u0442\u043A\u0438\u0439 \u043F\u0440\u043E\u0444\u0438\u043B\u044C/\u043F\u0430\u043C\u044F\u0442\u044C").addUserOption((option) => option.setName("user").setDescription("\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C"))
).addSubcommand(
  (subcommand) => subcommand.setName("dossier").setDescription("Owner: \u0441\u043E\u0431\u0440\u0430\u0442\u044C \u0440\u0430\u0437\u0432\u0451\u0440\u043D\u0443\u0442\u043E\u0435 \u0434\u043E\u0441\u044C\u0435 \u043F\u043E \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u0443").addUserOption((option) => option.setName("user").setDescription("\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C").setRequired(true))
).addSubcommand(
  (subcommand) => subcommand.setName("relationship").setDescription("Owner: \u043F\u043E\u0441\u043C\u043E\u0442\u0440\u0435\u0442\u044C \u0438\u043B\u0438 \u0438\u0437\u043C\u0435\u043D\u0438\u0442\u044C \u043E\u0442\u043D\u043E\u0448\u0435\u043D\u0438\u0435 \u043A \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u0443").addUserOption((option) => option.setName("user").setDescription("\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C").setRequired(true)).addStringOption((option) => option.setName("tone-bias").setDescription("neutral, friendly, sharp, playful")).addIntegerOption((option) => option.setName("roast-level").setDescription("0-5").setMinValue(0).setMaxValue(5)).addIntegerOption((option) => option.setName("praise-bias").setDescription("0-5").setMinValue(0).setMaxValue(5)).addIntegerOption((option) => option.setName("interrupt-priority").setDescription("0-5").setMinValue(0).setMaxValue(5)).addBooleanOption((option) => option.setName("do-not-mock").setDescription("\u041D\u0435 \u043F\u043E\u0434\u043A\u0430\u043B\u044B\u0432\u0430\u0442\u044C")).addBooleanOption((option) => option.setName("do-not-initiate").setDescription("\u041D\u0435 \u0438\u043D\u0438\u0446\u0438\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043E\u0431\u0449\u0435\u043D\u0438\u0435")).addStringOption((option) => option.setName("protected-topics").setDescription("CSV protected topics")).addNumberOption((option) => option.setName("closeness").setDescription("\u0411\u043B\u0438\u0437\u043E\u0441\u0442\u044C 0-1").setMinValue(0).setMaxValue(1)).addNumberOption((option) => option.setName("trust").setDescription("\u0414\u043E\u0432\u0435\u0440\u0438\u0435 0-1").setMinValue(0).setMaxValue(1)).addNumberOption((option) => option.setName("familiarity").setDescription("\u0417\u043D\u0430\u043A\u043E\u043C\u043E\u0441\u0442\u044C 0-1").setMinValue(0).setMaxValue(1)).addNumberOption((option) => option.setName("proactivity").setDescription("\u0416\u0435\u043B\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u044C \u0438\u043D\u0438\u0446\u0438\u0430\u0442\u0438\u0432\u044B 0-1").setMinValue(0).setMaxValue(1))
).addSubcommand(
  (subcommand) => subcommand.setName("memory").setDescription("\u0423\u043F\u0440\u0430\u0432\u043B\u044F\u0442\u044C \u0434\u043E\u043B\u0433\u043E\u0439 \u043F\u0430\u043C\u044F\u0442\u044C\u044E").addStringOption(
    (option) => option.setName("action").setDescription("\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u0435").setRequired(true).addChoices(
      { name: "remember", value: "remember" },
      { name: "forget", value: "forget" }
    )
  ).addStringOption((option) => option.setName("key").setDescription("\u041A\u043B\u044E\u0447").setRequired(true)).addStringOption((option) => option.setName("value").setDescription("\u0417\u043D\u0430\u0447\u0435\u043D\u0438\u0435 \u0434\u043B\u044F remember"))
).addSubcommand(
  (subcommand) => subcommand.setName("channel").setDescription("\u041D\u0430\u0441\u0442\u0440\u043E\u0438\u0442\u044C \u043A\u0430\u043D\u0430\u043B").addChannelOption(
    (option) => option.setName("channel").setDescription("\u041A\u0430\u043D\u0430\u043B").addChannelTypes(import_discord2.ChannelType.GuildText, import_discord2.ChannelType.PublicThread, import_discord2.ChannelType.PrivateThread)
  ).addBooleanOption((option) => option.setName("allow-bot-replies").setDescription("\u0420\u0430\u0437\u0440\u0435\u0448\u0438\u0442\u044C \u043E\u0442\u0432\u0435\u0442\u044B")).addBooleanOption((option) => option.setName("allow-interjections").setDescription("\u0420\u0430\u0437\u0440\u0435\u0448\u0438\u0442\u044C \u0430\u0432\u0442\u043E\u0432\u043C\u0435\u0448\u0430\u0442\u0435\u043B\u044C\u0441\u0442\u0432\u0430")).addBooleanOption((option) => option.setName("is-muted").setDescription("\u0425\u043E\u0440\u0438 \u0434\u043E\u043B\u0436\u043D\u0430 \u043C\u043E\u043B\u0447\u0430\u0442\u044C")).addStringOption((option) => option.setName("response-length").setDescription("\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u0430\u044F \u0434\u043B\u0438\u043D\u0430 \u043E\u0442\u0432\u0435\u0442\u0430").addChoices(...replyLengthChoices)).addStringOption((option) => option.setName("topic-interest-tags").setDescription("CSV tags"))
).addSubcommand(
  (subcommand) => subcommand.setName("summary").setDescription("\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u043F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u0435 channel summaries").addChannelOption(
    (option) => option.setName("channel").setDescription("\u041A\u0430\u043D\u0430\u043B").addChannelTypes(import_discord2.ChannelType.GuildText, import_discord2.ChannelType.PublicThread, import_discord2.ChannelType.PrivateThread)
  )
).addSubcommand((subcommand) => subcommand.setName("stats").setDescription("\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u043D\u0435\u0434\u0435\u043B\u044C\u043D\u0443\u044E \u0441\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043A\u0443")).addSubcommand(
  (subcommand) => subcommand.setName("topic").setDescription("\u041F\u043E\u0441\u043C\u043E\u0442\u0440\u0435\u0442\u044C \u0438\u043B\u0438 \u0441\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u0430\u043A\u0442\u0438\u0432\u043D\u0443\u044E \u0442\u0435\u043C\u0443").addStringOption(
    (option) => option.setName("action").setDescription("\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u0435").setRequired(true).addChoices(
      { name: "status", value: "status" },
      { name: "reset", value: "reset" }
    )
  ).addChannelOption(
    (option) => option.setName("channel").setDescription("\u041A\u0430\u043D\u0430\u043B").addChannelTypes(import_discord2.ChannelType.GuildText, import_discord2.ChannelType.PublicThread, import_discord2.ChannelType.PrivateThread)
  )
).addSubcommand(
  (subcommand) => subcommand.setName("mood").setDescription("\u0423\u043F\u0440\u0430\u0432\u043B\u044F\u0442\u044C mood Hori").addStringOption(
    (option) => option.setName("action").setDescription("\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u0435").setRequired(true).addChoices(
      { name: "status", value: "status" },
      { name: "set", value: "set" },
      { name: "clear", value: "clear" }
    )
  ).addStringOption((option) => option.setName("mode").setDescription("\u0420\u0435\u0436\u0438\u043C").addChoices(...moodChoices)).addIntegerOption((option) => option.setName("minutes").setDescription("\u0421\u043A\u043E\u043B\u044C\u043A\u043E \u043C\u0438\u043D\u0443\u0442").setMinValue(1).setMaxValue(1440)).addStringOption((option) => option.setName("reason").setDescription("\u041F\u0440\u0438\u0447\u0438\u043D\u0430"))
).addSubcommand(
  (subcommand) => subcommand.setName("queue").setDescription("\u0423\u043F\u0440\u0430\u0432\u043B\u044F\u0442\u044C reply queue").addStringOption(
    (option) => option.setName("action").setDescription("\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u0435").setRequired(true).addChoices(
      { name: "status", value: "status" },
      { name: "clear", value: "clear" }
    )
  ).addChannelOption(
    (option) => option.setName("channel").setDescription("\u041A\u0430\u043D\u0430\u043B").addChannelTypes(import_discord2.ChannelType.GuildText, import_discord2.ChannelType.PublicThread, import_discord2.ChannelType.PrivateThread)
  )
).addSubcommand(
  (subcommand) => subcommand.setName("album").setDescription("\u041B\u0438\u0447\u043D\u044B\u0439 \u0430\u043B\u044C\u0431\u043E\u043C \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D\u043D\u044B\u0445 \u043C\u043E\u043C\u0435\u043D\u0442\u043E\u0432").addStringOption(
    (option) => option.setName("action").setDescription("\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u0435").setRequired(true).addChoices(
      { name: "list", value: "list" },
      { name: "remove", value: "remove" }
    )
  ).addIntegerOption((option) => option.setName("limit").setDescription("\u0421\u043A\u043E\u043B\u044C\u043A\u043E \u043F\u043E\u043A\u0430\u0437\u0430\u0442\u044C").setMinValue(1).setMaxValue(10)).addStringOption((option) => option.setName("id").setDescription("ID \u043C\u043E\u043C\u0435\u043D\u0442\u0430 \u0434\u043B\u044F remove"))
).addSubcommand(
  (subcommand) => subcommand.setName("debug").setDescription("Owner/mod: \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u044C debug trace").addStringOption((option) => option.setName("message-id").setDescription("ID \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F"))
).addSubcommand(
  (subcommand) => subcommand.setName("feature").setDescription("\u041F\u0435\u0440\u0435\u043A\u043B\u044E\u0447\u0438\u0442\u044C feature flag").addStringOption((option) => option.setName("key").setDescription("\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0444\u043B\u0430\u0433\u0430").setRequired(true)).addBooleanOption((option) => option.setName("enabled").setDescription("\u0412\u043A\u043B\u044E\u0447\u0438\u0442\u044C/\u0432\u044B\u043A\u043B\u044E\u0447\u0438\u0442\u044C").setRequired(true))
).addSubcommand(
  (subcommand) => subcommand.setName("media").setDescription("\u0423\u043F\u0440\u0430\u0432\u043B\u044F\u0442\u044C media registry").addStringOption(
    (option) => option.setName("action").setDescription("\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u0435").setRequired(true).addChoices(
      { name: "list", value: "list" },
      { name: "add", value: "add" },
      { name: "sync-pack", value: "sync-pack" },
      { name: "disable", value: "disable" }
    )
  ).addStringOption((option) => option.setName("id").setDescription("media id")).addStringOption((option) => option.setName("type").setDescription("\u0422\u0438\u043F").addChoices(...mediaTypeChoices)).addStringOption((option) => option.setName("path").setDescription("\u041F\u0443\u0442\u044C \u043A \u0444\u0430\u0439\u043B\u0443 \u0438\u043B\u0438 catalog.json")).addStringOption((option) => option.setName("trigger-tags").setDescription("CSV trigger tags")).addStringOption((option) => option.setName("tone-tags").setDescription("CSV tone tags")).addStringOption((option) => option.setName("channels").setDescription("CSV channel kinds")).addStringOption((option) => option.setName("moods").setDescription("CSV moods")).addBooleanOption((option) => option.setName("nsfw").setDescription("NSFW"))
).addSubcommand(
  (subcommand) => subcommand.setName("power").setDescription("Owner: \u043F\u0440\u0435\u0441\u0435\u0442\u044B \u043C\u043E\u0449\u043D\u043E\u0441\u0442\u0438 Ollama \u0438 \u043A\u043E\u043D\u0442\u0435\u043A\u0441\u0442\u0430").addStringOption(
    (option) => option.setName("action").setDescription("\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u0435").setRequired(true).addChoices(
      { name: "panel", value: "panel" },
      { name: "status", value: "status" },
      { name: "apply", value: "apply" }
    )
  ).addStringOption((option) => option.setName("profile").setDescription("\u041F\u0440\u0435\u0441\u0435\u0442 \u043C\u043E\u0449\u043D\u043E\u0441\u0442\u0438").addChoices(...powerProfileChoices))
).addSubcommand(
  (subcommand) => subcommand.setName("ai-url").setDescription("Owner: \u0441\u043C\u0435\u043D\u0438\u0442\u044C Ollama URL").addStringOption((option) => option.setName("url").setDescription("\u041D\u043E\u0432\u044B\u0439 URL (https://...)").setRequired(true))
).addSubcommand(
  (subcommand) => subcommand.setName("lockdown").setDescription("Owner: \u0425\u043E\u0440\u0438 \u0441\u043B\u0443\u0448\u0430\u0435\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \u0432\u043B\u0430\u0434\u0435\u043B\u044C\u0446\u0430").addStringOption(
    (option) => option.setName("mode").setDescription("\u0420\u0435\u0436\u0438\u043C").setRequired(true).addChoices(
      { name: "on", value: "on" },
      { name: "off", value: "off" },
      { name: "status", value: "status" }
    )
  )
).addSubcommand(
  (subcommand) => subcommand.setName("import").setDescription("Owner: \u0438\u043C\u043F\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0438\u0441\u0442\u043E\u0440\u0438\u044E \u0447\u0430\u0442\u0430 \u0438\u0437 JSON \u0444\u0430\u0439\u043B\u0430").addAttachmentOption((option) => option.setName("file").setDescription(".json \u0444\u0430\u0439\u043B \u0441 \u0438\u0441\u0442\u043E\u0440\u0438\u0435\u0439 \u0447\u0430\u0442\u0430").setRequired(true))
);
var legacySlashCommandBuilders = [
  new import_discord2.SlashCommandBuilder().setName("bot-help").setDescription("\u041A\u043E\u0440\u043E\u0442\u043A\u0430\u044F \u0441\u043F\u0440\u0430\u0432\u043A\u0430 \u043F\u043E legacy-\u043A\u043E\u043C\u0430\u043D\u0434\u0430\u043C"),
  new import_discord2.SlashCommandBuilder().setName("bot-style").setDescription("\u041D\u0430\u0441\u0442\u0440\u043E\u0438\u0442\u044C \u0441\u0442\u0438\u043B\u044C \u0425\u043E\u0440\u0438").addStringOption((option) => option.setName("bot-name").setDescription("\u0418\u043C\u044F \u0431\u043E\u0442\u0430")).addStringOption((option) => option.setName("preferred-language").setDescription("\u042F\u0437\u044B\u043A \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E, \u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440 ru/en")).addIntegerOption((option) => option.setName("roughness").setDescription("\u0413\u0440\u0443\u0431\u043E\u0441\u0442\u044C 0-5").setMinValue(0).setMaxValue(5)).addIntegerOption((option) => option.setName("sarcasm").setDescription("\u0421\u0430\u0440\u043A\u0430\u0437\u043C 0-5").setMinValue(0).setMaxValue(5)).addIntegerOption((option) => option.setName("roast").setDescription("\u0421\u0442\u0451\u0431 0-5").setMinValue(0).setMaxValue(5)).addIntegerOption((option) => option.setName("interject-tendency").setDescription("\u0421\u043A\u043B\u043E\u043D\u043D\u043E\u0441\u0442\u044C \u0432\u0441\u0442\u0440\u0435\u0432\u0430\u0442\u044C 0-5").setMinValue(0).setMaxValue(5)).addStringOption(
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
  new import_discord2.SlashCommandBuilder().setName("bot-album").setDescription("\u041B\u0438\u0447\u043D\u044B\u0439 \u0430\u043B\u044C\u0431\u043E\u043C \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D\u043D\u044B\u0445 \u043C\u043E\u043C\u0435\u043D\u0442\u043E\u0432").addSubcommand(
    (subcommand) => subcommand.setName("list").setDescription("\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u043F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D\u043D\u044B\u0435 \u043C\u043E\u043C\u0435\u043D\u0442\u044B").addIntegerOption((option) => option.setName("limit").setDescription("\u0421\u043A\u043E\u043B\u044C\u043A\u043E \u043F\u043E\u043A\u0430\u0437\u0430\u0442\u044C").setMinValue(1).setMaxValue(10))
  ).addSubcommand(
    (subcommand) => subcommand.setName("remove").setDescription("\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u043C\u043E\u043C\u0435\u043D\u0442 \u0438\u0437 \u0441\u0432\u043E\u0435\u0433\u043E \u0430\u043B\u044C\u0431\u043E\u043C\u0430").addStringOption((option) => option.setName("id").setDescription("ID \u043C\u043E\u043C\u0435\u043D\u0442\u0430").setRequired(true))
  ),
  new import_discord2.SlashCommandBuilder().setName("bot-relationship").setDescription("\u041D\u0430\u0441\u0442\u0440\u043E\u0438\u0442\u044C \u043E\u0442\u043D\u043E\u0448\u0435\u043D\u0438\u0435 \u043A \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044E").addUserOption((option) => option.setName("user").setDescription("\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C").setRequired(true)).addStringOption((option) => option.setName("tone-bias").setDescription("neutral, friendly, sharp, playful")).addIntegerOption((option) => option.setName("roast-level").setDescription("0-5").setMinValue(0).setMaxValue(5)).addIntegerOption((option) => option.setName("praise-bias").setDescription("0-5").setMinValue(0).setMaxValue(5)).addIntegerOption((option) => option.setName("interrupt-priority").setDescription("0-5").setMinValue(0).setMaxValue(5)).addBooleanOption((option) => option.setName("do-not-mock").setDescription("\u041D\u0435 \u043F\u043E\u0434\u043A\u0430\u043B\u044B\u0432\u0430\u0442\u044C")).addBooleanOption((option) => option.setName("do-not-initiate").setDescription("\u041D\u0435 \u0438\u043D\u0438\u0446\u0438\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043E\u0431\u0449\u0435\u043D\u0438\u0435")).addStringOption((option) => option.setName("protected-topics").setDescription("CSV protected topics")).addNumberOption((option) => option.setName("closeness").setDescription("\u0411\u043B\u0438\u0437\u043E\u0441\u0442\u044C 0-1").setMinValue(0).setMaxValue(1)).addNumberOption((option) => option.setName("trust").setDescription("\u0414\u043E\u0432\u0435\u0440\u0438\u0435 0-1").setMinValue(0).setMaxValue(1)).addNumberOption((option) => option.setName("familiarity").setDescription("\u0417\u043D\u0430\u043A\u043E\u043C\u043E\u0441\u0442\u044C 0-1").setMinValue(0).setMaxValue(1)).addNumberOption((option) => option.setName("proactivity").setDescription("\u0416\u0435\u043B\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u044C \u0438\u043D\u0438\u0446\u0438\u0430\u0442\u0438\u0432\u044B 0-1").setMinValue(0).setMaxValue(1)),
  new import_discord2.SlashCommandBuilder().setName("bot-feature").setDescription("\u041F\u0435\u0440\u0435\u043A\u043B\u044E\u0447\u0438\u0442\u044C feature flag").addStringOption((option) => option.setName("key").setDescription("\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0444\u043B\u0430\u0433\u0430").setRequired(true)).addBooleanOption((option) => option.setName("enabled").setDescription("\u0412\u043A\u043B\u044E\u0447\u0438\u0442\u044C/\u0432\u044B\u043A\u043B\u044E\u0447\u0438\u0442\u044C").setRequired(true)),
  new import_discord2.SlashCommandBuilder().setName("bot-debug").setDescription("\u041F\u043E\u043B\u0443\u0447\u0438\u0442\u044C debug trace \u043F\u043E \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044E").addStringOption((option) => option.setName("message-id").setDescription("ID \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F").setRequired(true)),
  new import_discord2.SlashCommandBuilder().setName("bot-profile").setDescription("\u041F\u043E\u0441\u043C\u043E\u0442\u0440\u0435\u0442\u044C \u043F\u0440\u043E\u0444\u0438\u043B\u044C \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F").addUserOption((option) => option.setName("user").setDescription("\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C").setRequired(true)),
  new import_discord2.SlashCommandBuilder().setName("bot-channel").setDescription("\u041D\u0430\u0441\u0442\u0440\u043E\u0438\u0442\u044C \u043A\u0430\u043D\u0430\u043B").addChannelOption(
    (option) => option.setName("channel").setDescription("\u041A\u0430\u043D\u0430\u043B").addChannelTypes(import_discord2.ChannelType.GuildText, import_discord2.ChannelType.PublicThread, import_discord2.ChannelType.PrivateThread).setRequired(true)
  ).addBooleanOption((option) => option.setName("allow-bot-replies").setDescription("\u0420\u0430\u0437\u0440\u0435\u0448\u0438\u0442\u044C \u043E\u0442\u0432\u0435\u0442\u044B")).addBooleanOption((option) => option.setName("allow-interjections").setDescription("\u0420\u0430\u0437\u0440\u0435\u0448\u0438\u0442\u044C \u0430\u0432\u0442\u043E\u0432\u043C\u0435\u0448\u0430\u0442\u0435\u043B\u044C\u0441\u0442\u0432\u0430")).addBooleanOption((option) => option.setName("is-muted").setDescription("\u0425\u043E\u0440\u0438 \u0434\u043E\u043B\u0436\u043D\u0430 \u043C\u043E\u043B\u0447\u0430\u0442\u044C")).addStringOption((option) => option.setName("response-length").setDescription("\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u0430\u044F \u0434\u043B\u0438\u043D\u0430 \u043E\u0442\u0432\u0435\u0442\u0430").addChoices(...replyLengthChoices)).addStringOption((option) => option.setName("topic-interest-tags").setDescription("CSV tags")),
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
      (option) => option.setName("mode").setDescription("\u0420\u0435\u0436\u0438\u043C").setRequired(true).addChoices(...moodChoices)
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
  new import_discord2.SlashCommandBuilder().setName("bot-reflection").setDescription("\u041F\u043E\u0441\u043C\u043E\u0442\u0440\u0435\u0442\u044C \u0442\u0438\u0445\u0438\u0439 \u0436\u0443\u0440\u043D\u0430\u043B \u0443\u0440\u043E\u043A\u043E\u0432 Hori").addSubcommand((subcommand) => subcommand.setName("status").setDescription("\u0421\u0432\u043E\u0434\u043A\u0430 \u043F\u043E \u0443\u0440\u043E\u043A\u0430\u043C")).addSubcommand(
    (subcommand) => subcommand.setName("list").setDescription("\u041F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u0435 \u043E\u0442\u043A\u0440\u044B\u0442\u044B\u0435 \u0443\u0440\u043E\u043A\u0438").addIntegerOption((option) => option.setName("limit").setDescription("\u0421\u043A\u043E\u043B\u044C\u043A\u043E \u043F\u043E\u043A\u0430\u0437\u0430\u0442\u044C").setMinValue(1).setMaxValue(10))
  ),
  new import_discord2.SlashCommandBuilder().setName("bot-media").setDescription("\u0423\u043F\u0440\u0430\u0432\u043B\u044F\u0442\u044C media registry").addSubcommand(
    (subcommand) => subcommand.setName("add").setDescription("\u0417\u0430\u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 media-\u0444\u0430\u0439\u043B").addStringOption((option) => option.setName("id").setDescription("media id").setRequired(true)).addStringOption((option) => option.setName("type").setDescription("\u0422\u0438\u043F").setRequired(true).addChoices(...mediaTypeChoices)).addStringOption((option) => option.setName("path").setDescription("\u0410\u0431\u0441\u043E\u043B\u044E\u0442\u043D\u044B\u0439 \u043F\u0443\u0442\u044C \u043A \u0444\u0430\u0439\u043B\u0443").setRequired(true)).addStringOption((option) => option.setName("trigger-tags").setDescription("CSV trigger tags")).addStringOption((option) => option.setName("tone-tags").setDescription("CSV tone tags")).addStringOption((option) => option.setName("channels").setDescription("CSV channel kinds")).addStringOption((option) => option.setName("moods").setDescription("CSV moods")).addBooleanOption((option) => option.setName("nsfw").setDescription("NSFW"))
  ).addSubcommand((subcommand) => subcommand.setName("list").setDescription("\u0421\u043F\u0438\u0441\u043E\u043A media")).addSubcommand(
    (subcommand) => subcommand.setName("sync-pack").setDescription("\u0421\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0438\u0440\u043E\u0432\u0430\u0442\u044C media \u0438\u0437 catalog.json").addStringOption((option) => option.setName("path").setDescription("\u041F\u0443\u0442\u044C \u043A catalog.json \u0432\u043D\u0443\u0442\u0440\u0438 \u0440\u0435\u043F\u043E\u0437\u0438\u0442\u043E\u0440\u0438\u044F"))
  ).addSubcommand(
    (subcommand) => subcommand.setName("disable").setDescription("\u041E\u0442\u043A\u043B\u044E\u0447\u0438\u0442\u044C media").addStringOption((option) => option.setName("id").setDescription("media id").setRequired(true))
  ),
  new import_discord2.SlashCommandBuilder().setName("bot-power").setDescription("\u0413\u043B\u043E\u0431\u0430\u043B\u044C\u043D\u044B\u0435 \u043F\u0440\u0435\u0441\u0435\u0442\u044B \u043C\u043E\u0449\u043D\u043E\u0441\u0442\u0438 Ollama \u0438 \u043A\u043E\u043D\u0442\u0435\u043A\u0441\u0442\u0430").addSubcommand((subcommand) => subcommand.setName("panel").setDescription("\u041E\u0442\u043A\u0440\u044B\u0442\u044C owner-only \u043F\u0430\u043D\u0435\u043B\u044C \u043F\u0440\u0435\u0441\u0435\u0442\u043E\u0432")).addSubcommand((subcommand) => subcommand.setName("status").setDescription("\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0439 power profile \u0438 \u043B\u0438\u043C\u0438\u0442\u044B")).addSubcommand(
    (subcommand) => subcommand.setName("apply").setDescription("\u041F\u0440\u0438\u043C\u0435\u043D\u0438\u0442\u044C power profile").addStringOption((option) => option.setName("profile").setDescription("\u041F\u0440\u0435\u0441\u0435\u0442 \u043C\u043E\u0449\u043D\u043E\u0441\u0442\u0438").setRequired(true).addChoices(...powerProfileChoices))
  ),
  new import_discord2.SlashCommandBuilder().setName("bot-ai-url").setDescription("\u0421\u043C\u0435\u043D\u0438\u0442\u044C Ollama URL (\u0442\u043E\u043B\u044C\u043A\u043E \u0432\u043B\u0430\u0434\u0435\u043B\u0435\u0446 \u0431\u043E\u0442\u0430)").addStringOption((option) => option.setName("url").setDescription("\u041D\u043E\u0432\u044B\u0439 URL (https://...)").setRequired(true)),
  new import_discord2.SlashCommandBuilder().setName("bot-lockdown").setDescription("\u0412\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u0440\u0435\u0436\u0438\u043C: \u0425\u043E\u0440\u0438 \u0441\u043B\u0443\u0448\u0430\u0435\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \u0432\u043B\u0430\u0434\u0435\u043B\u044C\u0446\u0430").addSubcommand((subcommand) => subcommand.setName("on").setDescription("\u0412\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u043B\u043E\u043A\u0434\u0430\u0443\u043D")).addSubcommand((subcommand) => subcommand.setName("off").setDescription("\u0412\u044B\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u043B\u043E\u043A\u0434\u0430\u0443\u043D")).addSubcommand((subcommand) => subcommand.setName("status").setDescription("\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0441\u0442\u0430\u0442\u0443\u0441 \u043B\u043E\u043A\u0434\u0430\u0443\u043D\u0430")),
  new import_discord2.SlashCommandBuilder().setName("bot-import").setDescription("\u0418\u043C\u043F\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0438\u0441\u0442\u043E\u0440\u0438\u044E \u0447\u0430\u0442\u0430 \u0438\u0437 JSON \u0444\u0430\u0439\u043B\u0430").addAttachmentOption((option) => option.setName("file").setDescription(".json \u0444\u0430\u0439\u043B \u0441 \u0438\u0441\u0442\u043E\u0440\u0438\u0435\u0439 \u0447\u0430\u0442\u0430").setRequired(true))
];
var horiSlashCommandDefinitions = [horiCommandDefinition].map((command) => command.toJSON());
var legacySlashCommandDefinitions = legacySlashCommandBuilders.map((command) => command.toJSON());
var slashCommandDefinitions = [...horiSlashCommandDefinitions, ...legacySlashCommandDefinitions];
function getSlashCommandDefinitions(options = {}) {
  return options.includeLegacy ? slashCommandDefinitions : horiSlashCommandDefinitions;
}
var contextMenuDefinitions = [
  new import_discord2.ContextMenuCommandBuilder().setName(import_shared.CONTEXT_ACTIONS.explain).setType(import_discord2.ApplicationCommandType.Message),
  new import_discord2.ContextMenuCommandBuilder().setName(import_shared.CONTEXT_ACTIONS.summarize).setType(import_discord2.ApplicationCommandType.Message),
  new import_discord2.ContextMenuCommandBuilder().setName(import_shared.CONTEXT_ACTIONS.tone).setType(import_discord2.ApplicationCommandType.Message),
  new import_discord2.ContextMenuCommandBuilder().setName(import_shared.CONTEXT_ACTIONS.rememberMoment).setType(import_discord2.ApplicationCommandType.Message)
].map((command) => command.toJSON());

// src/router/interaction-router.ts
var import_discord3 = require("discord.js");
var import_shared3 = require("@hori/shared");
var import_memory = require("@hori/memory");

// src/router/owner-lockdown.ts
var import_shared2 = require("@hori/shared");
var LOCKDOWN_CACHE_TTL_MS = 1500;
var cachedState = null;
function isBotOwner(runtime, userId) {
  return runtime.env.DISCORD_OWNER_IDS.includes(userId);
}
async function getOwnerLockdownState(runtime, force = false) {
  if (!force && cachedState && cachedState.expiresAtMs > Date.now()) {
    return cachedState;
  }
  const state = await (0, import_shared2.loadOwnerLockdownState)(runtime.prisma, runtime.logger);
  cachedState = { ...state, expiresAtMs: Date.now() + LOCKDOWN_CACHE_TTL_MS };
  return state;
}
async function setOwnerLockdownState(runtime, enabled, updatedBy) {
  await (0, import_shared2.persistOwnerLockdownState)(runtime.prisma, enabled, updatedBy);
  const state = {
    enabled,
    updatedBy,
    updatedAt: /* @__PURE__ */ new Date()
  };
  cachedState = { ...state, expiresAtMs: Date.now() + LOCKDOWN_CACHE_TTL_MS };
  return state;
}
async function shouldIgnoreForOwnerLockdown(runtime, userId) {
  if (isBotOwner(runtime, userId)) {
    return false;
  }
  if (!runtime.env.DISCORD_OWNER_IDS.length) {
    return false;
  }
  const state = await getOwnerLockdownState(runtime);
  return state.enabled;
}

// src/services/bot-state-service.ts
var HORI_STATE_TABS = ["persona", "brain", "memory", "channel", "search", "queue", "media", "features", "trace", "tokens"];
var BotStateService = class {
  constructor(runtime) {
    this.runtime = runtime;
  }
  runtime;
  async build(tab, guildId, channelId) {
    switch (tab) {
      case "persona":
        return this.persona(guildId, channelId);
      case "brain":
        return this.brain(guildId, channelId);
      case "memory":
        return this.memory(guildId, channelId);
      case "channel":
        return this.channel(guildId, channelId);
      case "search":
        return this.search(guildId);
      case "queue":
        return this.queue(guildId, channelId);
      case "media":
        return this.media(guildId);
      case "features":
        return this.features(guildId);
      case "trace":
        return this.trace(guildId);
      case "tokens":
        return this.tokens(guildId);
    }
  }
  async persona(guildId, channelId) {
    const [routing, mood] = await Promise.all([
      this.runtime.runtimeConfig.getRoutingConfig(guildId, channelId),
      this.runtime.slashAdmin.moodStatus(guildId)
    ]);
    const settings = routing.guildSettings;
    return {
      title: "\u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435: \u043F\u0435\u0440\u0441\u043E\u043D\u0430",
      description: "\u041A\u0430\u043A \u0425\u043E\u0440\u0438 \u0441\u0435\u0439\u0447\u0430\u0441 \u0434\u0435\u0440\u0436\u0438\u0442 \u0445\u0430\u0440\u0430\u043A\u0442\u0435\u0440 \u0438 \u0441\u0442\u0438\u043B\u044C",
      fields: [
        { name: "\u0418\u043C\u044F \u0438 \u044F\u0437\u044B\u043A", value: `${settings.botName} / ${settings.preferredLanguage}`, inline: true },
        { name: "\u041A\u043E\u0440\u043E\u0442\u043A\u043E\u0441\u0442\u044C", value: `replyLength=${settings.replyLength}, maxChars=${routing.runtimeSettings.defaultReplyMaxChars}`, inline: true },
        { name: "\u0422\u043E\u043D", value: `rough=${settings.roughnessLevel}, sarcasm=${settings.sarcasmLevel}, roast=${settings.roastLevel}`, inline: true },
        { name: "Mood", value: clip(mood) },
        { name: "Style", value: clip(settings.preferredStyle || "\u043D\u0435\u0442") }
      ]
    };
  }
  async brain(guildId, channelId) {
    const [routing, power, lockdown] = await Promise.all([
      this.runtime.runtimeConfig.getRoutingConfig(guildId, channelId),
      this.runtime.slashAdmin.powerStatus(),
      getOwnerLockdownState(this.runtime, true)
    ]);
    return {
      title: "\u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435: \u043C\u043E\u0437\u0433\u0438",
      description: "\u041C\u043E\u0434\u0435\u043B\u0438, \u043B\u0438\u043C\u0438\u0442\u044B \u0438 \u0440\u0435\u0436\u0438\u043C\u044B \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u044F",
      fields: [
        { name: "Ollama", value: clip(`url=${this.runtime.env.OLLAMA_BASE_URL ?? "missing"}
fast=${this.runtime.env.OLLAMA_FAST_MODEL}
smart=${this.runtime.env.OLLAMA_SMART_MODEL}`) },
        { name: "Power", value: clip(power) },
        { name: "Runtime", value: clip(`ctx=${routing.runtimeSettings.ollamaNumCtx}, batch=${routing.runtimeSettings.ollamaNumBatch}, replyTokens=${routing.runtimeSettings.llmReplyMaxTokens}`), inline: true },
        { name: "Lockdown", value: lockdown.enabled ? `on, updatedBy=${lockdown.updatedBy ?? "unknown"}` : "off", inline: true }
      ]
    };
  }
  async memory(guildId, channelId) {
    const [serverCount, userCount, channelCount, eventCount, latestBuild] = await Promise.all([
      this.runtime.prisma.serverMemory.count({ where: { guildId } }),
      this.runtime.prisma.userMemoryNote.count({ where: { guildId, active: true } }),
      this.runtime.prisma.channelMemoryNote.count({ where: { guildId, active: true } }),
      this.runtime.prisma.eventMemory.count({ where: { guildId, active: true } }),
      this.runtime.prisma.memoryBuildRun.findFirst({ where: { guildId }, orderBy: { createdAt: "desc" } })
    ]);
    return {
      title: "\u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435: \u043F\u0430\u043C\u044F\u0442\u044C",
      description: "Active Memory \u0438 \u043D\u0430\u043A\u043E\u043F\u043B\u0435\u043D\u043D\u044B\u0435 \u0437\u0430\u043C\u0435\u0442\u043A\u0438",
      fields: [
        { name: "\u0421\u043B\u043E\u0438", value: `server=${serverCount}, user=${userCount}, channel=${channelCount}, event=${eventCount}` },
        { name: "\u0422\u0435\u043A\u0443\u0449\u0438\u0439 \u043A\u0430\u043D\u0430\u043B", value: clip(await this.runtime.slashAdmin.channelMemoryStatus(guildId, channelId)) },
        {
          name: "\u041F\u043E\u0441\u043B\u0435\u0434\u043D\u044F\u044F \u0441\u0431\u043E\u0440\u043A\u0430",
          value: latestBuild ? clip(`${latestBuild.status} / ${latestBuild.scope}:${latestBuild.depth}
${latestBuild.finishedAt?.toISOString() ?? latestBuild.updatedAt.toISOString()}`) : "\u043D\u0435 \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u043B\u0430\u0441\u044C"
        }
      ]
    };
  }
  async channel(guildId, channelId) {
    const [policy, queue, interjectionsHour] = await Promise.all([
      this.runtime.runtimeConfig.getChannelPolicy(guildId, channelId),
      this.runtime.slashAdmin.queueStatus(guildId, channelId),
      this.runtime.prisma.interjectionLog.count({
        where: {
          guildId,
          channelId,
          createdAt: { gte: new Date(Date.now() - 60 * 60 * 1e3) }
        }
      })
    ]);
    return {
      title: "\u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435: \u043A\u0430\u043D\u0430\u043B",
      description: `\u041A\u0430\u043D\u0430\u043B ${channelId}`,
      fields: [
        { name: "Policy", value: `replies=${policy.allowBotReplies}, interjections=${policy.allowInterjections}, muted=${policy.isMuted}` },
        { name: "Tags", value: policy.topicInterestTags.join(", ") || "none" },
        { name: "Queue", value: clip(queue), inline: true },
        { name: "Interjections 1h", value: String(interjectionsHour), inline: true }
      ]
    };
  }
  async search(guildId) {
    const latestSearch = await this.runtime.prisma.botEventLog.findFirst({
      where: { guildId, usedSearch: true },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, routeReason: true, toolCalls: true, debugTrace: true }
    });
    return {
      title: "\u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435: \u043F\u043E\u0438\u0441\u043A",
      description: "Brave, fetch \u0438 fallback",
      fields: [
        { name: "Env", value: clip(`BRAVE=${this.runtime.env.BRAVE_SEARCH_API_KEY ? "set" : "missing"}
maxRequests=${this.runtime.env.SEARCH_MAX_REQUESTS_PER_RESPONSE}
maxPages=${this.runtime.env.SEARCH_MAX_PAGES_PER_RESPONSE}
cooldown=${this.runtime.env.SEARCH_USER_COOLDOWN_SEC}s`) },
        { name: "Denylist", value: this.runtime.env.SEARCH_DOMAIN_DENYLIST.join(", ") || "none" },
        { name: "Latest", value: latestSearch ? clip(`${latestSearch.createdAt.toISOString()}
${latestSearch.routeReason ?? "no reason"}
${JSON.stringify(latestSearch.toolCalls ?? [])}`) : "\u043F\u043E\u0438\u0441\u043A\u043E\u0432\u044B\u0445 trace \u043F\u043E\u043A\u0430 \u043D\u0435\u0442" }
      ]
    };
  }
  async queue(guildId, channelId) {
    const [guildQueue, channelQueue, pending] = await Promise.all([
      this.runtime.slashAdmin.queueStatus(guildId, null),
      this.runtime.slashAdmin.queueStatus(guildId, channelId),
      this.runtime.prisma.replyQueueItem.count({ where: { guildId, status: "queued" } })
    ]);
    return {
      title: "\u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435: \u043E\u0447\u0435\u0440\u0435\u0434\u044C",
      description: "Reply queue \u0438 \u043E\u0436\u0438\u0434\u0430\u043D\u0438\u0435 \u043E\u0442\u0432\u0435\u0442\u043E\u0432",
      fields: [
        { name: "\u0421\u0435\u0440\u0432\u0435\u0440", value: clip(guildQueue) },
        { name: "\u041A\u0430\u043D\u0430\u043B", value: clip(channelQueue) },
        { name: "Pending", value: String(pending), inline: true }
      ]
    };
  }
  async media(guildId) {
    const [enabled, disabled, used24h, latest] = await Promise.all([
      this.runtime.prisma.mediaMetadata.count({ where: { enabled: true } }),
      this.runtime.prisma.mediaMetadata.count({ where: { enabled: false } }),
      this.runtime.prisma.mediaUsageLog.count({
        where: { guildId, usedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1e3) } }
      }),
      this.runtime.prisma.mediaUsageLog.findFirst({ where: { guildId }, orderBy: { usedAt: "desc" } })
    ]);
    return {
      title: "\u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435: \u043C\u0435\u0434\u0438\u0430",
      description: "GIF/media registry",
      fields: [
        { name: "Registry", value: `enabled=${enabled}, disabled=${disabled}`, inline: true },
        { name: "Used 24h", value: String(used24h), inline: true },
        { name: "Latest", value: latest ? `${latest.mediaId} / ${latest.reasonKey ?? "no reason"} / ${latest.usedAt.toISOString()}` : "\u0435\u0449\u0451 \u043D\u0435 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u043B\u0438\u0441\u044C" }
      ]
    };
  }
  async features(guildId) {
    const flags = await this.runtime.runtimeConfig.getFeatureFlags(guildId);
    const on = Object.entries(flags).filter(([, enabled]) => enabled).map(([key]) => key);
    const off = Object.entries(flags).filter(([, enabled]) => !enabled).map(([key]) => key);
    return {
      title: "\u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435: \u0444\u0438\u0447\u0438",
      description: "Runtime feature flags",
      fields: [
        { name: "On", value: clip(on.join(", ") || "none") },
        { name: "Off", value: clip(off.join(", ") || "none") }
      ]
    };
  }
  async trace(guildId) {
    const latest = await this.runtime.prisma.botEventLog.findFirst({
      where: { guildId },
      orderBy: { createdAt: "desc" },
      select: {
        messageId: true,
        eventType: true,
        intent: true,
        routeReason: true,
        modelUsed: true,
        usedSearch: true,
        latencyMs: true,
        promptTokens: true,
        completionTokens: true,
        totalTokens: true,
        tokenSource: true,
        debugTrace: true,
        createdAt: true
      }
    });
    return {
      title: "\u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435: trace",
      description: "\u041F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u0439 bot event",
      fields: [
        {
          name: "Latest",
          value: latest ? clip(`${latest.createdAt.toISOString()}
${latest.eventType}/${latest.intent ?? "none"} model=${latest.modelUsed ?? "none"} latency=${latest.latencyMs ?? "?"}ms
tokens=${latest.totalTokens ?? "none"} (${latest.tokenSource ?? "n/a"})
${latest.routeReason ?? "no reason"}`) : "trace \u043F\u043E\u043A\u0430 \u043D\u0435\u0442"
        },
        { name: "Debug", value: latest ? clip(JSON.stringify(latest.debugTrace, null, 2)) : "none" }
      ]
    };
  }
  async tokens(guildId) {
    const [day, week, searchDay] = await Promise.all([
      this.tokenWindow(guildId, 24 * 60 * 60 * 1e3),
      this.tokenWindow(guildId, 7 * 24 * 60 * 60 * 1e3),
      this.tokenWindow(guildId, 24 * 60 * 60 * 1e3, true)
    ]);
    return {
      title: "\u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435: \u0442\u043E\u043A\u0435\u043D\u044B",
      description: "\u0420\u0435\u0430\u043B\u044C\u043D\u044B\u0435 Ollama usage, \u0435\u0441\u043B\u0438 \u043C\u043E\u0434\u0435\u043B\u044C \u043F\u0440\u0438\u0441\u043B\u0430\u043B\u0430 \u0441\u0447\u0451\u0442\u0447\u0438\u043A\u0438; \u0438\u043D\u0430\u0447\u0435 \u043E\u0446\u0435\u043D\u043A\u0430 chars/4",
      fields: [
        { name: "24h", value: day },
        { name: "7d", value: week },
        { name: "Search 24h", value: searchDay },
        { name: "\u041E\u0431\u044B\u0447\u043D\u044B\u0439 \u043E\u0442\u0432\u0435\u0442", value: "\u041E\u0446\u0435\u043D\u043A\u0430 \u0434\u043E \u0442\u0435\u043B\u0435\u043C\u0435\u0442\u0440\u0438\u0438: \u043F\u0440\u0438\u043C\u0435\u0440\u043D\u043E 2k-4k input \u0438 10-80 output tokens; search \u0447\u0430\u0441\u0442\u043E 4k-8k+ input." }
      ]
    };
  }
  async tokenWindow(guildId, windowMs, usedSearch) {
    const aggregate = await this.runtime.prisma.botEventLog.aggregate({
      where: {
        guildId,
        createdAt: { gte: new Date(Date.now() - windowMs) },
        totalTokens: { not: null },
        ...usedSearch === void 0 ? {} : { usedSearch }
      },
      _count: { _all: true },
      _sum: { promptTokens: true, completionTokens: true, totalTokens: true },
      _avg: { promptTokens: true, completionTokens: true, totalTokens: true }
    });
    const count = aggregate._count._all;
    if (!count) {
      return "\u043D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445";
    }
    return [
      `calls=${count}`,
      `avg input=${formatNumber(aggregate._avg.promptTokens)}, output=${formatNumber(aggregate._avg.completionTokens)}, total=${formatNumber(aggregate._avg.totalTokens)}`,
      `sum input=${aggregate._sum.promptTokens ?? 0}, output=${aggregate._sum.completionTokens ?? 0}, total=${aggregate._sum.totalTokens ?? 0}`
    ].join("\n");
  }
};
function parseHoriStateTab(value) {
  return HORI_STATE_TABS.includes(value) ? value : null;
}
function horiStateTabLabel(tab) {
  const labels = {
    persona: "\u041F\u0435\u0440\u0441\u043E\u043D\u0430",
    brain: "\u041C\u043E\u0437\u0433\u0438",
    memory: "\u041F\u0430\u043C\u044F\u0442\u044C",
    channel: "\u041A\u0430\u043D\u0430\u043B",
    search: "\u041F\u043E\u0438\u0441\u043A",
    queue: "\u041E\u0447\u0435\u0440\u0435\u0434\u044C",
    media: "\u041C\u0435\u0434\u0438\u0430",
    features: "\u0424\u0438\u0447\u0438",
    trace: "Trace",
    tokens: "\u0422\u043E\u043A\u0435\u043D\u044B"
  };
  return labels[tab];
}
function clip(value, max = 1e3) {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value || "none";
}
function formatNumber(value) {
  return value === null ? "n/a" : value.toFixed(0);
}

// src/router/interaction-router.ts
var PUBLIC_COMMANDS = /* @__PURE__ */ new Set(["hori", "bot-help", "bot-album"]);
var OWNER_COMMANDS = /* @__PURE__ */ new Set(["bot-ai-url", "bot-import", "bot-lockdown", "bot-power"]);
var MEMORY_ALBUM_MODAL_PREFIX = "memory-album";
var HORI_MODAL_PREFIX = "hori-modal";
var HORI_PANEL_PREFIX = "hori-panel";
var HORI_ACTION_PREFIX = "hori-action";
var HORI_STATE_PANEL_PREFIX = "hori-state";
var POWER_PANEL_PREFIX = "power-panel";
var POWER_PROFILES = ["economy", "balanced", "expanded", "max"];
var HORI_PANEL_TABS = ["main", "owner", "style", "liveliness", "memory", "people", "channels", "search", "experiments", "diagnostics"];
var PANEL_FEATURE_LABELS = {
  web_search: "Web search",
  link_understanding_enabled: "Link understanding",
  auto_interject: "Auto interject",
  reply_queue_enabled: "Reply queue",
  media_reactions_enabled: "Media reactions",
  selective_engagement_enabled: "Selective engage",
  context_actions: "Context actions",
  self_reflection_lessons_enabled: "Reflection",
  playful_mode_enabled: "Playful mode",
  irritated_mode_enabled: "Irritated mode",
  roast: "Roast",
  memory_album_enabled: "Memory album",
  interaction_requests_enabled: "Interaction requests",
  topic_engine_enabled: "Topic engine",
  anti_slop_strict_mode: "Anti-slop",
  context_confidence_enabled: "Context confidence",
  channel_aware_mode: "Channel-aware",
  message_kind_aware_mode: "Kind-aware"
};
var HORI_PANEL_OWNER_ONLY_MESSAGE = "Hori master panel \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430 \u0442\u043E\u043B\u044C\u043A\u043E \u0432\u043B\u0430\u0434\u0435\u043B\u044C\u0446\u0443. \u0414\u043B\u044F \u043E\u0431\u044B\u0447\u043D\u043E\u0439 \u0440\u0430\u0431\u043E\u0442\u044B \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439 \u043F\u0440\u044F\u043C\u044B\u0435 \u0432\u0435\u0442\u043A\u0438 /hori.";
function ensureModerator(interaction) {
  return interaction.memberPermissions?.has(import_discord3.PermissionFlagsBits.ManageGuild) ?? false;
}
async function routeInteraction(runtime, interaction) {
  const isOwner = isBotOwner(runtime, interaction.user.id);
  if (!isOwner && await shouldIgnoreForOwnerLockdown(runtime, interaction.user.id)) {
    return;
  }
  if (interaction.isButton()) {
    await routeButtonInteraction(runtime, interaction, isOwner);
    return;
  }
  if (interaction.isStringSelectMenu()) {
    await routeStringSelectInteraction(runtime, interaction, isOwner);
    return;
  }
  if (interaction.isModalSubmit()) {
    await routeModalSubmit(runtime, interaction);
    return;
  }
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "bot-lockdown") {
      await handleOwnerLockdownCommand(runtime, interaction, isOwner);
      return;
    }
    if (!interaction.guildId) {
      await interaction.reply({ content: "\u0422\u043E\u043B\u044C\u043A\u043E \u0432\u043D\u0443\u0442\u0440\u0438 \u0441\u0435\u0440\u0432\u0435\u0440\u0430.", flags: import_discord3.MessageFlags.Ephemeral });
      return;
    }
    const isModerator = ensureModerator(interaction);
    if (!isModerator && !PUBLIC_COMMANDS.has(interaction.commandName) && !(isOwner && OWNER_COMMANDS.has(interaction.commandName))) {
      await interaction.reply({ content: "\u042D\u0442\u043E \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u043C\u043E\u0434\u0435\u0440\u043E\u0432.", flags: import_discord3.MessageFlags.Ephemeral });
      return;
    }
    switch (interaction.commandName) {
      case "hori":
        await handleHoriCommand(runtime, interaction, isOwner, isModerator);
        return;
      case "bot-help":
        await interaction.reply({ content: await runtime.slashAdmin.handleHelp(), flags: import_discord3.MessageFlags.Ephemeral });
        return;
      case "bot-ai-url": {
        const isOwner2 = runtime.env.DISCORD_OWNER_IDS.includes(interaction.user.id);
        if (!isOwner2) {
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
              await (0, import_shared3.persistOllamaBaseUrl)(runtime.prisma, newUrl, interaction.user.id);
              status += "\n\u{1F4BE} URL \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D \u0438 \u043F\u0435\u0440\u0435\u0436\u0438\u0432\u0451\u0442 \u0440\u0435\u0441\u0442\u0430\u0440\u0442.";
            } catch (error) {
              runtime.logger.warn({ error: (0, import_shared3.asErrorMessage)(error), url: newUrl }, "failed to persist ollama url");
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
            preferredLanguage: interaction.options.getString("preferred-language"),
            roughnessLevel: interaction.options.getInteger("roughness"),
            sarcasmLevel: interaction.options.getInteger("sarcasm"),
            roastLevel: interaction.options.getInteger("roast"),
            interjectTendency: interaction.options.getInteger("interject-tendency"),
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
      case "bot-album": {
        const featureFlags2 = await runtime.runtimeConfig.getFeatureFlags(interaction.guildId);
        if (!featureFlags2.memoryAlbumEnabled) {
          await interaction.reply({ content: "Memory Album \u0441\u0435\u0439\u0447\u0430\u0441 \u0432\u044B\u043A\u043B\u044E\u0447\u0435\u043D.", flags: import_discord3.MessageFlags.Ephemeral });
          return;
        }
        const content = interaction.options.getSubcommand() === "remove" ? await runtime.slashAdmin.albumRemove(
          interaction.guildId,
          interaction.user.id,
          interaction.options.getString("id", true)
        ) : await runtime.slashAdmin.albumList(
          interaction.guildId,
          interaction.user.id,
          interaction.options.getInteger("limit") ?? 8
        );
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
              toneBias: interaction.options.getString("tone-bias") ?? void 0,
              roastLevel: interaction.options.getInteger("roast-level") ?? void 0,
              praiseBias: interaction.options.getInteger("praise-bias") ?? void 0,
              interruptPriority: interaction.options.getInteger("interrupt-priority") ?? void 0,
              doNotMock: interaction.options.getBoolean("do-not-mock") ?? void 0,
              doNotInitiate: interaction.options.getBoolean("do-not-initiate") ?? void 0,
              protectedTopics: interaction.options.getString("protected-topics") ? (0, import_shared3.parseCsv)(interaction.options.getString("protected-topics") ?? void 0) : void 0,
              closeness: interaction.options.getNumber("closeness") ?? void 0,
              trustLevel: interaction.options.getNumber("trust") ?? void 0,
              familiarity: interaction.options.getNumber("familiarity") ?? void 0,
              proactivityPreference: interaction.options.getNumber("proactivity") ?? void 0
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
      case "bot-power": {
        if (!isOwner) {
          await interaction.reply({ content: "\u042D\u0442\u0430 \u043A\u043E\u043C\u0430\u043D\u0434\u0430 \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u0432\u043B\u0430\u0434\u0435\u043B\u044C\u0446\u0430 \u0431\u043E\u0442\u0430.", flags: import_discord3.MessageFlags.Ephemeral });
          return;
        }
        const subcommand = interaction.options.getSubcommand();
        if (subcommand === "panel") {
          const status = await runtime.runtimeConfig.getPowerProfileStatus();
          await interaction.reply({
            ...buildPowerPanelResponse(await runtime.slashAdmin.powerPanel(), status.activeProfile),
            flags: import_discord3.MessageFlags.Ephemeral
          });
          return;
        }
        const content = subcommand === "apply" ? await runtime.slashAdmin.powerApply(
          interaction.options.getString("profile", true),
          interaction.user.id
        ) : await runtime.slashAdmin.powerStatus();
        await interaction.reply({ content, flags: import_discord3.MessageFlags.Ephemeral });
        return;
      }
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
              responseLengthOverride: parseReplyLengthSelection(interaction.options.getString("response-length")),
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
      case "bot-reflection": {
        const content = interaction.options.getSubcommand() === "list" ? await runtime.slashAdmin.reflectionList(interaction.guildId, interaction.options.getInteger("limit") ?? 8) : await runtime.slashAdmin.reflectionStatus(interaction.guildId);
        await interaction.reply({ content, flags: import_discord3.MessageFlags.Ephemeral });
        return;
      }
      case "bot-media": {
        const subcommand = interaction.options.getSubcommand();
        if (subcommand === "sync-pack" && !isOwner) {
          await interaction.reply({ content: "\u0421\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u044F pack \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430 \u0442\u043E\u043B\u044C\u043A\u043E \u0432\u043B\u0430\u0434\u0435\u043B\u044C\u0446\u0443 \u0431\u043E\u0442\u0430.", flags: import_discord3.MessageFlags.Ephemeral });
          return;
        }
        const content = subcommand === "add" ? await runtime.slashAdmin.mediaAdd({
          mediaId: interaction.options.getString("id", true),
          type: interaction.options.getString("type", true),
          filePath: interaction.options.getString("path", true),
          triggerTags: interaction.options.getString("trigger-tags"),
          toneTags: interaction.options.getString("tone-tags"),
          allowedChannels: interaction.options.getString("channels"),
          allowedMoods: interaction.options.getString("moods"),
          nsfw: interaction.options.getBoolean("nsfw")
        }) : subcommand === "sync-pack" ? await runtime.slashAdmin.mediaSyncPack(interaction.options.getString("path") ?? "assets/memes/catalog.json") : subcommand === "disable" ? await runtime.slashAdmin.mediaDisable(interaction.options.getString("id", true)) : await runtime.slashAdmin.mediaList();
        await interaction.reply({ content, flags: import_discord3.MessageFlags.Ephemeral });
        return;
      }
      case "bot-import": {
        const isOwner2 = runtime.env.DISCORD_OWNER_IDS.includes(interaction.user.id);
        if (!isOwner2) {
          await interaction.reply({ content: "\u0418\u043C\u043F\u043E\u0440\u0442 \u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D \u0442\u043E\u043B\u044C\u043A\u043E \u0432\u043B\u0430\u0434\u0435\u043B\u044C\u0446\u0443 \u0431\u043E\u0442\u0430.", flags: import_discord3.MessageFlags.Ephemeral });
          return;
        }
        const attachment = interaction.options.getAttachment("file", true);
        if (!attachment.name.endsWith(".json")) {
          await interaction.reply({ content: "\u041D\u0443\u0436\u0435\u043D .json \u0444\u0430\u0439\u043B.", flags: import_discord3.MessageFlags.Ephemeral });
          return;
        }
        if (attachment.size > 50 * 1024 * 1024) {
          await interaction.reply({ content: "\u0424\u0430\u0439\u043B \u0441\u043B\u0438\u0448\u043A\u043E\u043C \u0431\u043E\u043B\u044C\u0448\u043E\u0439 (\u043C\u0430\u043A\u0441 50 \u041C\u0411).", flags: import_discord3.MessageFlags.Ephemeral });
          return;
        }
        await interaction.deferReply({ flags: import_discord3.MessageFlags.Ephemeral });
        try {
          const response = await fetch(attachment.url);
          if (!response.ok) {
            await interaction.editReply({ content: `\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043A\u0430\u0447\u0430\u0442\u044C \u0444\u0430\u0439\u043B: ${response.status}` });
            return;
          }
          const data = await response.json();
          const guildId = data.guildId ?? interaction.guildId;
          const messages = data.messages;
          if (!Array.isArray(messages) || messages.length === 0) {
            await interaction.editReply({ content: "\u0424\u0430\u0439\u043B \u043F\u0443\u0441\u0442 \u0438\u043B\u0438 \u043D\u0435 \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u0442 \u043C\u0430\u0441\u0441\u0438\u0432 messages." });
            return;
          }
          if (messages.length > 5e4) {
            await interaction.editReply({ content: "\u041C\u0430\u043A\u0441\u0438\u043C\u0443\u043C 50 000 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0439 \u0437\u0430 \u0440\u0430\u0437." });
            return;
          }
          await runtime.prisma.guild.upsert({
            where: { id: guildId },
            update: {},
            create: { id: guildId }
          });
          let imported = 0;
          let skipped = 0;
          let errors = 0;
          const seenUsers = /* @__PURE__ */ new Set();
          const userMsgCounts = /* @__PURE__ */ new Map();
          for (const entry of messages) {
            if (!entry.userId || !entry.content || !entry.timestamp) {
              skipped++;
              continue;
            }
            const createdAt = new Date(entry.timestamp);
            if (isNaN(createdAt.getTime())) {
              skipped++;
              continue;
            }
            const messageId = `import:${guildId}:${entry.userId}:${createdAt.getTime()}`;
            try {
              const exists = await runtime.prisma.message.findUnique({ where: { id: messageId }, select: { id: true } });
              if (exists) {
                skipped++;
                continue;
              }
              await runtime.prisma.user.upsert({
                where: { id: entry.userId },
                update: { username: entry.username ?? void 0 },
                create: { id: entry.userId, username: entry.username ?? null }
              });
              await runtime.prisma.message.create({
                data: {
                  id: messageId,
                  guildId,
                  channelId: entry.channelId ?? "imported",
                  userId: entry.userId,
                  content: entry.content,
                  createdAt,
                  charCount: entry.content.length,
                  tokenEstimate: Math.ceil(entry.content.length / 4),
                  mentionCount: 0,
                  replyToMessageId: entry.replyToId ? `import:${guildId}:${entry.replyToId}` : void 0
                }
              });
              seenUsers.add(entry.userId);
              userMsgCounts.set(entry.userId, (userMsgCounts.get(entry.userId) ?? 0) + 1);
              imported++;
            } catch {
              errors++;
            }
          }
          let seeded = 0;
          if (userMsgCounts.size > 0) {
            try {
              const relService = new import_memory.RelationshipService(runtime.prisma);
              seeded = await relService.seedFromImportedHistory(guildId, userMsgCounts);
            } catch {
            }
          }
          await interaction.editReply({
            content: `\u2705 \u0418\u043C\u043F\u043E\u0440\u0442 \u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043D
\u{1F4E5} \u0418\u043C\u043F\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u043E: ${imported}
\u23ED\uFE0F \u041F\u0440\u043E\u043F\u0443\u0449\u0435\u043D\u043E: ${skipped}
\u274C \u041E\u0448\u0438\u0431\u043E\u043A: ${errors}
\u{1F464} \u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u0435\u0439: ${seenUsers.size}
\u{1F91D} \u041F\u0440\u043E\u0444\u0438\u043B\u0435\u0439 \u043E\u0442\u043D\u043E\u0448\u0435\u043D\u0438\u0439 \u0441\u043E\u0437\u0434\u0430\u043D\u043E: ${seeded}`
          });
        } catch (err) {
          await interaction.editReply({ content: `\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u0438\u043C\u043F\u043E\u0440\u0442\u0430: ${err instanceof Error ? err.message : "unknown"}` });
        }
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
  if (interaction.commandName === import_shared3.CONTEXT_ACTIONS.rememberMoment) {
    await handleRememberMomentContext(runtime, interaction, featureFlags);
    return;
  }
  if (!featureFlags.contextActions) {
    await interaction.reply({ content: "\u041A\u043E\u043D\u0442\u0435\u043A\u0441\u0442\u043D\u044B\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044F \u0432\u044B\u043A\u043B\u044E\u0447\u0435\u043D\u044B.", flags: import_discord3.MessageFlags.Ephemeral });
    return;
  }
  const action = interaction.commandName === import_shared3.CONTEXT_ACTIONS.explain ? "explain" : interaction.commandName === import_shared3.CONTEXT_ACTIONS.summarize ? "summarize" : "tone";
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
async function handleHoriCommand(runtime, interaction, isOwner, isModerator) {
  if (!interaction.guildId) {
    await interaction.reply({ content: "\u0422\u043E\u043B\u044C\u043A\u043E \u0432\u043D\u0443\u0442\u0440\u0438 \u0441\u0435\u0440\u0432\u0435\u0440\u0430.", flags: import_discord3.MessageFlags.Ephemeral });
    return;
  }
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "panel") {
    if (!isOwner) {
      await interaction.reply({ content: HORI_PANEL_OWNER_ONLY_MESSAGE, flags: import_discord3.MessageFlags.Ephemeral });
      return;
    }
    const tab = parseHoriPanelTab(interaction.options.getString("tab")) ?? "main";
    await interaction.reply({
      ...buildHoriPanelResponse(tab, isOwner, isModerator),
      flags: import_discord3.MessageFlags.Ephemeral
    });
    return;
  }
  if (subcommand === "state") {
    if (!isOwner) {
      await interaction.reply({ content: "\u041F\u0430\u043D\u0435\u043B\u044C \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u0432\u043B\u0430\u0434\u0435\u043B\u044C\u0446\u0430.", flags: import_discord3.MessageFlags.Ephemeral });
      return;
    }
    const tab = parseHoriStateTab(interaction.options.getString("tab")) ?? "persona";
    await interaction.reply({
      ...await buildHoriStatePanelResponse(runtime, tab, interaction.guildId, interaction.channelId),
      flags: import_discord3.MessageFlags.Ephemeral
    });
    return;
  }
  if (subcommand === "search") {
    await handleHoriSearchCommand(runtime, interaction, isModerator);
    return;
  }
  if (subcommand === "memory-build") {
    const scope = interaction.options.getString("scope", true);
    const depth = interaction.options.getString("depth") ?? "recent";
    if (!isOwner && (!isModerator || scope === "server")) {
      await interaction.reply({
        content: scope === "server" ? "\u0421\u0431\u043E\u0440\u043A\u0430 \u043F\u0430\u043C\u044F\u0442\u0438 \u043F\u043E \u0432\u0441\u0435\u043C\u0443 \u0441\u0435\u0440\u0432\u0435\u0440\u0443 \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u0432\u043B\u0430\u0434\u0435\u043B\u044C\u0446\u0430." : "Memory-build \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u043C\u043E\u0434\u0435\u0440\u043E\u0432.",
        flags: import_discord3.MessageFlags.Ephemeral
      });
      return;
    }
    await interaction.reply({
      content: await startMemoryBuildRun(runtime, interaction.guildId, scope === "channel" ? interaction.channelId : null, scope, depth, interaction.user.id),
      flags: import_discord3.MessageFlags.Ephemeral
    });
    return;
  }
  if (subcommand === "profile") {
    const target = interaction.options.getUser("user")?.id ?? interaction.user.id;
    if (target !== interaction.user.id && !isOwner && !isModerator) {
      await interaction.reply({ content: "\u0427\u0443\u0436\u043E\u0439 \u043F\u0440\u043E\u0444\u0438\u043B\u044C \u0432\u0438\u0434\u0438\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \u043C\u043E\u0434\u0435\u0440/\u0432\u043B\u0430\u0434\u0435\u043B\u0435\u0446.", flags: import_discord3.MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({
      content: await runtime.slashAdmin.personalMemory(interaction.guildId, target, isOwner || isModerator),
      flags: import_discord3.MessageFlags.Ephemeral
    });
    return;
  }
  if (subcommand === "dossier") {
    if (!isOwner) {
      await interaction.reply({ content: "\u0414\u043E\u0441\u044C\u0435 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E \u0442\u043E\u043B\u044C\u043A\u043E \u0432\u043B\u0430\u0434\u0435\u043B\u044C\u0446\u0443.", flags: import_discord3.MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({
      content: await runtime.slashAdmin.personDossier(interaction.guildId, interaction.options.getUser("user", true).id),
      flags: import_discord3.MessageFlags.Ephemeral
    });
    return;
  }
  if (subcommand === "relationship") {
    if (!isOwner) {
      await interaction.reply({ content: "Relationship-\u0446\u0438\u0444\u0440\u044B \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u0432\u043B\u0430\u0434\u0435\u043B\u044C\u0446\u0430.", flags: import_discord3.MessageFlags.Ephemeral });
      return;
    }
    const targetUserId = interaction.options.getUser("user", true).id;
    const hasUpdate = interaction.options.getString("tone-bias") !== null || interaction.options.getInteger("roast-level") !== null || interaction.options.getInteger("praise-bias") !== null || interaction.options.getInteger("interrupt-priority") !== null || interaction.options.getBoolean("do-not-mock") !== null || interaction.options.getBoolean("do-not-initiate") !== null || interaction.options.getString("protected-topics") !== null || interaction.options.getNumber("closeness") !== null || interaction.options.getNumber("trust") !== null || interaction.options.getNumber("familiarity") !== null || interaction.options.getNumber("proactivity") !== null;
    const content = hasUpdate ? [
      await runtime.slashAdmin.updateRelationship(interaction.guildId, targetUserId, interaction.user.id, {
        toneBias: interaction.options.getString("tone-bias") ?? void 0,
        roastLevel: interaction.options.getInteger("roast-level") ?? void 0,
        praiseBias: interaction.options.getInteger("praise-bias") ?? void 0,
        interruptPriority: interaction.options.getInteger("interrupt-priority") ?? void 0,
        doNotMock: interaction.options.getBoolean("do-not-mock") ?? void 0,
        doNotInitiate: interaction.options.getBoolean("do-not-initiate") ?? void 0,
        protectedTopics: interaction.options.getString("protected-topics") ? (0, import_shared3.parseCsv)(interaction.options.getString("protected-topics") ?? void 0) : void 0,
        closeness: interaction.options.getNumber("closeness") ?? void 0,
        trustLevel: interaction.options.getNumber("trust") ?? void 0,
        familiarity: interaction.options.getNumber("familiarity") ?? void 0,
        proactivityPreference: interaction.options.getNumber("proactivity") ?? void 0
      }),
      "",
      await runtime.slashAdmin.relationshipDetails(interaction.guildId, targetUserId)
    ].join("\n") : await runtime.slashAdmin.relationshipDetails(interaction.guildId, targetUserId);
    await interaction.reply({
      content,
      flags: import_discord3.MessageFlags.Ephemeral
    });
    return;
  }
  if (subcommand === "memory") {
    if (!isOwner && !isModerator) {
      await interaction.reply({ content: "\u041F\u0430\u043C\u044F\u0442\u044C \u0441\u0435\u0440\u0432\u0435\u0440\u0430 \u0447\u0435\u0440\u0435\u0437 `/hori memory` \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u043C\u043E\u0434\u0435\u0440\u043E\u0432.", flags: import_discord3.MessageFlags.Ephemeral });
      return;
    }
    const action = interaction.options.getString("action", true);
    const key = interaction.options.getString("key", true);
    const content = action === "remember" ? await runtime.slashAdmin.remember(interaction.guildId, interaction.user.id, key, interaction.options.getString("value") ?? "") : await runtime.slashAdmin.forget(interaction.guildId, key);
    await interaction.reply({ content, flags: import_discord3.MessageFlags.Ephemeral });
    return;
  }
  if (subcommand === "channel") {
    if (!isOwner && !isModerator) {
      await interaction.reply({ content: "\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u043A\u0430\u043D\u0430\u043B\u0430 \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u043C\u043E\u0434\u0435\u0440\u043E\u0432.", flags: import_discord3.MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({
      content: await runtime.slashAdmin.channelConfig(
        interaction.guildId,
        interaction.options.getChannel("channel")?.id ?? interaction.channelId,
        {
          allowBotReplies: interaction.options.getBoolean("allow-bot-replies"),
          allowInterjections: interaction.options.getBoolean("allow-interjections"),
          isMuted: interaction.options.getBoolean("is-muted"),
          responseLengthOverride: parseReplyLengthSelection(interaction.options.getString("response-length")),
          topicInterestTags: interaction.options.getString("topic-interest-tags")
        }
      ),
      flags: import_discord3.MessageFlags.Ephemeral
    });
    return;
  }
  if (subcommand === "summary") {
    if (!isOwner && !isModerator) {
      await interaction.reply({ content: "\u0421\u0432\u043E\u0434\u043A\u0438 \u043A\u0430\u043D\u0430\u043B\u0430 \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u043C\u043E\u0434\u0435\u0440\u043E\u0432.", flags: import_discord3.MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({
      content: await runtime.slashAdmin.summary(interaction.guildId, interaction.options.getChannel("channel")?.id ?? interaction.channelId),
      flags: import_discord3.MessageFlags.Ephemeral
    });
    return;
  }
  if (subcommand === "stats") {
    if (!isOwner && !isModerator) {
      await interaction.reply({ content: "\u0421\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043A\u0430 \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u043C\u043E\u0434\u0435\u0440\u043E\u0432.", flags: import_discord3.MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({ content: await runtime.slashAdmin.stats(interaction.guildId), flags: import_discord3.MessageFlags.Ephemeral });
    return;
  }
  if (subcommand === "topic") {
    if (!isOwner && !isModerator) {
      await interaction.reply({ content: "\u0422\u0435\u043C\u044B \u043A\u0430\u043D\u0430\u043B\u0430 \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u043C\u043E\u0434\u0435\u0440\u043E\u0432.", flags: import_discord3.MessageFlags.Ephemeral });
      return;
    }
    const channelId = interaction.options.getChannel("channel")?.id ?? interaction.channelId;
    const content = interaction.options.getString("action", true) === "reset" ? await runtime.slashAdmin.topicReset(interaction.guildId, channelId) : await runtime.slashAdmin.topicStatus(interaction.guildId, channelId);
    await interaction.reply({ content, flags: import_discord3.MessageFlags.Ephemeral });
    return;
  }
  if (subcommand === "mood") {
    if (!isOwner && !isModerator) {
      await interaction.reply({ content: "Mood \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u043C\u043E\u0434\u0435\u0440\u043E\u0432.", flags: import_discord3.MessageFlags.Ephemeral });
      return;
    }
    const action = interaction.options.getString("action", true);
    const content = action === "set" ? await runtime.slashAdmin.moodSet(
      interaction.guildId,
      interaction.options.getString("mode") ?? "normal",
      interaction.options.getInteger("minutes") ?? 60,
      interaction.options.getString("reason")
    ) : action === "clear" ? await runtime.slashAdmin.moodClear(interaction.guildId) : await runtime.slashAdmin.moodStatus(interaction.guildId);
    await interaction.reply({ content, flags: import_discord3.MessageFlags.Ephemeral });
    return;
  }
  if (subcommand === "queue") {
    if (!isOwner && !isModerator) {
      await interaction.reply({ content: "\u041E\u0447\u0435\u0440\u0435\u0434\u044C \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u043C\u043E\u0434\u0435\u0440\u043E\u0432.", flags: import_discord3.MessageFlags.Ephemeral });
      return;
    }
    const channelId = interaction.options.getChannel("channel")?.id ?? null;
    const content = interaction.options.getString("action", true) === "clear" ? await runtime.slashAdmin.queueClear(interaction.guildId, channelId) : await runtime.slashAdmin.queueStatus(interaction.guildId, channelId);
    await interaction.reply({ content, flags: import_discord3.MessageFlags.Ephemeral });
    return;
  }
  if (subcommand === "album") {
    const featureFlags = await runtime.runtimeConfig.getFeatureFlags(interaction.guildId);
    if (!featureFlags.memoryAlbumEnabled) {
      await interaction.reply({ content: "Memory Album \u0441\u0435\u0439\u0447\u0430\u0441 \u0432\u044B\u043A\u043B\u044E\u0447\u0435\u043D.", flags: import_discord3.MessageFlags.Ephemeral });
      return;
    }
    const action = interaction.options.getString("action", true);
    const content = action === "remove" ? await runtime.slashAdmin.albumRemove(interaction.guildId, interaction.user.id, interaction.options.getString("id") ?? "") : await runtime.slashAdmin.albumList(interaction.guildId, interaction.user.id, interaction.options.getInteger("limit") ?? 8);
    await interaction.reply({ content, flags: import_discord3.MessageFlags.Ephemeral });
    return;
  }
  if (subcommand === "debug") {
    if (!isOwner && !isModerator) {
      await interaction.reply({ content: "Debug trace \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u043C\u043E\u0434\u0435\u0440\u043E\u0432.", flags: import_discord3.MessageFlags.Ephemeral });
      return;
    }
    const messageId = interaction.options.getString("message-id");
    await interaction.reply({
      content: messageId ? await runtime.slashAdmin.debugTrace(messageId) : await buildLatestDebugTrace(runtime, interaction.guildId),
      flags: import_discord3.MessageFlags.Ephemeral
    });
    return;
  }
  if (subcommand === "feature") {
    if (!isOwner && !isModerator) {
      await interaction.reply({ content: "Feature flags \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u043C\u043E\u0434\u0435\u0440\u043E\u0432.", flags: import_discord3.MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({
      content: await runtime.slashAdmin.updateFeature(
        interaction.guildId,
        interaction.options.getString("key", true),
        interaction.options.getBoolean("enabled", true)
      ),
      flags: import_discord3.MessageFlags.Ephemeral
    });
    return;
  }
  if (subcommand === "media") {
    if (!isOwner && !isModerator) {
      await interaction.reply({ content: "Media registry \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u043C\u043E\u0434\u0435\u0440\u043E\u0432.", flags: import_discord3.MessageFlags.Ephemeral });
      return;
    }
    const action = interaction.options.getString("action", true);
    if (action === "sync-pack" && !isOwner) {
      await interaction.reply({ content: "\u0421\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u044F pack \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430 \u0442\u043E\u043B\u044C\u043A\u043E \u0432\u043B\u0430\u0434\u0435\u043B\u044C\u0446\u0443.", flags: import_discord3.MessageFlags.Ephemeral });
      return;
    }
    const content = action === "add" ? await runtime.slashAdmin.mediaAdd({
      mediaId: interaction.options.getString("id") ?? "",
      type: interaction.options.getString("type") ?? "image",
      filePath: interaction.options.getString("path") ?? "",
      triggerTags: interaction.options.getString("trigger-tags"),
      toneTags: interaction.options.getString("tone-tags"),
      allowedChannels: interaction.options.getString("channels"),
      allowedMoods: interaction.options.getString("moods"),
      nsfw: interaction.options.getBoolean("nsfw")
    }) : action === "sync-pack" ? await runtime.slashAdmin.mediaSyncPack(interaction.options.getString("path") ?? "assets/memes/catalog.json") : action === "disable" ? await runtime.slashAdmin.mediaDisable(interaction.options.getString("id") ?? "") : await runtime.slashAdmin.mediaList();
    await interaction.reply({ content, flags: import_discord3.MessageFlags.Ephemeral });
    return;
  }
  if (subcommand === "power") {
    if (!isOwner) {
      await interaction.reply({ content: "Power \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u0432\u043B\u0430\u0434\u0435\u043B\u044C\u0446\u0430.", flags: import_discord3.MessageFlags.Ephemeral });
      return;
    }
    const action = interaction.options.getString("action", true);
    if (action === "panel") {
      const status = await runtime.runtimeConfig.getPowerProfileStatus();
      await interaction.reply({
        ...buildPowerPanelResponse(await runtime.slashAdmin.powerPanel(), status.activeProfile),
        flags: import_discord3.MessageFlags.Ephemeral
      });
      return;
    }
    const content = action === "apply" ? await runtime.slashAdmin.powerApply(interaction.options.getString("profile") ?? "balanced", interaction.user.id) : await runtime.slashAdmin.powerStatus();
    await interaction.reply({ content, flags: import_discord3.MessageFlags.Ephemeral });
    return;
  }
  if (subcommand === "ai-url") {
    await handleHoriAiUrlCommand(runtime, interaction, isOwner);
    return;
  }
  if (subcommand === "lockdown") {
    await handleHoriLockdownCommand(runtime, interaction, isOwner);
    return;
  }
  if (subcommand === "import") {
    await handleHoriImportCommand(runtime, interaction, isOwner);
    return;
  }
  await interaction.reply({ content: "\u041D\u0435 \u0437\u043D\u0430\u044E \u0442\u0430\u043A\u0443\u044E \u0432\u0435\u0442\u043A\u0443 `/hori`.", flags: import_discord3.MessageFlags.Ephemeral });
}
async function handleHoriSearchCommand(runtime, interaction, isModerator) {
  if (!interaction.guildId) {
    await interaction.reply({ content: "\u0422\u043E\u043B\u044C\u043A\u043E \u0432\u043D\u0443\u0442\u0440\u0438 \u0441\u0435\u0440\u0432\u0435\u0440\u0430.", flags: import_discord3.MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply({ flags: import_discord3.MessageFlags.Ephemeral });
  const query = interaction.options.getString("query", true).trim();
  const reply = await executeHoriSearch(runtime, {
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    interactionId: interaction.id,
    userId: interaction.user.id,
    username: interaction.user.username,
    displayName: getInteractionDisplayName(interaction),
    channelName: interaction.channel && "name" in interaction.channel ? interaction.channel.name : null,
    query,
    isModerator
  });
  await interaction.editReply({
    content: reply?.trim() || "\u041F\u043E\u0438\u0441\u043A \u043D\u0435 \u0434\u0430\u043B \u043D\u043E\u0440\u043C\u0430\u043B\u044C\u043D\u043E\u0433\u043E \u043E\u0442\u0432\u0435\u0442\u0430. \u041E\u0442\u043A\u0440\u043E\u0439 `/hori panel` -> \u041F\u043E\u0438\u0441\u043A -> \u0414\u0438\u0430\u0433\u043D\u043E\u0441\u0442\u0438\u043A\u0430, \u0442\u0430\u043C \u0431\u0443\u0434\u0435\u0442 \u0432\u0438\u0434\u043D\u043E \u0433\u0434\u0435 \u0437\u0430\u0442\u044B\u043A."
  });
}
async function executeHoriSearch(runtime, input) {
  const routingConfig = await runtime.runtimeConfig.getRoutingConfig(input.guildId, input.channelId);
  const envelope = {
    messageId: `slash:hori-search:${input.interactionId}`,
    guildId: input.guildId,
    channelId: input.channelId,
    userId: input.userId,
    username: input.username,
    displayName: input.displayName,
    channelName: input.channelName,
    content: `\u0425\u043E\u0440\u0438 \u043D\u0430\u0439\u0434\u0438 \u0432 \u0438\u043D\u0442\u0435\u0440\u043D\u0435\u0442\u0435: ${input.query}`,
    createdAt: /* @__PURE__ */ new Date(),
    replyToMessageId: null,
    mentionCount: 0,
    mentionedBot: true,
    mentionsBotByName: true,
    mentionedUserIds: [],
    triggerSource: "name",
    isModerator: input.isModerator,
    explicitInvocation: true
  };
  const result = await runtime.orchestrator.handleMessage(envelope, routingConfig);
  return typeof result.reply === "string" ? result.reply : result.reply?.text;
}
async function handleHoriAiUrlCommand(runtime, interaction, isOwner) {
  if (!isOwner) {
    await interaction.reply({ content: "AI URL \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u0432\u043B\u0430\u0434\u0435\u043B\u044C\u0446\u0430.", flags: import_discord3.MessageFlags.Ephemeral });
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
  let status = "\u043F\u0440\u043E\u0432\u0435\u0440\u044F\u044E...";
  let appliedUrl = oldUrl;
  try {
    const probe = await fetch(new URL("/api/tags", newUrl), { signal: AbortSignal.timeout(5e3) });
    if (probe.ok) {
      const data = await probe.json();
      const models = data.models?.map((m) => m.name).join(", ") ?? "?";
      runtime.env.OLLAMA_BASE_URL = newUrl;
      appliedUrl = newUrl;
      status = `Ollama \u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D: ${models}`;
      try {
        await (0, import_shared3.persistOllamaBaseUrl)(runtime.prisma, newUrl, interaction.user.id);
        status += "\nURL \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D \u0438 \u043F\u0435\u0440\u0435\u0436\u0438\u0432\u0451\u0442 \u0440\u0435\u0441\u0442\u0430\u0440\u0442.";
      } catch (error) {
        runtime.logger.warn({ error: (0, import_shared3.asErrorMessage)(error), url: newUrl }, "failed to persist ollama url");
        status += "\nURL \u043F\u0440\u0438\u043C\u0435\u043D\u0451\u043D \u0442\u043E\u043B\u044C\u043A\u043E \u0432 \u043F\u0430\u043C\u044F\u0442\u0438 \u043F\u0440\u043E\u0446\u0435\u0441\u0441\u0430.";
      }
    } else {
      status = `URL \u043D\u0435 \u043F\u0440\u0438\u043C\u0435\u043D\u0451\u043D: Ollama \u0432\u0435\u0440\u043D\u0443\u043B ${probe.status}`;
    }
  } catch (err) {
    status = `URL \u043D\u0435 \u043F\u0440\u0438\u043C\u0435\u043D\u0451\u043D: ${err instanceof Error ? err.message : "unknown"}`;
  }
  await interaction.editReply({
    content: `AI URL ${appliedUrl === newUrl ? "\u043E\u0431\u043D\u043E\u0432\u043B\u0451\u043D" : "\u043D\u0435 \u0438\u0437\u043C\u0435\u043D\u0451\u043D"}
\u0422\u0435\u043A\u0443\u0449\u0438\u0439: \`${appliedUrl}\`
\u041F\u0440\u043E\u0432\u0435\u0440\u044F\u043B\u0438: \`${newUrl}\`

${status}`
  });
}
async function handleHoriLockdownCommand(runtime, interaction, isOwner) {
  if (!isOwner) {
    await interaction.reply({ content: "\u041B\u043E\u043A\u0434\u0430\u0443\u043D \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u0432\u043B\u0430\u0434\u0435\u043B\u044C\u0446\u0430.", flags: import_discord3.MessageFlags.Ephemeral });
    return;
  }
  if (!runtime.env.DISCORD_OWNER_IDS.length) {
    await interaction.reply({ content: "\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0443\u043A\u0430\u0436\u0438 Discord user ID \u0432\u043B\u0430\u0434\u0435\u043B\u044C\u0446\u0430 \u0432 BOT_OWNERS.", flags: import_discord3.MessageFlags.Ephemeral });
    return;
  }
  const mode = interaction.options.getString("mode", true);
  if (mode === "status") {
    const state = await getOwnerLockdownState(runtime, true);
    await interaction.reply({
      content: `Owner lockdown: ${state.enabled ? "on" : "off"}${state.updatedBy ? `
\u041F\u043E\u0441\u043B\u0435\u0434\u043D\u0435\u0435 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0435: ${state.updatedBy}` : ""}`,
      flags: import_discord3.MessageFlags.Ephemeral
    });
    return;
  }
  const enabled = mode === "on";
  await setOwnerLockdownState(runtime, enabled, interaction.user.id);
  const cleared = enabled ? await runtime.replyQueue.clearAll() : { count: 0 };
  await interaction.reply({
    content: enabled ? `\u041B\u043E\u043A\u0434\u0430\u0443\u043D \u0432\u043A\u043B\u044E\u0447\u0451\u043D. \u0422\u0435\u043F\u0435\u0440\u044C \u0425\u043E\u0440\u0438 \u043C\u043E\u043B\u0447\u0430 \u0438\u0433\u043D\u043E\u0440\u0438\u0440\u0443\u0435\u0442 \u0432\u0441\u0435\u0445, \u043A\u0440\u043E\u043C\u0435 \u0432\u043B\u0430\u0434\u0435\u043B\u044C\u0446\u0430. \u041E\u0447\u0435\u0440\u0435\u0434\u044C \u043E\u0442\u0432\u0435\u0442\u043E\u0432 \u0441\u0431\u0440\u043E\u0448\u0435\u043D\u0430: ${cleared.count}.` : "\u041B\u043E\u043A\u0434\u0430\u0443\u043D \u0432\u044B\u043A\u043B\u044E\u0447\u0435\u043D. \u0425\u043E\u0440\u0438 \u0441\u043D\u043E\u0432\u0430 \u0441\u043B\u0443\u0448\u0430\u0435\u0442 \u043E\u0431\u044B\u0447\u043D\u044B\u0435 \u043F\u0440\u0430\u0432\u0438\u043B\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0430.",
    flags: import_discord3.MessageFlags.Ephemeral
  });
}
async function handleHoriImportCommand(runtime, interaction, isOwner) {
  if (!isOwner) {
    await interaction.reply({ content: "\u0418\u043C\u043F\u043E\u0440\u0442 \u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D \u0442\u043E\u043B\u044C\u043A\u043E \u0432\u043B\u0430\u0434\u0435\u043B\u044C\u0446\u0443.", flags: import_discord3.MessageFlags.Ephemeral });
    return;
  }
  const attachment = interaction.options.getAttachment("file", true);
  if (!attachment.name.endsWith(".json")) {
    await interaction.reply({ content: "\u041D\u0443\u0436\u0435\u043D .json \u0444\u0430\u0439\u043B.", flags: import_discord3.MessageFlags.Ephemeral });
    return;
  }
  if (attachment.size > 50 * 1024 * 1024) {
    await interaction.reply({ content: "\u0424\u0430\u0439\u043B \u0441\u043B\u0438\u0448\u043A\u043E\u043C \u0431\u043E\u043B\u044C\u0448\u043E\u0439 (\u043C\u0430\u043A\u0441 50 \u041C\u0411).", flags: import_discord3.MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply({ flags: import_discord3.MessageFlags.Ephemeral });
  try {
    const response = await fetch(attachment.url);
    if (!response.ok) {
      await interaction.editReply({ content: `\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043A\u0430\u0447\u0430\u0442\u044C \u0444\u0430\u0439\u043B: ${response.status}` });
      return;
    }
    const data = await response.json();
    const guildId = data.guildId ?? interaction.guildId;
    const messages = data.messages;
    if (!guildId || !Array.isArray(messages) || messages.length === 0) {
      await interaction.editReply({ content: "\u0424\u0430\u0439\u043B \u043F\u0443\u0441\u0442 \u0438\u043B\u0438 \u043D\u0435 \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u0442 \u043C\u0430\u0441\u0441\u0438\u0432 messages." });
      return;
    }
    if (messages.length > 5e4) {
      await interaction.editReply({ content: "\u041C\u0430\u043A\u0441\u0438\u043C\u0443\u043C 50 000 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0439 \u0437\u0430 \u0440\u0430\u0437." });
      return;
    }
    await runtime.prisma.guild.upsert({
      where: { id: guildId },
      update: {},
      create: { id: guildId }
    });
    let imported = 0;
    let skipped = 0;
    let errors = 0;
    const seenUsers = /* @__PURE__ */ new Set();
    const userMsgCounts = /* @__PURE__ */ new Map();
    for (const entry of messages) {
      if (!entry.userId || !entry.content || !entry.timestamp) {
        skipped += 1;
        continue;
      }
      const createdAt = new Date(entry.timestamp);
      if (Number.isNaN(createdAt.getTime())) {
        skipped += 1;
        continue;
      }
      const messageId = `import:${guildId}:${entry.userId}:${createdAt.getTime()}`;
      try {
        const exists = await runtime.prisma.message.findUnique({ where: { id: messageId }, select: { id: true } });
        if (exists) {
          skipped += 1;
          continue;
        }
        await runtime.prisma.user.upsert({
          where: { id: entry.userId },
          update: { username: entry.username ?? void 0 },
          create: { id: entry.userId, username: entry.username ?? null }
        });
        await runtime.prisma.message.create({
          data: {
            id: messageId,
            guildId,
            channelId: entry.channelId ?? "imported",
            userId: entry.userId,
            content: entry.content,
            createdAt,
            charCount: entry.content.length,
            tokenEstimate: Math.ceil(entry.content.length / 4),
            mentionCount: 0,
            replyToMessageId: entry.replyToId ? `import:${guildId}:${entry.replyToId}` : void 0
          }
        });
        seenUsers.add(entry.userId);
        userMsgCounts.set(entry.userId, (userMsgCounts.get(entry.userId) ?? 0) + 1);
        imported += 1;
      } catch {
        errors += 1;
      }
    }
    let seeded = 0;
    if (userMsgCounts.size > 0) {
      try {
        const relService = new import_memory.RelationshipService(runtime.prisma);
        seeded = await relService.seedFromImportedHistory(guildId, userMsgCounts);
      } catch {
      }
    }
    await interaction.editReply({
      content: [
        "\u0418\u043C\u043F\u043E\u0440\u0442 \u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043D",
        `\u0418\u043C\u043F\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u043E: ${imported}`,
        `\u041F\u0440\u043E\u043F\u0443\u0449\u0435\u043D\u043E: ${skipped}`,
        `\u041E\u0448\u0438\u0431\u043E\u043A: ${errors}`,
        `\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u0435\u0439: ${seenUsers.size}`,
        `\u041F\u0440\u043E\u0444\u0438\u043B\u0435\u0439 \u043E\u0442\u043D\u043E\u0448\u0435\u043D\u0438\u0439 \u0441\u043E\u0437\u0434\u0430\u043D\u043E: ${seeded}`
      ].join("\n")
    });
  } catch (err) {
    await interaction.editReply({ content: `\u041E\u0448\u0438\u0431\u043A\u0430 \u0438\u043C\u043F\u043E\u0440\u0442\u0430: ${err instanceof Error ? err.message : "unknown"}` });
  }
}
async function routeStringSelectInteraction(runtime, interaction, isOwner) {
  if (interaction.customId === `${HORI_STATE_PANEL_PREFIX}:tab`) {
    if (!interaction.guildId) {
      await interaction.reply({ content: "\u0422\u043E\u043B\u044C\u043A\u043E \u0432\u043D\u0443\u0442\u0440\u0438 \u0441\u0435\u0440\u0432\u0435\u0440\u0430.", flags: import_discord3.MessageFlags.Ephemeral });
      return;
    }
    if (!isOwner) {
      await interaction.reply({ content: "\u041F\u0430\u043D\u0435\u043B\u044C \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u0432\u043B\u0430\u0434\u0435\u043B\u044C\u0446\u0430.", flags: import_discord3.MessageFlags.Ephemeral });
      return;
    }
    const tab = parseHoriStateTab(interaction.values[0]) ?? "persona";
    await interaction.update(await buildHoriStatePanelResponse(runtime, tab, interaction.guildId, interaction.channelId));
    return;
  }
  if (interaction.customId === `${HORI_PANEL_PREFIX}:tab`) {
    if (!isOwner) {
      await interaction.reply({ content: HORI_PANEL_OWNER_ONLY_MESSAGE, flags: import_discord3.MessageFlags.Ephemeral });
      return;
    }
    const tab = parseHoriPanelTab(interaction.values[0]) ?? "main";
    await interaction.update(buildHoriPanelResponse(tab, isOwner, hasManageGuild(interaction)));
  }
}
async function handleOwnerLockdownCommand(runtime, interaction, isOwner) {
  if (!isOwner) {
    await interaction.reply({ content: "\u042D\u0442\u0430 \u043A\u043E\u043C\u0430\u043D\u0434\u0430 \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u0432\u043B\u0430\u0434\u0435\u043B\u044C\u0446\u0430 \u0431\u043E\u0442\u0430.", flags: import_discord3.MessageFlags.Ephemeral });
    return;
  }
  if (!runtime.env.DISCORD_OWNER_IDS.length) {
    await interaction.reply({ content: "\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0443\u043A\u0430\u0436\u0438 Discord user ID \u0432\u043B\u0430\u0434\u0435\u043B\u044C\u0446\u0430 \u0432 BOT_OWNERS.", flags: import_discord3.MessageFlags.Ephemeral });
    return;
  }
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "status") {
    const state = await getOwnerLockdownState(runtime, true);
    await interaction.reply({
      content: `Owner lockdown: ${state.enabled ? "on" : "off"}${state.updatedBy ? `
\u041F\u043E\u0441\u043B\u0435\u0434\u043D\u0435\u0435 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0435: ${state.updatedBy}` : ""}`,
      flags: import_discord3.MessageFlags.Ephemeral
    });
    return;
  }
  const enabled = subcommand === "on";
  await setOwnerLockdownState(runtime, enabled, interaction.user.id);
  const cleared = enabled ? await runtime.replyQueue.clearAll() : { count: 0 };
  await interaction.reply({
    content: enabled ? `\u041B\u043E\u043A\u0434\u0430\u0443\u043D \u0432\u043A\u043B\u044E\u0447\u0451\u043D. \u0422\u0435\u043F\u0435\u0440\u044C \u0425\u043E\u0440\u0438 \u043C\u043E\u043B\u0447\u0430 \u0438\u0433\u043D\u043E\u0440\u0438\u0440\u0443\u0435\u0442 \u0432\u0441\u0435\u0445, \u043A\u0440\u043E\u043C\u0435 \u0432\u043B\u0430\u0434\u0435\u043B\u044C\u0446\u0430. \u041E\u0447\u0435\u0440\u0435\u0434\u044C \u043E\u0442\u0432\u0435\u0442\u043E\u0432 \u0441\u0431\u0440\u043E\u0448\u0435\u043D\u0430: ${cleared.count}.` : "\u041B\u043E\u043A\u0434\u0430\u0443\u043D \u0432\u044B\u043A\u043B\u044E\u0447\u0435\u043D. \u0425\u043E\u0440\u0438 \u0441\u043D\u043E\u0432\u0430 \u0441\u043B\u0443\u0448\u0430\u0435\u0442 \u043E\u0431\u044B\u0447\u043D\u044B\u0435 \u043F\u0440\u0430\u0432\u0438\u043B\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0430.",
    flags: import_discord3.MessageFlags.Ephemeral
  });
}
async function handleRememberMomentContext(runtime, interaction, featureFlags) {
  if (!interaction.guildId) {
    await interaction.reply({ content: "\u0422\u043E\u043B\u044C\u043A\u043E \u0432\u043D\u0443\u0442\u0440\u0438 \u0441\u0435\u0440\u0432\u0435\u0440\u0430.", flags: import_discord3.MessageFlags.Ephemeral });
    return;
  }
  if (!featureFlags.memoryAlbumEnabled) {
    await interaction.reply({ content: "Memory Album \u0441\u0435\u0439\u0447\u0430\u0441 \u0432\u044B\u043A\u043B\u044E\u0447\u0435\u043D.", flags: import_discord3.MessageFlags.Ephemeral });
    return;
  }
  if (!featureFlags.interactionRequestsEnabled) {
    await interaction.reply({ content: "Interaction Requests \u0441\u0435\u0439\u0447\u0430\u0441 \u0432\u044B\u043A\u043B\u044E\u0447\u0435\u043D\u044B.", flags: import_discord3.MessageFlags.Ephemeral });
    return;
  }
  const request = await runtime.interactionRequests.create({
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    messageId: interaction.targetId,
    userId: interaction.user.id,
    requestType: "dialogue",
    title: "\u0417\u0430\u043F\u043E\u043C\u043D\u0438\u0442\u044C \u043C\u043E\u043C\u0435\u043D\u0442",
    prompt: "\u0414\u043E\u0431\u0430\u0432\u044C \u043A\u043E\u0440\u043E\u0442\u043A\u0443\u044E \u0437\u0430\u043C\u0435\u0442\u043A\u0443 \u0438 \u0442\u0435\u0433\u0438 \u0434\u043B\u044F Memory Album.",
    category: "memory_album",
    expectedAnswerType: "note_tags",
    metadataJson: { targetMessageId: interaction.targetId },
    expiresAt: new Date(Date.now() + 15 * 60 * 1e3)
  });
  const modal = new import_discord3.ModalBuilder().setCustomId(buildMemoryAlbumModalId(request.id, interaction.targetId)).setTitle("\u0417\u0430\u043F\u043E\u043C\u043D\u0438\u0442\u044C \u043C\u043E\u043C\u0435\u043D\u0442");
  const noteInput = new import_discord3.TextInputBuilder().setCustomId("note").setLabel("\u0417\u0430\u043C\u0435\u0442\u043A\u0430").setPlaceholder("\u041F\u043E\u0447\u0435\u043C\u0443 \u044D\u0442\u043E\u0442 \u043C\u043E\u043C\u0435\u043D\u0442 \u0441\u0442\u043E\u0438\u0442 \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C? \u041C\u043E\u0436\u043D\u043E \u043E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u043F\u0443\u0441\u0442\u044B\u043C.").setRequired(false).setMaxLength(500).setStyle(import_discord3.TextInputStyle.Paragraph);
  const tagsInput = new import_discord3.TextInputBuilder().setCustomId("tags").setLabel("\u0422\u0435\u0433\u0438 \u0447\u0435\u0440\u0435\u0437 \u0437\u0430\u043F\u044F\u0442\u0443\u044E").setPlaceholder("\u0448\u0443\u0442\u043A\u0430, \u0438\u0434\u0435\u044F, \u0434\u043E\u0433\u043E\u0432\u043E\u0440\u0451\u043D\u043D\u043E\u0441\u0442\u044C").setRequired(false).setMaxLength(120).setStyle(import_discord3.TextInputStyle.Short);
  modal.addComponents(
    new import_discord3.ActionRowBuilder().addComponents(noteInput),
    new import_discord3.ActionRowBuilder().addComponents(tagsInput)
  );
  await interaction.showModal(modal);
}
async function routeModalSubmit(runtime, interaction) {
  if (interaction.customId.startsWith(`${HORI_MODAL_PREFIX}:`)) {
    await handleHoriModalSubmit(runtime, interaction);
    return;
  }
  const parsed = parseMemoryAlbumModalId(interaction.customId);
  if (!parsed) {
    return;
  }
  if (!interaction.guildId) {
    await interaction.reply({ content: "\u0422\u043E\u043B\u044C\u043A\u043E \u0432\u043D\u0443\u0442\u0440\u0438 \u0441\u0435\u0440\u0432\u0435\u0440\u0430.", flags: import_discord3.MessageFlags.Ephemeral });
    return;
  }
  const featureFlags = await runtime.runtimeConfig.getFeatureFlags(interaction.guildId);
  if (!featureFlags.memoryAlbumEnabled) {
    await interaction.reply({ content: "Memory Album \u0441\u0435\u0439\u0447\u0430\u0441 \u0432\u044B\u043A\u043B\u044E\u0447\u0435\u043D.", flags: import_discord3.MessageFlags.Ephemeral });
    return;
  }
  const request = await runtime.interactionRequests.getPending(parsed.requestId);
  if (!request || request.userId !== interaction.user.id) {
    await interaction.reply({ content: "\u042D\u0442\u043E\u0442 \u0437\u0430\u043F\u0440\u043E\u0441 \u0443\u0436\u0435 \u0443\u0441\u0442\u0430\u0440\u0435\u043B \u0438\u043B\u0438 \u043D\u0435 \u0442\u0432\u043E\u0439.", flags: import_discord3.MessageFlags.Ephemeral });
    return;
  }
  const note = interaction.fields.getTextInputValue("note").trim();
  const tags = (0, import_shared3.parseCsv)(interaction.fields.getTextInputValue("tags"));
  const source = await fetchSourceMessageForAlbum(runtime, interaction, parsed.messageId);
  if (!source.content.trim()) {
    await runtime.interactionRequests.cancel(request.id, interaction.user.id, "source message is empty");
    await interaction.reply({ content: "\u041D\u0435 \u0441\u0442\u0430\u043B\u0430 \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u0442\u044C: \u0443 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F \u043D\u0435\u0442 \u0442\u0435\u043A\u0441\u0442\u0430.", flags: import_discord3.MessageFlags.Ephemeral });
    return;
  }
  await runtime.prisma.guild.upsert({
    where: { id: interaction.guildId },
    update: { name: interaction.guild?.name ?? void 0 },
    create: { id: interaction.guildId, name: interaction.guild?.name ?? null }
  });
  const entry = await runtime.memoryAlbum.saveMoment({
    guildId: interaction.guildId,
    channelId: request.channelId,
    messageId: parsed.messageId,
    savedByUserId: interaction.user.id,
    authorUserId: source.authorUserId,
    content: source.content,
    note,
    tags,
    sourceUrl: source.sourceUrl
  });
  await runtime.interactionRequests.answer(request.id, interaction.user.id, note, {
    tags,
    memoryAlbumEntryId: entry.id
  });
  await interaction.reply({
    content: `\u0417\u0430\u043F\u043E\u043C\u043D\u0438\u043B\u0430 \u043C\u043E\u043C\u0435\u043D\u0442 \u0432 \u0430\u043B\u044C\u0431\u043E\u043C. ID: ${entry.id}${tags.length ? `
\u0422\u0435\u0433\u0438: ${tags.join(", ")}` : ""}`,
    flags: import_discord3.MessageFlags.Ephemeral
  });
}
async function handleHoriModalSubmit(runtime, interaction) {
  if (!interaction.guildId) {
    await interaction.reply({ content: "\u0422\u043E\u043B\u044C\u043A\u043E \u0432\u043D\u0443\u0442\u0440\u0438 \u0441\u0435\u0440\u0432\u0435\u0440\u0430.", flags: import_discord3.MessageFlags.Ephemeral });
    return;
  }
  const isOwner = isBotOwner(runtime, interaction.user.id);
  const isModerator = ensureModerator(interaction);
  const [, modalKind, channelIdFromModal] = interaction.customId.split(":");
  if (!isOwner) {
    await interaction.reply({ content: HORI_PANEL_OWNER_ONLY_MESSAGE, flags: import_discord3.MessageFlags.Ephemeral });
    return;
  }
  if (modalKind === "ai-url") {
    const url = interaction.fields.getTextInputValue("url").trim();
    try {
      new URL(url);
    } catch {
      await interaction.reply({ content: `\u041D\u0435\u0432\u0430\u043B\u0438\u0434\u043D\u044B\u0439 URL: ${url}`, flags: import_discord3.MessageFlags.Ephemeral });
      return;
    }
    runtime.env.OLLAMA_BASE_URL = url;
    await (0, import_shared3.persistOllamaBaseUrl)(runtime.prisma, url, interaction.user.id);
    await interaction.reply({ content: `AI URL \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D: ${url}`, flags: import_discord3.MessageFlags.Ephemeral });
    return;
  }
  if (modalKind === "search") {
    await interaction.deferReply({ flags: import_discord3.MessageFlags.Ephemeral });
    const query = interaction.fields.getTextInputValue("query").trim();
    const searchChannelId = interaction.channelId ?? interaction.channel?.id;
    if (!query) {
      await interaction.editReply({ content: "\u0417\u0430\u043F\u0440\u043E\u0441 \u043F\u0443\u0441\u0442\u043E\u0439." });
      return;
    }
    if (!searchChannelId) {
      await interaction.editReply({ content: "\u041D\u0435 \u0441\u043C\u043E\u0433\u043B\u0430 \u043E\u043F\u0440\u0435\u0434\u0435\u043B\u0438\u0442\u044C \u043A\u0430\u043D\u0430\u043B \u0434\u043B\u044F \u043F\u043E\u0438\u0441\u043A\u0430." });
      return;
    }
    const reply = await executeHoriSearch(runtime, {
      guildId: interaction.guildId,
      channelId: searchChannelId,
      interactionId: interaction.id,
      userId: interaction.user.id,
      username: interaction.user.username,
      displayName: getInteractionMemberDisplayName(interaction),
      channelName: interaction.channel && "name" in interaction.channel ? interaction.channel.name : null,
      query,
      isModerator
    });
    await interaction.editReply({
      content: reply?.trim() || "\u041F\u043E\u0438\u0441\u043A \u043D\u0435 \u0434\u0430\u043B \u043D\u043E\u0440\u043C\u0430\u043B\u044C\u043D\u043E\u0433\u043E \u043E\u0442\u0432\u0435\u0442\u0430. \u041E\u0442\u043A\u0440\u043E\u0439 `/hori panel` -> \u041F\u043E\u0438\u0441\u043A -> \u0414\u0438\u0430\u0433\u043D\u043E\u0441\u0442\u0438\u043A\u0430, \u0442\u0430\u043C \u0431\u0443\u0434\u0435\u0442 \u0432\u0438\u0434\u043D\u043E \u0433\u0434\u0435 \u0437\u0430\u0442\u044B\u043A."
    });
    return;
  }
  if (modalKind === "dossier") {
    const userId = interaction.fields.getTextInputValue("userId").trim();
    if (!userId) {
      await interaction.reply({ content: "\u041D\u0443\u0436\u0435\u043D Discord user ID.", flags: import_discord3.MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({
      content: await runtime.slashAdmin.personDossier(interaction.guildId, userId),
      flags: import_discord3.MessageFlags.Ephemeral
    });
    return;
  }
  if (modalKind === "relationship") {
    const [roastLevel, praiseBias, interruptPriority] = readNumberList(interaction.fields.getTextInputValue("levels"));
    const [closeness, trustLevel, familiarity, proactivityPreference] = readNumberList(interaction.fields.getTextInputValue("signals"));
    const [doNotMock, doNotInitiate, ...topics] = interaction.fields.getTextInputValue("switches").split(",").map((part) => part.trim()).filter(Boolean);
    const userId = interaction.fields.getTextInputValue("userId").trim();
    const toneBias = interaction.fields.getTextInputValue("toneBias").trim();
    const content = [
      await runtime.slashAdmin.updateRelationship(interaction.guildId, userId, interaction.user.id, {
        toneBias: toneBias || void 0,
        roastLevel: readIntInRange(roastLevel, 0, 5),
        praiseBias: readIntInRange(praiseBias, 0, 5),
        interruptPriority: readIntInRange(interruptPriority, 0, 5),
        doNotMock: readOptionalBoolean(doNotMock),
        doNotInitiate: readOptionalBoolean(doNotInitiate),
        protectedTopics: topics.length ? topics : void 0,
        closeness: readUnitFloat(closeness),
        trustLevel: readUnitFloat(trustLevel),
        familiarity: readUnitFloat(familiarity),
        proactivityPreference: readUnitFloat(proactivityPreference)
      }),
      "",
      await runtime.slashAdmin.relationshipDetails(interaction.guildId, userId)
    ].join("\n");
    await interaction.reply({ content, flags: import_discord3.MessageFlags.Ephemeral });
    return;
  }
  if (modalKind === "style") {
    const [roughness, sarcasm, roast] = readNumberList(interaction.fields.getTextInputValue("levels"));
    const [replyLength, preferredLanguage, interjectTendency] = readTextList(interaction.fields.getTextInputValue("replyLength"));
    const [forbiddenWords, forbiddenTopics] = interaction.fields.getTextInputValue("forbidden").split("|").map((part) => part.trim());
    await interaction.reply({
      content: await runtime.slashAdmin.updateStyle(interaction.guildId, {
        botName: blankToNull(interaction.fields.getTextInputValue("botName")),
        roughnessLevel: readIntInRange(roughness, 0, 5) ?? null,
        sarcasmLevel: readIntInRange(sarcasm, 0, 5) ?? null,
        roastLevel: readIntInRange(roast, 0, 5) ?? null,
        preferredLanguage: blankToNull(preferredLanguage ?? ""),
        interjectTendency: readIntegerText(interjectTendency, 0, 5) ?? null,
        replyLength: parseReplyLengthSelection(replyLength),
        preferredStyle: blankToNull(interaction.fields.getTextInputValue("preferredStyle")),
        forbiddenWords: blankToNull(forbiddenWords ?? ""),
        forbiddenTopics: blankToNull(forbiddenTopics ?? "")
      }),
      flags: import_discord3.MessageFlags.Ephemeral
    });
    return;
  }
  if (modalKind === "channel") {
    await interaction.reply({
      content: await runtime.slashAdmin.channelConfig(interaction.guildId, channelIdFromModal ?? interaction.channelId, {
        allowBotReplies: readOptionalBoolean(interaction.fields.getTextInputValue("allowBotReplies")),
        allowInterjections: readOptionalBoolean(interaction.fields.getTextInputValue("allowInterjections")),
        isMuted: readOptionalBoolean(interaction.fields.getTextInputValue("isMuted")),
        responseLengthOverride: parseReplyLengthSelection(interaction.fields.getTextInputValue("responseLengthOverride")),
        topicInterestTags: blankToNull(interaction.fields.getTextInputValue("topicInterestTags"))
      }),
      flags: import_discord3.MessageFlags.Ephemeral
    });
  }
}
async function routeButtonInteraction(runtime, interaction, isOwner) {
  if (interaction.customId.startsWith(`${HORI_ACTION_PREFIX}:`)) {
    await handleHoriPanelAction(runtime, interaction, isOwner, hasManageGuild(interaction));
    return;
  }
  if (!interaction.customId.startsWith(`${POWER_PANEL_PREFIX}:`)) {
    return;
  }
  if (!isOwner) {
    await interaction.reply({ content: "\u042D\u0442\u0430 \u043F\u0430\u043D\u0435\u043B\u044C \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u0432\u043B\u0430\u0434\u0435\u043B\u044C\u0446\u0430 \u0431\u043E\u0442\u0430.", flags: import_discord3.MessageFlags.Ephemeral });
    return;
  }
  const [, action, profile] = interaction.customId.split(":");
  if (action !== "apply" || !isPowerProfile(profile)) {
    await interaction.reply({ content: "\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u0430\u044F \u043A\u043D\u043E\u043F\u043A\u0430 \u043F\u0430\u043D\u0435\u043B\u0438 \u043C\u043E\u0449\u043D\u043E\u0441\u0442\u0438.", flags: import_discord3.MessageFlags.Ephemeral });
    return;
  }
  const content = await runtime.slashAdmin.powerApply(profile, interaction.user.id);
  const status = await runtime.runtimeConfig.getPowerProfileStatus();
  await interaction.update(buildPowerPanelResponse(content, status.activeProfile));
}
async function handleHoriPanelAction(runtime, interaction, isOwner, isModerator) {
  if (!interaction.guildId) {
    await interaction.reply({ content: "\u0422\u043E\u043B\u044C\u043A\u043E \u0432\u043D\u0443\u0442\u0440\u0438 \u0441\u0435\u0440\u0432\u0435\u0440\u0430.", flags: import_discord3.MessageFlags.Ephemeral });
    return;
  }
  if (!isOwner) {
    await interaction.reply({ content: HORI_PANEL_OWNER_ONLY_MESSAGE, flags: import_discord3.MessageFlags.Ephemeral });
    return;
  }
  const action = interaction.customId.slice(`${HORI_ACTION_PREFIX}:`.length);
  if (action === "state_panel") {
    if (!isOwner) {
      await interaction.reply({ content: "\u041F\u0430\u043D\u0435\u043B\u044C \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u0432\u043B\u0430\u0434\u0435\u043B\u044C\u0446\u0430.", flags: import_discord3.MessageFlags.Ephemeral });
      return;
    }
    await interaction.update(await buildHoriStatePanelResponse(runtime, "persona", interaction.guildId, interaction.channelId));
    return;
  }
  if (action === "panel_home") {
    await interaction.update(buildHoriPanelResponse("main", isOwner, isModerator));
    return;
  }
  if (action.startsWith("state_")) {
    if (!isOwner) {
      await interaction.reply({ content: "\u041F\u0430\u043D\u0435\u043B\u044C \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u0432\u043B\u0430\u0434\u0435\u043B\u044C\u0446\u0430.", flags: import_discord3.MessageFlags.Ephemeral });
      return;
    }
    const tab2 = parseHoriStateTab(action.replace("state_", ""));
    if (!tab2) {
      await interaction.reply({ content: "\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u0430\u044F \u0432\u043A\u043B\u0430\u0434\u043A\u0430 state panel.", flags: import_discord3.MessageFlags.Ephemeral });
      return;
    }
    await interaction.update(await buildHoriStatePanelResponse(runtime, tab2, interaction.guildId, interaction.channelId));
    return;
  }
  if (action === "ai_url_modal") {
    if (!isOwner) {
      await interaction.reply({ content: "AI URL \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u0432\u043B\u0430\u0434\u0435\u043B\u044C\u0446\u0430.", flags: import_discord3.MessageFlags.Ephemeral });
      return;
    }
    await interaction.showModal(buildAiUrlModal(runtime.env.OLLAMA_BASE_URL));
    return;
  }
  if (action === "search_query_modal") {
    await interaction.showModal(buildSearchModal());
    return;
  }
  if (action === "relationship_edit_modal") {
    if (!isOwner) {
      await interaction.reply({ content: "Relationship-\u0446\u0438\u0444\u0440\u044B \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u0432\u043B\u0430\u0434\u0435\u043B\u044C\u0446\u0430.", flags: import_discord3.MessageFlags.Ephemeral });
      return;
    }
    await interaction.showModal(buildRelationshipModal());
    return;
  }
  if (action === "dossier_modal") {
    await interaction.showModal(buildDossierModal());
    return;
  }
  if (action === "style_edit_modal") {
    await interaction.showModal(buildStyleModal(await runtime.runtimeConfig.getGuildSettings(interaction.guildId)));
    return;
  }
  if (action === "channel_edit_modal") {
    await interaction.showModal(buildChannelModal(interaction.channelId, await runtime.runtimeConfig.getChannelPolicy(interaction.guildId, interaction.channelId)));
    return;
  }
  const featureToggle = parsePanelFeatureToggleAction(action);
  if (featureToggle) {
    if (!isOwner && !isModerator) {
      await interaction.reply({ content: "Feature toggles \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u043C\u043E\u0434\u0435\u0440\u043E\u0432.", flags: import_discord3.MessageFlags.Ephemeral });
      return;
    }
    await interaction.update(
      buildHoriPanelDetailResponse(
        inferPanelTabForFeatureKey(featureToggle.key),
        isOwner,
        isModerator,
        horiActionTitle(action),
        await applyPanelFeatureToggle(runtime, interaction.guildId, featureToggle.key, featureToggle.enabled)
      )
    );
    return;
  }
  if (action === "power_panel") {
    if (!isOwner) {
      await interaction.reply({ content: "\u042D\u0442\u0430 \u043F\u0430\u043D\u0435\u043B\u044C \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u0432\u043B\u0430\u0434\u0435\u043B\u044C\u0446\u0430 \u0431\u043E\u0442\u0430.", flags: import_discord3.MessageFlags.Ephemeral });
      return;
    }
    const status = await runtime.runtimeConfig.getPowerProfileStatus();
    await interaction.update(buildPowerPanelResponse(await runtime.slashAdmin.powerPanel(), status.activeProfile));
    return;
  }
  if (action.startsWith("lockdown_")) {
    if (!isOwner) {
      await interaction.reply({ content: "\u041B\u043E\u043A\u0434\u0430\u0443\u043D \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u0432\u043B\u0430\u0434\u0435\u043B\u044C\u0446\u0430.", flags: import_discord3.MessageFlags.Ephemeral });
      return;
    }
    const mode = action.replace("lockdown_", "");
    if (mode === "status") {
      const state = await getOwnerLockdownState(runtime, true);
      await interaction.update(
        buildHoriPanelDetailResponse(
          "owner",
          isOwner,
          isModerator,
          "Owner Lockdown",
          `Owner lockdown: ${state.enabled ? "on" : "off"}${state.updatedBy ? `
\u041F\u043E\u0441\u043B\u0435\u0434\u043D\u0435\u0435 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0435: ${state.updatedBy}` : ""}`
        )
      );
      return;
    }
    const enabled = mode === "on";
    await setOwnerLockdownState(runtime, enabled, interaction.user.id);
    const cleared = enabled ? await runtime.replyQueue.clearAll() : { count: 0 };
    await interaction.update(
      buildHoriPanelDetailResponse(
        "owner",
        isOwner,
        isModerator,
        enabled ? "Lockdown \u0432\u043A\u043B\u044E\u0447\u0451\u043D" : "Lockdown \u0432\u044B\u043A\u043B\u044E\u0447\u0435\u043D",
        enabled ? `\u041B\u043E\u043A\u0434\u0430\u0443\u043D \u0432\u043A\u043B\u044E\u0447\u0451\u043D. \u0412\u0441\u0435 \u043A\u0440\u043E\u043C\u0435 \u0432\u043B\u0430\u0434\u0435\u043B\u044C\u0446\u0430 \u043C\u043E\u043B\u0447\u0430 \u0438\u0433\u043D\u043E\u0440\u0438\u0440\u0443\u044E\u0442\u0441\u044F. \u041E\u0447\u0435\u0440\u0435\u0434\u044C \u0441\u0431\u0440\u043E\u0448\u0435\u043D\u0430: ${cleared.count}.` : "\u041B\u043E\u043A\u0434\u0430\u0443\u043D \u0432\u044B\u043A\u043B\u044E\u0447\u0435\u043D."
      )
    );
    return;
  }
  if (action === "memory_build_channel" || action === "memory_build_server") {
    const scope = action.endsWith("server") ? "server" : "channel";
    if (!isOwner && (!isModerator || scope === "server")) {
      await interaction.reply({
        content: scope === "server" ? "\u0421\u0431\u043E\u0440\u043A\u0430 \u043F\u0430\u043C\u044F\u0442\u0438 \u043F\u043E \u0432\u0441\u0435\u043C\u0443 \u0441\u0435\u0440\u0432\u0435\u0440\u0443 \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u0432\u043B\u0430\u0434\u0435\u043B\u044C\u0446\u0430." : "Memory-build \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u043C\u043E\u0434\u0435\u0440\u043E\u0432.",
        flags: import_discord3.MessageFlags.Ephemeral
      });
      return;
    }
    await interaction.update({
      ...buildHoriPanelDetailResponse(
        "memory",
        isOwner,
        isModerator,
        scope === "server" ? "Memory-build \u0441\u0435\u0440\u0432\u0435\u0440\u0430" : "Memory-build \u043A\u0430\u043D\u0430\u043B\u0430",
        await startMemoryBuildRun(runtime, interaction.guildId, scope === "channel" ? interaction.channelId : null, scope, "recent", interaction.user.id)
      )
    });
    return;
  }
  const content = await resolveHoriActionContent(runtime, interaction, action, isOwner, isModerator);
  const tab = inferTabForHoriAction(action);
  await interaction.update(buildHoriPanelDetailResponse(tab, isOwner, isModerator, horiActionTitle(action), content));
}
async function resolveHoriActionContent(runtime, interaction, action, isOwner, isModerator) {
  const guildId = interaction.guildId;
  switch (action) {
    case "status":
      return buildHoriStatus(runtime, guildId, interaction.channelId);
    case "help":
      return `${await runtime.slashAdmin.handleHelp()}

\u0412\u0438\u0434\u0438\u043C\u044B\u0439 \u0441\u043F\u0438\u0441\u043E\u043A \u043A\u043E\u043C\u0430\u043D\u0434 \u0442\u0435\u043F\u0435\u0440\u044C \u0434\u0435\u0440\u0436\u0438\u0442\u0441\u044F \u0432\u043E\u043A\u0440\u0443\u0433 /hori. \u0421\u0442\u0430\u0440\u044B\u0435 /bot-* \u043C\u043E\u0436\u043D\u043E \u0432\u0435\u0440\u043D\u0443\u0442\u044C \u0447\u0435\u0440\u0435\u0437 DISCORD_REGISTER_LEGACY_COMMANDS=true.`;
    case "profile_self":
    case "memory_self":
      return runtime.slashAdmin.personalMemory(guildId, interaction.user.id, isOwner || isModerator);
    case "relationship_self":
      return runtime.slashAdmin.relationshipDetails(guildId, interaction.user.id);
    case "relationship_hint":
      return "\u0414\u043B\u044F \u0442\u043E\u0447\u043D\u043E\u0439 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438: `/hori relationship user:@\u0447\u0435\u043B\u043E\u0432\u0435\u043A ...` \u0438\u043B\u0438 \u043A\u043D\u043E\u043F\u043A\u0430 Edit relation \u0432 owner panel. Owner \u043C\u043E\u0436\u0435\u0442 \u043C\u0435\u043D\u044F\u0442\u044C toneBias, roast/praise/interrupt \u0438 \u0446\u0438\u0444\u0440\u044B closeness/trust/familiarity/proactivity.";
    case "style_status":
      return buildStyleStatus(runtime, guildId);
    case "style_default":
      return runtime.slashAdmin.updateStyle(guildId, {
        botName: "\u0425\u043E\u0440\u0438",
        preferredLanguage: "ru",
        roughnessLevel: 2,
        sarcasmLevel: 3,
        roastLevel: 2,
        interjectTendency: 1,
        replyLength: "short",
        preferredStyle: "\u0436\u0435\u043D\u0441\u043A\u0430\u044F \u043F\u0435\u0440\u0441\u043E\u043D\u0430; \u043A\u043E\u0440\u043E\u0442\u043A\u043E; \u0442\u0435\u043F\u043B\u043E, \u043D\u043E \u043D\u0435 \u0441\u0430\u0445\u0430\u0440\u043D\u043E; \u0443\u043C\u0435\u0440\u0435\u043D\u043D\u043E \u044F\u0437\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u043E; \u043D\u043E\u0440\u043C\u0430\u043B\u044C\u043D\u044B\u0439 \u0436\u0438\u0432\u043E\u0439 \u0441\u043B\u0435\u043D\u0433 \u0431\u0435\u0437 \u043A\u0440\u0438\u043D\u0436\u0430; \u043D\u0435 \u0441\u0442\u0430\u0432\u044C \u0444\u0438\u043D\u0430\u043B\u044C\u043D\u044B\u0435 \u0442\u043E\u0447\u043A\u0438 \u0432 \u043A\u043E\u0440\u043E\u0442\u043A\u0438\u0445 \u0440\u0435\u043F\u043B\u0438\u043A\u0430\u0445",
        forbiddenWords: null,
        forbiddenTopics: null
      });
    case "natural_split_on":
      if (!isModerator && !isOwner) {
        return "\u042D\u0442\u043E \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u043C\u043E\u0434\u0435\u0440\u043E\u0432.";
      }
      return runtime.slashAdmin.updateFeature(guildId, "natural_message_splitting_enabled", true);
    case "natural_split_off":
      if (!isModerator && !isOwner) {
        return "\u042D\u0442\u043E \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u043C\u043E\u0434\u0435\u0440\u043E\u0432.";
      }
      return runtime.slashAdmin.updateFeature(guildId, "natural_message_splitting_enabled", false);
    case "read_chat_on":
      if (!isModerator && !isOwner) {
        return "\u042D\u0442\u043E \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u043C\u043E\u0434\u0435\u0440\u043E\u0432.";
      }
      return runtime.slashAdmin.channelConfig(guildId, interaction.channelId, {
        allowBotReplies: true,
        allowInterjections: true,
        isMuted: false,
        topicInterestTags: null
      });
    case "read_chat_off":
      if (!isModerator && !isOwner) {
        return "\u042D\u0442\u043E \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u043C\u043E\u0434\u0435\u0440\u043E\u0432.";
      }
      return runtime.slashAdmin.channelConfig(guildId, interaction.channelId, {
        allowBotReplies: false,
        allowInterjections: false,
        isMuted: false,
        topicInterestTags: null
      });
    case "media_sync":
      if (!isOwner) {
        return "Media sync-pack \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u0432\u043B\u0430\u0434\u0435\u043B\u044C\u0446\u0430.";
      }
      return runtime.slashAdmin.mediaSyncPack();
    case "media_list":
      return runtime.slashAdmin.mediaList();
    case "memory_status":
      return runtime.slashAdmin.channelMemoryStatus(guildId, interaction.channelId);
    case "summary_current":
      return runtime.slashAdmin.summary(guildId, interaction.channelId);
    case "stats_week":
      return runtime.slashAdmin.stats(guildId);
    case "topic_status":
      return runtime.slashAdmin.topicStatus(guildId, interaction.channelId);
    case "topic_reset":
      if (!isModerator && !isOwner) {
        return "\u042D\u0442\u043E \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u043C\u043E\u0434\u0435\u0440\u043E\u0432.";
      }
      return runtime.slashAdmin.topicReset(guildId, interaction.channelId);
    case "queue_status":
      return runtime.slashAdmin.queueStatus(guildId, interaction.channelId);
    case "queue_clear":
      if (!isModerator && !isOwner) {
        return "\u042D\u0442\u043E \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u043C\u043E\u0434\u0435\u0440\u043E\u0432.";
      }
      return runtime.slashAdmin.queueClear(guildId, interaction.channelId);
    case "mood_status":
      return runtime.slashAdmin.moodStatus(guildId);
    case "mood_normal":
      if (!isModerator && !isOwner) {
        return "\u042D\u0442\u043E \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u043C\u043E\u0434\u0435\u0440\u043E\u0432.";
      }
      return runtime.slashAdmin.moodSet(guildId, "normal", 60, "panel quick action");
    case "mood_playful":
      if (!isModerator && !isOwner) {
        return "\u042D\u0442\u043E \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u043C\u043E\u0434\u0435\u0440\u043E\u0432.";
      }
      return runtime.slashAdmin.moodSet(guildId, "playful", 60, "panel quick action");
    case "reflection_status":
      return runtime.slashAdmin.reflectionStatus(guildId);
    case "reflection_list":
      return runtime.slashAdmin.reflectionList(guildId, 8);
    case "search_diagnose":
      return diagnoseSearch(runtime);
    case "feature_status":
      return buildFeatureStatus(runtime, guildId);
    case "channel_policy":
      return buildChannelPolicyStatus(runtime, guildId, interaction.channelId);
    case "debug_latest":
      return buildLatestDebugTrace(runtime, guildId);
    default:
      return "\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u0430\u044F \u043A\u043D\u043E\u043F\u043A\u0430 \u043F\u0430\u043D\u0435\u043B\u0438.";
  }
}
function buildHoriPanelResponse(tab, isOwner, isModerator) {
  return {
    content: "",
    embeds: [buildHoriPanelEmbed(tab, isOwner, isModerator)],
    components: buildHoriPanelRows(tab, isOwner, isModerator)
  };
}
function buildHoriPanelDetailResponse(tab, isOwner, isModerator, title, body) {
  return {
    content: "",
    embeds: [buildHoriPanelEmbed(tab, isOwner, isModerator), buildHoriDetailEmbed(title, body)],
    components: buildHoriPanelRows(tab, isOwner, isModerator)
  };
}
function buildHoriPanelEmbed(tab, isOwner, isModerator) {
  const ownerLine = isOwner ? "owner master panel \u0430\u043A\u0442\u0438\u0432\u043D\u0430" : isModerator ? "moderator-\u0434\u043E\u0441\u0442\u0443\u043F \u0430\u043A\u0442\u0438\u0432\u0435\u043D \u0432\u043D\u0435 \u043F\u0430\u043D\u0435\u043B\u0438" : "\u043E\u0431\u044B\u0447\u043D\u044B\u0439 \u0434\u043E\u0441\u0442\u0443\u043F \u0438\u0434\u0451\u0442 \u0447\u0435\u0440\u0435\u0437 \u043F\u0440\u044F\u043C\u044B\u0435 /hori \u043A\u043E\u043C\u0430\u043D\u0434\u044B";
  const tabText = {
    main: "Owner master panel: \u0431\u044B\u0441\u0442\u0440\u044B\u0439 \u0432\u0445\u043E\u0434 \u0432 persona, runtime, memory, channel, search \u0438 \u0434\u0438\u0430\u0433\u043D\u043E\u0441\u0442\u0438\u043A\u0443 \u0431\u0435\u0437 \u0441\u0442\u0430\u0440\u043E\u0433\u043E \u043A\u043E\u043C\u0430\u043D\u0434\u043D\u043E\u0433\u043E \u0448\u0443\u043C\u0430.",
    owner: isOwner ? "Owner panel: power profile, lockdown, relationship \u0440\u0435\u0434\u0430\u043A\u0442\u043E\u0440, media sync-pack, server memory-build \u0438 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u0430\u044F state-\u043F\u0430\u043D\u0435\u043B\u044C." : "Owner panel \u0441\u043A\u0440\u044B\u0442\u0430. \u0422\u0443\u0442 \u043D\u0438\u0447\u0435\u0433\u043E \u0441\u0442\u0440\u0430\u0448\u043D\u043E\u0433\u043E, \u043F\u0440\u043E\u0441\u0442\u043E \u043D\u0435 \u0442\u0432\u043E\u0451 \u043C\u0435\u043D\u044E",
    style: "\u0421\u0442\u0438\u043B\u044C: \u0436\u0435\u043D\u0441\u043A\u0430\u044F \u043F\u0435\u0440\u0441\u043E\u043D\u0430, \u044F\u0437\u044B\u043A, \u0434\u043B\u0438\u043D\u0430, interject tendency, \u0437\u0430\u043F\u0440\u0435\u0442\u044B \u0438 \u0431\u044B\u0441\u0442\u0440\u044B\u0435 \u0442\u0443\u043C\u0431\u043B\u0435\u0440\u044B tone/playful/roast.",
    liveliness: "\u0416\u0438\u0432\u043E\u0441\u0442\u044C: \u0447\u0442\u0435\u043D\u0438\u0435 \u0447\u0430\u0442\u0430, auto-interject, reply queue, natural message sprinting \u0438 \u0431\u044B\u0441\u0442\u0440\u044B\u0435 quiet/live \u043F\u0435\u0440\u0435\u043A\u043B\u044E\u0447\u0430\u0442\u0435\u043B\u0438.",
    memory: "\u041F\u0430\u043C\u044F\u0442\u044C: Active Memory + Hybrid Recall, memory-build, topic engine, album \u0438 interaction requests \u0442\u0435\u043F\u0435\u0440\u044C \u0442\u043E\u0436\u0435 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B \u0431\u044B\u0441\u0442\u0440\u044B\u043C\u0438 \u0442\u0443\u043C\u0431\u043B\u0435\u0440\u0430\u043C\u0438.",
    people: "\u041B\u044E\u0434\u0438: \u0441\u0432\u043E\u0439 \u043F\u0440\u043E\u0444\u0438\u043B\u044C \u0432\u0438\u0434\u0438\u0442 \u043A\u0430\u0436\u0434\u044B\u0439; owner/moderator \u043C\u043E\u0433\u0443\u0442 \u0441\u043C\u043E\u0442\u0440\u0435\u0442\u044C \u043F\u043E\u0434\u0440\u043E\u0431\u043D\u0435\u0435, owner \u043D\u0430\u0441\u0442\u0440\u0430\u0438\u0432\u0430\u0435\u0442 relationship \u0446\u0438\u0444\u0440\u044B",
    channels: "\u041A\u0430\u043D\u0430\u043B\u044B: replies/interjections, mute, local reply length override, topic tags, policy \u0438 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u0430\u044F channel memory",
    search: "\u041F\u043E\u0438\u0441\u043A: \u0434\u0438\u0430\u0433\u043D\u043E\u0441\u0442\u0438\u043A\u0430 Brave/Ollama/cooldown/denylist, \u0431\u044B\u0441\u0442\u0440\u044B\u0439 search modal \u0438 on/off \u0434\u043B\u044F web search \u0438 link understanding.",
    experiments: "\u042D\u043A\u0441\u043F\u0435\u0440\u0438\u043C\u0435\u043D\u0442\u044B: media reactions, selective engagement, context actions, reflection \u0438 \u043F\u0440\u043E\u0447\u0438\u0435 \u044D\u043A\u0441\u043F\u0435\u0440\u0438\u043C\u0435\u043D\u0442\u0430\u043B\u044C\u043D\u044B\u0435 \u043F\u0435\u0440\u0435\u043A\u043B\u044E\u0447\u0430\u0442\u0435\u043B\u0438 \u043F\u0440\u044F\u043C\u043E \u0441 \u043F\u0430\u043D\u0435\u043B\u0438.",
    diagnostics: "\u0414\u0438\u0430\u0433\u043D\u043E\u0441\u0442\u0438\u043A\u0430: \u043F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u0435 trace, feature flags, search preflight, \u0441\u0442\u0440\u043E\u0433\u0438\u0435 safety/context \u0442\u0443\u043C\u0431\u043B\u0435\u0440\u044B \u0438 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u043F\u0430\u043C\u044F\u0442\u0438."
  };
  const actions = getHoriTabActions(tab, isOwner, isModerator).map((action) => action.label).join(" / ") || "\u043D\u0435\u0442 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B\u0445 \u043A\u043D\u043E\u043F\u043E\u043A";
  return new import_discord3.EmbedBuilder().setTitle(`Hori Panel: ${horiTabLabel(tab)}`).setDescription(tabText[tab]).addFields(
    { name: "\u0414\u043E\u0441\u0442\u0443\u043F", value: ownerLine, inline: true },
    { name: "\u041A\u043D\u043E\u043F\u043A\u0438", value: actions.slice(0, 1024) },
    { name: "\u041A\u043E\u043C\u0430\u043D\u0434\u044B", value: "\u041E\u0441\u043D\u043E\u0432\u043D\u043E\u0439 \u0432\u0445\u043E\u0434: `/hori`. Legacy `/bot-*` \u0441\u043A\u0440\u044B\u0442\u044B \u0438\u0437 \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u0438 \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E." }
  );
}
function buildHoriPanelRows(tab, isOwner, isModerator) {
  const rows = [
    new import_discord3.ActionRowBuilder().addComponents(
      new import_discord3.StringSelectMenuBuilder().setCustomId(`${HORI_PANEL_PREFIX}:tab`).setPlaceholder("\u0420\u0430\u0437\u0434\u0435\u043B \u043F\u0430\u043D\u0435\u043B\u0438").addOptions(
        ...HORI_PANEL_TABS.map((value) => ({
          label: horiTabLabel(value),
          value,
          default: value === tab
        }))
      )
    )
  ];
  const actions = getHoriTabActions(tab, isOwner, isModerator);
  for (let index = 0; index < actions.length; index += 5) {
    rows.push(
      new import_discord3.ActionRowBuilder().addComponents(
        ...actions.slice(index, index + 5).map(
          (action) => new import_discord3.ButtonBuilder().setCustomId(`${HORI_ACTION_PREFIX}:${action.id}`).setLabel(action.label).setStyle(action.style ?? import_discord3.ButtonStyle.Secondary)
        )
      )
    );
  }
  return rows;
}
async function buildHoriStatePanelResponse(runtime, tab, guildId, channelId) {
  const service = new BotStateService(runtime);
  const panel = await service.build(tab, guildId, channelId);
  return {
    content: "",
    embeds: [
      new import_discord3.EmbedBuilder().setTitle(panel.title).setDescription(panel.description).addFields(...panel.fields.map((field) => ({
        name: field.name,
        value: field.value || "none",
        inline: field.inline
      })))
    ],
    components: buildHoriStatePanelRows(tab)
  };
}
function buildHoriStatePanelRows(tab) {
  return [
    new import_discord3.ActionRowBuilder().addComponents(
      new import_discord3.StringSelectMenuBuilder().setCustomId(`${HORI_STATE_PANEL_PREFIX}:tab`).setPlaceholder("\u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435").addOptions(
        ...HORI_STATE_TABS.map((value) => ({
          label: horiStateTabLabel(value),
          value,
          default: value === tab
        }))
      )
    ),
    new import_discord3.ActionRowBuilder().addComponents(
      new import_discord3.ButtonBuilder().setCustomId(`${HORI_ACTION_PREFIX}:panel_home`).setLabel("Panel").setStyle(import_discord3.ButtonStyle.Secondary),
      new import_discord3.ButtonBuilder().setCustomId(`${HORI_ACTION_PREFIX}:state_brain`).setLabel("Brain").setStyle(tab === "brain" ? import_discord3.ButtonStyle.Primary : import_discord3.ButtonStyle.Secondary),
      new import_discord3.ButtonBuilder().setCustomId(`${HORI_ACTION_PREFIX}:state_trace`).setLabel("Trace").setStyle(tab === "trace" ? import_discord3.ButtonStyle.Primary : import_discord3.ButtonStyle.Secondary),
      new import_discord3.ButtonBuilder().setCustomId(`${HORI_ACTION_PREFIX}:state_tokens`).setLabel("Tokens").setStyle(tab === "tokens" ? import_discord3.ButtonStyle.Primary : import_discord3.ButtonStyle.Secondary),
      new import_discord3.ButtonBuilder().setCustomId(`${HORI_ACTION_PREFIX}:power_panel`).setLabel("Power").setStyle(import_discord3.ButtonStyle.Primary)
    ),
    new import_discord3.ActionRowBuilder().addComponents(
      new import_discord3.ButtonBuilder().setCustomId(`${HORI_ACTION_PREFIX}:debug_latest`).setLabel("Latest trace").setStyle(import_discord3.ButtonStyle.Secondary),
      new import_discord3.ButtonBuilder().setCustomId(`${HORI_ACTION_PREFIX}:search_diagnose`).setLabel("Search diag").setStyle(import_discord3.ButtonStyle.Secondary),
      new import_discord3.ButtonBuilder().setCustomId(`${HORI_ACTION_PREFIX}:state_search`).setLabel("Search state").setStyle(tab === "search" ? import_discord3.ButtonStyle.Primary : import_discord3.ButtonStyle.Secondary),
      new import_discord3.ButtonBuilder().setCustomId(`${HORI_ACTION_PREFIX}:state_features`).setLabel("Features").setStyle(tab === "features" ? import_discord3.ButtonStyle.Primary : import_discord3.ButtonStyle.Secondary)
    )
  ];
}
function getHoriTabActions(tab, isOwner, isModerator) {
  const common = [
    { id: "status", label: "\u0421\u0442\u0430\u0442\u0443\u0441", style: import_discord3.ButtonStyle.Primary },
    { id: "help", label: "Help" },
    { id: "search_query_modal", label: "Search" },
    { id: "queue_status", label: "Queue" },
    { id: "mood_status", label: "Mood" },
    { id: "profile_self", label: "\u041C\u043E\u0439 \u043F\u0440\u043E\u0444\u0438\u043B\u044C" },
    { id: "memory_self", label: "\u041C\u043E\u044F \u043F\u0430\u043C\u044F\u0442\u044C" }
  ];
  const byTab = {
    main: common,
    owner: [
      { id: "state_panel", label: "State", ownerOnly: true, style: import_discord3.ButtonStyle.Primary },
      { id: "state_trace", label: "Trace", ownerOnly: true },
      { id: "state_tokens", label: "Tokens", ownerOnly: true },
      { id: "power_panel", label: "Power", ownerOnly: true, style: import_discord3.ButtonStyle.Primary },
      { id: "ai_url_modal", label: "AI URL", ownerOnly: true },
      { id: "relationship_edit_modal", label: "Edit relation", ownerOnly: true },
      { id: "lockdown_status", label: "Lockdown?", ownerOnly: true },
      { id: "lockdown_on", label: "Lockdown on", ownerOnly: true, style: import_discord3.ButtonStyle.Danger },
      { id: "lockdown_off", label: "Lockdown off", ownerOnly: true },
      { id: "media_sync", label: "Media sync", ownerOnly: true },
      { id: "media_list", label: "Media list", ownerOnly: true },
      { id: "memory_build_server", label: "Build \u0441\u0435\u0440\u0432\u0435\u0440", ownerOnly: true }
    ],
    style: [
      { id: "style_status", label: "Snapshot", style: import_discord3.ButtonStyle.Primary },
      { id: "style_default", label: "\u0416\u0438\u0432\u043E\u0439 preset", modOnly: true, style: import_discord3.ButtonStyle.Primary },
      { id: "style_edit_modal", label: "Edit style", modOnly: true },
      { id: "mood_playful", label: "Mood playful", modOnly: true },
      { id: "mood_normal", label: "Mood normal", modOnly: true },
      { id: "natural_split_on", label: "Sprinting on", modOnly: true },
      { id: "natural_split_off", label: "Sprinting off", modOnly: true },
      featureAction("playful_mode_enabled", true, "Playful on", { modOnly: true }),
      featureAction("playful_mode_enabled", false, "Playful off", { modOnly: true }),
      featureAction("irritated_mode_enabled", true, "Irritated on", { modOnly: true }),
      featureAction("irritated_mode_enabled", false, "Irritated off", { modOnly: true }),
      featureAction("roast", true, "Roast on", { modOnly: true }),
      featureAction("roast", false, "Roast off", { modOnly: true }),
      { id: "feature_status", label: "\u0424\u0438\u0447\u0438" },
      { id: "status", label: "\u0421\u0442\u0430\u0442\u0443\u0441" }
    ],
    liveliness: [
      { id: "read_chat_on", label: "\u0427\u0438\u0442\u0430\u0442\u044C \u0447\u0430\u0442", modOnly: true, style: import_discord3.ButtonStyle.Primary },
      { id: "read_chat_off", label: "\u0422\u0438\u0445\u0438\u0439 \u043A\u0430\u043D\u0430\u043B", modOnly: true },
      { id: "natural_split_on", label: "2 \u0447\u0430\u043D\u043A\u0430", modOnly: true },
      { id: "natural_split_off", label: "1 chunk", modOnly: true },
      { id: "mood_status", label: "Mood" },
      { id: "queue_status", label: "Queue" },
      featureAction("auto_interject", true, "Interject on", { modOnly: true }),
      featureAction("auto_interject", false, "Interject off", { modOnly: true }),
      featureAction("reply_queue_enabled", true, "Queue on", { modOnly: true }),
      featureAction("reply_queue_enabled", false, "Queue off", { modOnly: true }),
      { id: "media_sync", label: "GIF pack", ownerOnly: true },
      { id: "reflection_status", label: "Reflection" },
      { id: "feature_status", label: "\u0424\u0438\u0447\u0438" }
    ],
    memory: [
      { id: "memory_status", label: "Memory status", style: import_discord3.ButtonStyle.Primary },
      { id: "memory_build_channel", label: "Build \u043A\u0430\u043D\u0430\u043B", modOnly: true },
      { id: "memory_build_server", label: "Build \u0441\u0435\u0440\u0432\u0435\u0440", ownerOnly: true },
      featureAction("topic_engine_enabled", true, "Topic on", { modOnly: true }),
      featureAction("topic_engine_enabled", false, "Topic off", { modOnly: true }),
      featureAction("memory_album_enabled", true, "Album on", { modOnly: true }),
      featureAction("memory_album_enabled", false, "Album off", { modOnly: true }),
      featureAction("interaction_requests_enabled", true, "Requests on", { modOnly: true }),
      featureAction("interaction_requests_enabled", false, "Requests off", { modOnly: true }),
      { id: "summary_current", label: "Summary" },
      { id: "topic_status", label: "Topic" },
      { id: "reflection_list", label: "Lessons" },
      { id: "memory_self", label: "\u041C\u043E\u044F \u043F\u0430\u043C\u044F\u0442\u044C" }
    ],
    people: [
      { id: "profile_self", label: "\u041C\u043E\u0439 \u043F\u0440\u043E\u0444\u0438\u043B\u044C", style: import_discord3.ButtonStyle.Primary },
      { id: "dossier_modal", label: "Open dossier", ownerOnly: true, style: import_discord3.ButtonStyle.Primary },
      { id: "relationship_self", label: "\u041E\u0442\u043D\u043E\u0448\u0435\u043D\u0438\u0435 \u043A\u043E \u043C\u043D\u0435" },
      { id: "relationship_edit_modal", label: "Edit relation", ownerOnly: true },
      { id: "relationship_hint", label: "Owner edit", ownerOnly: true },
      { id: "memory_self", label: "\u041C\u043E\u044F \u043F\u0430\u043C\u044F\u0442\u044C" }
    ],
    channels: [
      { id: "channel_policy", label: "Policy", style: import_discord3.ButtonStyle.Primary },
      { id: "channel_edit_modal", label: "Edit channel", modOnly: true },
      { id: "read_chat_on", label: "Interject on", modOnly: true },
      { id: "read_chat_off", label: "Quiet mode", modOnly: true },
      { id: "topic_status", label: "Topic" },
      { id: "topic_reset", label: "Reset topic", modOnly: true },
      { id: "queue_status", label: "Queue" },
      { id: "queue_clear", label: "Clear queue", modOnly: true },
      { id: "summary_current", label: "Summary" },
      { id: "memory_status", label: "Channel memory" }
    ],
    search: [
      { id: "search_query_modal", label: "Search", style: import_discord3.ButtonStyle.Primary },
      { id: "search_diagnose", label: "\u0414\u0438\u0430\u0433\u043D\u043E\u0441\u0442\u0438\u043A\u0430", style: import_discord3.ButtonStyle.Primary },
      featureAction("web_search", true, "Search on", { modOnly: true }),
      featureAction("web_search", false, "Search off", { modOnly: true }),
      featureAction("link_understanding_enabled", true, "Links on", { modOnly: true }),
      featureAction("link_understanding_enabled", false, "Links off", { modOnly: true }),
      { id: "feature_status", label: "\u0424\u0438\u0447\u0438" },
      { id: "state_search", label: "Search state", ownerOnly: true },
      { id: "state_tokens", label: "Tokens", ownerOnly: true }
    ],
    experiments: [
      { id: "natural_split_on", label: "Sprinting on", modOnly: true, style: import_discord3.ButtonStyle.Primary },
      { id: "natural_split_off", label: "Sprinting off", modOnly: true },
      { id: "mood_playful", label: "Mood playful", modOnly: true },
      featureAction("media_reactions_enabled", true, "Media on", { modOnly: true }),
      featureAction("media_reactions_enabled", false, "Media off", { modOnly: true }),
      featureAction("selective_engagement_enabled", true, "Selective on", { modOnly: true }),
      featureAction("selective_engagement_enabled", false, "Selective off", { modOnly: true }),
      featureAction("context_actions", true, "Ctx actions on", { modOnly: true }),
      featureAction("context_actions", false, "Ctx actions off", { modOnly: true }),
      featureAction("self_reflection_lessons_enabled", true, "Reflect on", { modOnly: true }),
      featureAction("self_reflection_lessons_enabled", false, "Reflect off", { modOnly: true }),
      { id: "feature_status", label: "\u0424\u0438\u0447\u0438" },
      { id: "media_list", label: "Media list" },
      { id: "reflection_status", label: "Reflection" },
      { id: "reflection_list", label: "Lessons" },
      { id: "media_sync", label: "Media sync", ownerOnly: true }
    ],
    diagnostics: [
      { id: "debug_latest", label: "Latest trace", style: import_discord3.ButtonStyle.Primary },
      { id: "search_diagnose", label: "Search diag" },
      featureAction("anti_slop_strict_mode", true, "Strict on", { modOnly: true }),
      featureAction("anti_slop_strict_mode", false, "Strict off", { modOnly: true }),
      featureAction("context_confidence_enabled", true, "Ctx conf on", { modOnly: true }),
      featureAction("context_confidence_enabled", false, "Ctx conf off", { modOnly: true }),
      featureAction("channel_aware_mode", true, "Channel-aware on", { modOnly: true }),
      featureAction("channel_aware_mode", false, "Channel-aware off", { modOnly: true }),
      featureAction("message_kind_aware_mode", true, "Kind-aware on", { modOnly: true }),
      featureAction("message_kind_aware_mode", false, "Kind-aware off", { modOnly: true }),
      { id: "feature_status", label: "\u0424\u0438\u0447\u0438" },
      { id: "queue_status", label: "Queue" },
      { id: "stats_week", label: "Stats" },
      { id: "state_trace", label: "Trace state", ownerOnly: true },
      { id: "state_tokens", label: "Token state", ownerOnly: true },
      { id: "status", label: "\u0421\u0442\u0430\u0442\u0443\u0441" }
    ]
  };
  return byTab[tab].filter((action) => {
    if (action.ownerOnly) {
      return isOwner;
    }
    if (action.modOnly) {
      return isOwner || isModerator;
    }
    return true;
  });
}
function parseHoriPanelTab(value) {
  return HORI_PANEL_TABS.includes(value) ? value : null;
}
function horiTabLabel(tab) {
  const labels = {
    main: "\u0413\u043B\u0430\u0432\u043D\u0430\u044F",
    owner: "\u0412\u043B\u0430\u0434\u0435\u043B\u0435\u0446",
    style: "\u0421\u0442\u0438\u043B\u044C",
    liveliness: "\u0416\u0438\u0432\u043E\u0441\u0442\u044C",
    memory: "\u041F\u0430\u043C\u044F\u0442\u044C",
    people: "\u041B\u044E\u0434\u0438",
    channels: "\u041A\u0430\u043D\u0430\u043B\u044B",
    search: "\u041F\u043E\u0438\u0441\u043A",
    experiments: "\u042D\u043A\u0441\u043F\u0435\u0440\u0438\u043C\u0435\u043D\u0442\u044B",
    diagnostics: "\u0414\u0438\u0430\u0433\u043D\u043E\u0441\u0442\u0438\u043A\u0430"
  };
  return labels[tab];
}
function inferTabForHoriAction(action) {
  const featureToggle = parsePanelFeatureToggleAction(action);
  if (featureToggle) {
    return inferPanelTabForFeatureKey(featureToggle.key);
  }
  if (action.startsWith("memory")) return "memory";
  if (action.startsWith("search")) return "search";
  if (action.startsWith("lockdown") || action === "power_panel" || action === "state_panel" || action === "ai_url_modal") return "owner";
  if (action.startsWith("relationship") || action.startsWith("profile")) return "people";
  if (action.startsWith("channel") || action === "read_chat_on" || action === "read_chat_off" || action.startsWith("topic") || action.startsWith("queue") || action === "summary_current") return "channels";
  if (action.startsWith("debug") || action === "feature_status") return "diagnostics";
  if (action.startsWith("style") || action.startsWith("natural") || action.startsWith("mood")) return "style";
  if (action.startsWith("reflection") || action === "media_list") return "experiments";
  return "main";
}
function horiActionTitle(action) {
  const featureToggle = parsePanelFeatureToggleAction(action);
  if (featureToggle) {
    return `${PANEL_FEATURE_LABELS[featureToggle.key]}: ${featureToggle.enabled ? "on" : "off"}`;
  }
  const titles = {
    status: "\u0411\u044B\u0441\u0442\u0440\u044B\u0439 \u0441\u0442\u0430\u0442\u0443\u0441",
    help: "Help",
    search_query_modal: "\u041F\u043E\u0438\u0441\u043A",
    style_status: "Persona snapshot",
    profile_self: "\u041C\u043E\u0439 \u043F\u0440\u043E\u0444\u0438\u043B\u044C",
    memory_self: "\u041C\u043E\u044F \u043F\u0430\u043C\u044F\u0442\u044C",
    relationship_self: "\u041E\u0442\u043D\u043E\u0448\u0435\u043D\u0438\u0435 \u043A\u043E \u043C\u043D\u0435",
    relationship_hint: "Relationship hint",
    style_default: "\u0416\u0438\u0432\u043E\u0439 preset",
    natural_split_on: "Natural splitting: on",
    natural_split_off: "Natural splitting: off",
    read_chat_on: "\u0427\u0442\u0435\u043D\u0438\u0435 \u0447\u0430\u0442\u0430: on",
    read_chat_off: "\u0427\u0442\u0435\u043D\u0438\u0435 \u0447\u0430\u0442\u0430: off",
    media_sync: "Media sync-pack",
    media_list: "Media list",
    memory_status: "Memory status",
    summary_current: "Summary",
    stats_week: "\u041D\u0435\u0434\u0435\u043B\u044C\u043D\u0430\u044F \u0441\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043A\u0430",
    topic_status: "Topic status",
    topic_reset: "Topic reset",
    queue_status: "Queue status",
    queue_clear: "Queue clear",
    mood_status: "Mood status",
    mood_normal: "Mood: normal",
    mood_playful: "Mood: playful",
    reflection_status: "Reflection status",
    reflection_list: "Reflection lessons",
    search_diagnose: "Search diagnostics",
    feature_status: "Feature flags",
    channel_policy: "Channel policy",
    debug_latest: "Latest trace"
  };
  return titles[action] ?? "Panel action";
}
function featureAction(key, enabled, label, options = {}) {
  return {
    id: `feature_${key}_${enabled ? "on" : "off"}`,
    label,
    ...options
  };
}
function parsePanelFeatureToggleAction(action) {
  if (!action.startsWith("feature_")) {
    return null;
  }
  if (action.endsWith("_on")) {
    const key = action.slice("feature_".length, -3);
    return key in PANEL_FEATURE_LABELS ? { key, enabled: true } : null;
  }
  if (action.endsWith("_off")) {
    const key = action.slice("feature_".length, -4);
    return key in PANEL_FEATURE_LABELS ? { key, enabled: false } : null;
  }
  return null;
}
function inferPanelTabForFeatureKey(key) {
  switch (key) {
    case "web_search":
    case "link_understanding_enabled":
      return "search";
    case "auto_interject":
    case "reply_queue_enabled":
      return "liveliness";
    case "playful_mode_enabled":
    case "irritated_mode_enabled":
    case "roast":
      return "style";
    case "topic_engine_enabled":
    case "memory_album_enabled":
    case "interaction_requests_enabled":
      return "memory";
    case "media_reactions_enabled":
    case "selective_engagement_enabled":
    case "context_actions":
    case "self_reflection_lessons_enabled":
      return "experiments";
    case "anti_slop_strict_mode":
    case "context_confidence_enabled":
    case "channel_aware_mode":
    case "message_kind_aware_mode":
      return "diagnostics";
  }
}
async function applyPanelFeatureToggle(runtime, guildId, key, enabled) {
  return [
    await runtime.slashAdmin.updateFeature(guildId, key, enabled),
    "",
    await buildFeatureStatus(runtime, guildId)
  ].join("\n");
}
function buildHoriDetailEmbed(title, body) {
  return new import_discord3.EmbedBuilder().setTitle(title).setDescription(clipPanelText(body));
}
function buildPowerPanelResponse(content, activeProfile) {
  return {
    content: "",
    embeds: [buildHoriDetailEmbed("Hori Power Panel", content)],
    components: [
      ...buildPowerPanelRows(activeProfile),
      new import_discord3.ActionRowBuilder().addComponents(
        new import_discord3.ButtonBuilder().setCustomId(`${HORI_ACTION_PREFIX}:panel_home`).setLabel("Panel").setStyle(import_discord3.ButtonStyle.Secondary),
        new import_discord3.ButtonBuilder().setCustomId(`${HORI_ACTION_PREFIX}:state_brain`).setLabel("Brain").setStyle(import_discord3.ButtonStyle.Secondary),
        new import_discord3.ButtonBuilder().setCustomId(`${HORI_ACTION_PREFIX}:state_tokens`).setLabel("Tokens").setStyle(import_discord3.ButtonStyle.Secondary)
      )
    ]
  };
}
function clipPanelText(value, max = 4e3) {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value || "none";
}
async function buildHoriStatus(runtime, guildId, channelId) {
  const [power, lockdown, memory] = await Promise.all([
    runtime.slashAdmin.powerStatus(),
    getOwnerLockdownState(runtime, true),
    runtime.slashAdmin.channelMemoryStatus(guildId, channelId)
  ]);
  return [
    "Hori status",
    power,
    `Owner lockdown: ${lockdown.enabled ? "on" : "off"}`,
    memory
  ].join("\n\n");
}
async function buildFeatureStatus(runtime, guildId) {
  const flags = await runtime.runtimeConfig.getFeatureFlags(guildId);
  return Object.entries(flags).map(([key, value]) => `${value ? "on " : "off"} ${key}`).join("\n").slice(0, 1900);
}
async function buildChannelPolicyStatus(runtime, guildId, channelId) {
  const policy = await runtime.runtimeConfig.getChannelPolicy(guildId, channelId);
  return [
    `Channel policy for ${channelId}`,
    `allowBotReplies=${policy.allowBotReplies}`,
    `allowInterjections=${policy.allowInterjections}`,
    `isMuted=${policy.isMuted}`,
    `responseLengthOverride=${policy.responseLengthOverride ?? "inherit"}`,
    `topicInterestTags=${policy.topicInterestTags.join(", ") || "none"}`
  ].join("\n");
}
async function buildStyleStatus(runtime, guildId) {
  const settings = await runtime.runtimeConfig.getGuildSettings(guildId);
  return [
    "Guild persona settings",
    `botName=${settings.botName}`,
    `preferredLanguage=${settings.preferredLanguage}`,
    `roughness=${settings.roughnessLevel}, sarcasm=${settings.sarcasmLevel}, roast=${settings.roastLevel}`,
    `interjectTendency=${settings.interjectTendency}, replyLength=${settings.replyLength}`,
    `preferredStyle=${settings.preferredStyle}`,
    `forbiddenWords=${settings.forbiddenWords.join(", ") || "none"}`,
    `forbiddenTopics=${settings.forbiddenTopics.join(", ") || "none"}`
  ].join("\n");
}
async function buildLatestDebugTrace(runtime, guildId) {
  const trace = await runtime.prisma.botEventLog.findFirst({
    where: { guildId },
    orderBy: { createdAt: "desc" },
    select: {
      messageId: true,
      eventType: true,
      intent: true,
      routeReason: true,
      usedSearch: true,
      toolCalls: true,
      memoryLayers: true,
      debugTrace: true,
      createdAt: true
    }
  });
  if (!trace) {
    return "Trace \u043F\u043E\u043A\u0430 \u043D\u0435\u0442.";
  }
  return JSON.stringify(trace, null, 2).slice(0, 1900);
}
async function diagnoseSearch(runtime) {
  const lines = [
    `BRAVE_SEARCH_API_KEY: ${runtime.env.BRAVE_SEARCH_API_KEY ? "set" : "missing"}`,
    `SEARCH_USER_COOLDOWN_SEC: ${runtime.env.SEARCH_USER_COOLDOWN_SEC}`,
    `SEARCH_MAX_REQUESTS_PER_RESPONSE: ${runtime.env.SEARCH_MAX_REQUESTS_PER_RESPONSE}`,
    `SEARCH_MAX_PAGES_PER_RESPONSE: ${runtime.env.SEARCH_MAX_PAGES_PER_RESPONSE}`,
    `SEARCH_DOMAIN_DENYLIST: ${runtime.env.SEARCH_DOMAIN_DENYLIST.join(", ") || "none"}`,
    `OLLAMA_BASE_URL: ${runtime.env.OLLAMA_BASE_URL ?? "missing"}`,
    `OLLAMA_SMART_MODEL: ${runtime.env.OLLAMA_SMART_MODEL}`,
    `OLLAMA_TIMEOUT_MS: ${runtime.env.OLLAMA_TIMEOUT_MS}`
  ];
  if (runtime.env.OLLAMA_BASE_URL) {
    try {
      const response = await fetch(new URL("/api/tags", runtime.env.OLLAMA_BASE_URL), {
        signal: AbortSignal.timeout(5e3)
      });
      if (response.ok) {
        const payload = await response.json();
        lines.push(`Ollama tags: ok (${payload.models?.map((model) => model.name).filter(Boolean).join(", ") || "no models"})`);
      } else {
        lines.push(`Ollama tags: status ${response.status}`);
      }
    } catch (error) {
      lines.push(`Ollama tags: ${(0, import_shared3.asErrorMessage)(error)}`);
    }
  }
  return lines.join("\n");
}
async function startMemoryBuildRun(runtime, guildId, channelId, scope, depth, requestedBy) {
  const run = await runtime.prisma.memoryBuildRun.create({
    data: {
      guildId,
      channelId,
      scope,
      depth,
      status: "queued",
      requestedBy,
      progressJson: {
        phase: "queued",
        processedChunks: 0,
        totalChunks: 0
      }
    }
  });
  const payload = { runId: run.id, guildId, channelId, scope, depth, requestedBy };
  await runtime.queues.memoryFormation.add("memory.formation", payload, { jobId: `memory-formation:${run.id}` });
  return [
    "Memory-build \u043F\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D \u0432 \u043E\u0447\u0435\u0440\u0435\u0434\u044C",
    `runId: ${run.id}`,
    `scope=${scope}, depth=${depth}${channelId ? `, channel=${channelId}` : ""}`,
    "\u0421\u0442\u0430\u0442\u0443\u0441 \u0441\u043C\u043E\u0442\u0440\u0438 \u0432 /hori panel -> \u041F\u0430\u043C\u044F\u0442\u044C -> Memory status"
  ].join("\n");
}
function getInteractionDisplayName(interaction) {
  return interaction.member && "displayName" in interaction.member ? interaction.member.displayName : interaction.user.globalName;
}
function getInteractionMemberDisplayName(interaction) {
  return interaction.member && "displayName" in interaction.member ? interaction.member.displayName : interaction.user.globalName;
}
function hasManageGuild(interaction) {
  return interaction.memberPermissions?.has(import_discord3.PermissionFlagsBits.ManageGuild) ?? false;
}
async function fetchSourceMessageForAlbum(runtime, interaction, messageId) {
  if (interaction.channel && "messages" in interaction.channel) {
    try {
      const sourceMessage = await interaction.channel.messages.fetch(messageId);
      return {
        content: sourceMessage.content,
        authorUserId: sourceMessage.author.id,
        sourceUrl: sourceMessage.url
      };
    } catch {
    }
  }
  const stored = await runtime.prisma.message.findUnique({
    where: { id: messageId },
    select: { content: true, userId: true }
  });
  return {
    content: stored?.content ?? "",
    authorUserId: stored?.userId ?? null,
    sourceUrl: null
  };
}
function buildMemoryAlbumModalId(requestId, messageId) {
  return `${MEMORY_ALBUM_MODAL_PREFIX}:${requestId}:${messageId}`;
}
function buildAiUrlModal(currentUrl) {
  const modal = new import_discord3.ModalBuilder().setCustomId(`${HORI_MODAL_PREFIX}:ai-url`).setTitle("Ollama URL");
  modal.addComponents(
    new import_discord3.ActionRowBuilder().addComponents(
      new import_discord3.TextInputBuilder().setCustomId("url").setLabel("\u041D\u043E\u0432\u044B\u0439 Ollama URL").setPlaceholder("https://...").setValue(currentUrl ?? "").setRequired(true).setMaxLength(300).setStyle(import_discord3.TextInputStyle.Short)
    )
  );
  return modal;
}
function buildSearchModal() {
  const modal = new import_discord3.ModalBuilder().setCustomId(`${HORI_MODAL_PREFIX}:search`).setTitle("Hori Search");
  modal.addComponents(
    new import_discord3.ActionRowBuilder().addComponents(
      new import_discord3.TextInputBuilder().setCustomId("query").setLabel("\u0427\u0442\u043E \u0438\u0441\u043A\u0430\u0442\u044C").setPlaceholder("\u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: \u043B\u0443\u0447\u0448\u0438\u0435 \u043F\u0440\u0430\u043A\u0442\u0438\u043A\u0438 discord button ux").setRequired(true).setMaxLength(300).setStyle(import_discord3.TextInputStyle.Paragraph)
    )
  );
  return modal;
}
function buildRelationshipModal() {
  const modal = new import_discord3.ModalBuilder().setCustomId(`${HORI_MODAL_PREFIX}:relationship`).setTitle("Relationship editor");
  modal.addComponents(
    new import_discord3.ActionRowBuilder().addComponents(
      new import_discord3.TextInputBuilder().setCustomId("userId").setLabel("Discord user ID").setRequired(true).setMaxLength(40).setStyle(import_discord3.TextInputStyle.Short)
    ),
    new import_discord3.ActionRowBuilder().addComponents(
      new import_discord3.TextInputBuilder().setCustomId("toneBias").setLabel("toneBias").setPlaceholder("neutral / friendly / sharp / playful").setRequired(false).setMaxLength(40).setStyle(import_discord3.TextInputStyle.Short)
    ),
    new import_discord3.ActionRowBuilder().addComponents(
      new import_discord3.TextInputBuilder().setCustomId("levels").setLabel("roast,praise,interrupt").setPlaceholder("2,1,0").setRequired(false).setMaxLength(30).setStyle(import_discord3.TextInputStyle.Short)
    ),
    new import_discord3.ActionRowBuilder().addComponents(
      new import_discord3.TextInputBuilder().setCustomId("signals").setLabel("closeness,trust,familiarity,proactivity").setPlaceholder("0.6,0.5,0.7,0.5").setRequired(false).setMaxLength(60).setStyle(import_discord3.TextInputStyle.Short)
    ),
    new import_discord3.ActionRowBuilder().addComponents(
      new import_discord3.TextInputBuilder().setCustomId("switches").setLabel("doNotMock,doNotInitiate,topics").setPlaceholder("false,false,\u0442\u0435\u043C\u04301,\u0442\u0435\u043C\u04302").setRequired(false).setMaxLength(200).setStyle(import_discord3.TextInputStyle.Paragraph)
    )
  );
  return modal;
}
function buildDossierModal() {
  const modal = new import_discord3.ModalBuilder().setCustomId(`${HORI_MODAL_PREFIX}:dossier`).setTitle("Owner dossier");
  modal.addComponents(
    new import_discord3.ActionRowBuilder().addComponents(
      new import_discord3.TextInputBuilder().setCustomId("userId").setLabel("Discord user ID").setPlaceholder("123456789012345678").setRequired(true).setMaxLength(40).setStyle(import_discord3.TextInputStyle.Short)
    )
  );
  return modal;
}
function buildStyleModal(current) {
  const modal = new import_discord3.ModalBuilder().setCustomId(`${HORI_MODAL_PREFIX}:style`).setTitle("Style editor");
  modal.addComponents(
    new import_discord3.ActionRowBuilder().addComponents(
      new import_discord3.TextInputBuilder().setCustomId("botName").setLabel("\u0418\u043C\u044F").setPlaceholder("\u0425\u043E\u0440\u0438").setRequired(false).setValue(current?.botName ?? "").setMaxLength(40).setStyle(import_discord3.TextInputStyle.Short)
    ),
    new import_discord3.ActionRowBuilder().addComponents(
      new import_discord3.TextInputBuilder().setCustomId("levels").setLabel("roughness,sarcasm,roast").setPlaceholder("2,3,2").setRequired(false).setValue(current ? `${current.roughnessLevel},${current.sarcasmLevel},${current.roastLevel}` : "").setMaxLength(30).setStyle(import_discord3.TextInputStyle.Short)
    ),
    new import_discord3.ActionRowBuilder().addComponents(
      new import_discord3.TextInputBuilder().setCustomId("replyLength").setLabel("replyLength,language,interject").setPlaceholder("short,ru,1").setRequired(false).setValue(current ? `${current.replyLength},${current.preferredLanguage},${current.interjectTendency}` : "").setMaxLength(20).setStyle(import_discord3.TextInputStyle.Short)
    ),
    new import_discord3.ActionRowBuilder().addComponents(
      new import_discord3.TextInputBuilder().setCustomId("preferredStyle").setLabel("\u0421\u0442\u0438\u043B\u044C").setRequired(false).setValue(current?.preferredStyle ?? "").setMaxLength(900).setStyle(import_discord3.TextInputStyle.Paragraph)
    ),
    new import_discord3.ActionRowBuilder().addComponents(
      new import_discord3.TextInputBuilder().setCustomId("forbidden").setLabel("forbiddenWords | forbiddenTopics").setPlaceholder("\u0441\u043B\u043E\u0432\u043E1,\u0441\u043B\u043E\u0432\u043E2 | \u0442\u0435\u043C\u04301,\u0442\u0435\u043C\u04302").setRequired(false).setValue(current ? `${current.forbiddenWords.join(", ")} | ${current.forbiddenTopics.join(", ")}` : "").setMaxLength(400).setStyle(import_discord3.TextInputStyle.Paragraph)
    )
  );
  return modal;
}
function buildChannelModal(channelId, current) {
  const modal = new import_discord3.ModalBuilder().setCustomId(`${HORI_MODAL_PREFIX}:channel:${channelId}`).setTitle("Channel policy");
  modal.addComponents(
    new import_discord3.ActionRowBuilder().addComponents(
      new import_discord3.TextInputBuilder().setCustomId("allowBotReplies").setLabel("allowBotReplies").setPlaceholder("true / false / \u043F\u0443\u0441\u0442\u043E").setRequired(false).setValue(booleanToFieldValue(current?.allowBotReplies)).setMaxLength(10).setStyle(import_discord3.TextInputStyle.Short)
    ),
    new import_discord3.ActionRowBuilder().addComponents(
      new import_discord3.TextInputBuilder().setCustomId("allowInterjections").setLabel("allowInterjections").setPlaceholder("true / false / \u043F\u0443\u0441\u0442\u043E").setRequired(false).setValue(booleanToFieldValue(current?.allowInterjections)).setMaxLength(10).setStyle(import_discord3.TextInputStyle.Short)
    ),
    new import_discord3.ActionRowBuilder().addComponents(
      new import_discord3.TextInputBuilder().setCustomId("isMuted").setLabel("isMuted").setPlaceholder("true / false / \u043F\u0443\u0441\u0442\u043E").setRequired(false).setValue(booleanToFieldValue(current?.isMuted)).setMaxLength(10).setStyle(import_discord3.TextInputStyle.Short)
    ),
    new import_discord3.ActionRowBuilder().addComponents(
      new import_discord3.TextInputBuilder().setCustomId("responseLengthOverride").setLabel("responseLengthOverride").setPlaceholder("short / medium / long / inherit").setRequired(false).setValue(current?.responseLengthOverride ?? "").setMaxLength(20).setStyle(import_discord3.TextInputStyle.Short)
    ),
    new import_discord3.ActionRowBuilder().addComponents(
      new import_discord3.TextInputBuilder().setCustomId("topicInterestTags").setLabel("topicInterestTags").setPlaceholder("\u043C\u0435\u043C\u044B,\u0442\u0435\u0445,\u0438\u0433\u0440\u044B").setRequired(false).setValue(current?.topicInterestTags.join(", ") ?? "").setMaxLength(200).setStyle(import_discord3.TextInputStyle.Paragraph)
    )
  );
  return modal;
}
function parseMemoryAlbumModalId(customId) {
  const [prefix, requestId, messageId] = customId.split(":");
  if (prefix !== MEMORY_ALBUM_MODAL_PREFIX || !requestId || !messageId) {
    return null;
  }
  return { requestId, messageId };
}
function buildPowerPanelRows(activeProfile) {
  return [
    new import_discord3.ActionRowBuilder().addComponents(
      ...POWER_PROFILES.map(
        (profile) => new import_discord3.ButtonBuilder().setCustomId(`${POWER_PANEL_PREFIX}:apply:${profile}`).setLabel(profile).setStyle(profile === activeProfile ? import_discord3.ButtonStyle.Primary : import_discord3.ButtonStyle.Secondary)
      )
    )
  ];
}
function isPowerProfile(value) {
  return POWER_PROFILES.includes(value);
}
function blankToNull(value) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
function readNumberList(value) {
  return value.split(",").map((part) => {
    const parsed = Number(part.trim());
    return Number.isFinite(parsed) ? parsed : void 0;
  });
}
function readTextList(value) {
  return value.split(",").map((part) => part.trim());
}
function readIntegerText(value, min, max) {
  if (!value?.trim()) {
    return void 0;
  }
  const parsed = Number(value.trim());
  return Number.isInteger(parsed) ? Math.max(min, Math.min(max, parsed)) : void 0;
}
function readIntInRange(value, min, max) {
  if (value === void 0 || !Number.isInteger(value)) {
    return void 0;
  }
  return Math.max(min, Math.min(max, value));
}
function readUnitFloat(value) {
  if (value === void 0 || !Number.isFinite(value)) {
    return void 0;
  }
  return Math.max(0, Math.min(1, value));
}
function readOptionalBoolean(value) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return void 0;
  }
  if (["true", "1", "yes", "on", "\u0434\u0430"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "off", "\u043D\u0435\u0442"].includes(normalized)) {
    return false;
  }
  return void 0;
}
function parseReplyLengthSelection(value) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return void 0;
  }
  if (["inherit", "default", "none", "reset", "clear"].includes(normalized)) {
    return null;
  }
  return normalized === "short" || normalized === "medium" || normalized === "long" ? normalized : void 0;
}
function booleanToFieldValue(value) {
  return value === void 0 ? "" : value ? "true" : "false";
}

// src/router/message-router.ts
var import_discord4 = require("discord.js");
var import_analytics = require("@hori/analytics");
var import_core = require("@hori/core");

// src/router/background-jobs.ts
var import_shared4 = require("@hori/shared");
function buildJobId(...parts) {
  return parts.map((part) => part.trim()).filter(Boolean).join("-").replace(/[:\s]+/g, "-");
}
async function enqueueBackgroundJobs(runtime, envelope) {
  const jobs = [
    {
      queue: "summary",
      task: runtime.queues.summary.add(
        "summary",
        { guildId: envelope.guildId, channelId: envelope.channelId },
        { jobId: buildJobId("summary", envelope.guildId, envelope.channelId) }
      )
    },
    {
      queue: "profile",
      task: runtime.queues.profile.add(
        "profile",
        { guildId: envelope.guildId, userId: envelope.userId },
        { jobId: buildJobId("profile", envelope.guildId, envelope.userId) }
      )
    },
    {
      queue: "embedding",
      task: envelope.content.length >= runtime.env.MESSAGE_EMBED_MIN_CHARS ? runtime.queues.embedding.add(
        "embedding",
        { entityType: "message", entityId: envelope.messageId },
        { jobId: buildJobId("embedding", envelope.messageId) }
      ) : Promise.resolve()
    },
    {
      queue: "topic",
      task: runtime.queues.topic.add(
        "topic",
        { guildId: envelope.guildId, channelId: envelope.channelId, messageId: envelope.messageId },
        { jobId: buildJobId("topic", envelope.messageId) }
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
          error: (0, import_shared4.asErrorMessage)(result.reason)
        },
        "background queue enqueue failed"
      );
    }
  }
}

// src/responders/message-responder.ts
var import_node_path = require("path");
var import_shared5 = require("@hori/shared");
async function sendReply(message, reply, options = {}) {
  const text = typeof reply === "string" ? reply : reply.text;
  const media = typeof reply === "string" ? null : reply.media;
  const chunks = media || !options.naturalChunks?.length ? (0, import_shared5.splitLongMessage)(text) : options.naturalChunks;
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
function mediaReplyPayload(content, filePath) {
  const resolvedPath = (0, import_node_path.isAbsolute)(filePath) ? filePath : (0, import_node_path.resolve)(process.cwd(), filePath);
  return content ? { content, files: [resolvedPath] } : { files: [resolvedPath] };
}
function sleep(ms) {
  return new Promise((resolve2) => setTimeout(resolve2, ms));
}

// src/router/message-router.ts
var intentRouter = new import_core.IntentRouter();
var inboundDebouncers = /* @__PURE__ */ new Map();
var naturalSplitCooldownByChannel = /* @__PURE__ */ new Map();
var EMPTY_REPLY_FALLBACK = "\u0421\u0435\u043A, \u0443 \u043C\u0435\u043D\u044F \u043E\u0442\u0432\u0435\u0442 \u0440\u0430\u0437\u0432\u0430\u043B\u0438\u043B\u0441\u044F. \u041F\u043E\u0432\u0442\u043E\u0440\u0438 \u0435\u0449\u0451 \u0440\u0430\u0437.";
function isBlankReplyText(value) {
  return !value || !value.trim();
}
function prepareReplyForDelivery(reply) {
  if (typeof reply === "string") {
    return isBlankReplyText(reply) ? EMPTY_REPLY_FALLBACK : reply;
  }
  if (!reply) {
    return EMPTY_REPLY_FALLBACK;
  }
  if (reply.media) {
    return reply;
  }
  return isBlankReplyText(reply.text) ? { ...reply, text: EMPTY_REPLY_FALLBACK } : reply;
}
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
async function shouldAutoInterject(runtime, message, routingConfig) {
  if (!message.guildId) {
    return false;
  }
  const relationship = await runtime.prisma.relationshipProfile.findUnique({
    where: {
      guildId_userId: {
        guildId: message.guildId,
        userId: message.author.id
      }
    },
    select: {
      doNotInitiate: true,
      proactivityPreference: true,
      interruptPriority: true
    }
  });
  const decision = (0, import_core.evaluateSelectiveEngagement)({
    content: message.content,
    enabled: routingConfig.featureFlags.selectiveEngagementEnabled,
    autoInterjectEnabled: routingConfig.featureFlags.autoInterject,
    channelAllowsInterjections: routingConfig.channelPolicy.allowInterjections,
    channelMuted: routingConfig.channelPolicy.isMuted,
    hasAttachments: message.attachments.size > 0,
    interjectTendency: routingConfig.guildSettings.interjectTendency,
    relationshipDoNotInitiate: relationship?.doNotInitiate,
    relationshipProactivityPreference: relationship?.proactivityPreference,
    relationshipInterruptPriority: relationship?.interruptPriority,
    minScore: runtime.env.SELECTIVE_ENGAGEMENT_MIN_SCORE
  });
  if (!decision.shouldInterject) {
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
  return true;
}
async function routeMessage(runtime, message) {
  if (!message.inGuild() || message.author.bot || !runtime.client.user) {
    return;
  }
  const ownerLockdownState = await getOwnerLockdownState(runtime);
  const ownerLockdownActive = ownerLockdownState.enabled && runtime.env.DISCORD_OWNER_IDS.length > 0;
  if (ownerLockdownActive && !isBotOwner(runtime, message.author.id)) {
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
  const autoInterject = !explicitInvocation && !ownerLockdownActive && routingConfig.featureFlags.autoInterject && routingConfig.channelPolicy.allowInterjections && !routingConfig.channelPolicy.isMuted && (!runtime.env.AUTOINTERJECT_CHANNEL_ALLOWLIST.length || runtime.env.AUTOINTERJECT_CHANNEL_ALLOWLIST.includes(message.channelId)) && await shouldAutoInterject(runtime, message, routingConfig);
  const envelope = buildEnvelope(message, member, botName, botId, triggerSource, explicitInvocation, autoInterject);
  await runtime.ingestService.ingestMessage({
    ...envelope,
    guildName: message.guild.name,
    channelName: envelope.channelName,
    isBotUser: false
  });
  (0, import_analytics.trackIngestedMessage)();
  void enqueueBackgroundJobs(runtime, envelope).catch((error) => {
    runtime.logger.warn({ messageId: envelope.messageId, error }, "background job scheduling crashed");
  });
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
  const replyToSend = prepareReplyForDelivery(result.reply);
  if (replyToSend !== result.reply) {
    runtime.logger.warn(
      {
        messageId: envelope.messageId,
        channelId: envelope.channelId,
        guildId: envelope.guildId,
        intent: result.trace.intent,
        hasOriginalReply: Boolean(result.reply),
        originalReplyType: typeof result.reply
      },
      "orchestrator returned empty reply, using fallback"
    );
  }
  const replyText = typeof replyToSend === "string" ? replyToSend : replyToSend.text;
  const hasMedia = typeof replyToSend !== "string" && Boolean(replyToSend.media);
  const microSplitChunks = result.trace.microReaction?.splitChunks;
  const splitPlan = hasMedia ? null : microSplitChunks?.length ? {
    chunks: microSplitChunks,
    delayMs: 650,
    reason: "micro_reaction"
  } : (0, import_core.planNaturalMessageSplit)({
    text: replyText,
    enabled: routingConfig.featureFlags.naturalMessageSplittingEnabled,
    intent: result.trace.intent,
    explicitInvocation: envelope.explicitInvocation,
    triggerSource: result.trace.triggerSource,
    messageKind: result.trace.behavior?.messageKind,
    nowMs: Date.now(),
    lastSplitAtMs: naturalSplitCooldownByChannel.get(message.channelId),
    cooldownMs: runtime.env.NATURAL_SPLIT_COOLDOWN_SEC * 1e3,
    chance: runtime.env.NATURAL_SPLIT_CHANCE,
    random: Math.random()
  });
  if (splitPlan) {
    naturalSplitCooldownByChannel.set(message.channelId, Date.now());
  }
  await sendReply(message, replyToSend, {
    naturalChunks: splitPlan?.chunks,
    naturalDelayMs: splitPlan?.delayMs
  });
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
  const slashCommandDefinitions2 = getSlashCommandDefinitions({
    includeLegacy: runtime.env.DISCORD_REGISTER_LEGACY_COMMANDS
  });
  const body = [...slashCommandDefinitions2, ...contextMenuDefinitions];
  const slashCount = slashCommandDefinitions2.length;
  const contextCount = contextMenuDefinitions.length;
  await rest.put(import_discord5.Routes.applicationCommands(runtime.env.DISCORD_CLIENT_ID), { body });
  runtime.logger.info(
    { scope: "global", slash: slashCount, context: contextCount, total: body.length, legacy: runtime.env.DISCORD_REGISTER_LEGACY_COMMANDS },
    "discord commands synced globally"
  );
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
      if (interaction.isChatInputCommand() || interaction.isMessageContextMenuCommand() || interaction.isModalSubmit() || interaction.isButton() || interaction.isStringSelectMenu()) {
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
    memoryFormation: createNoopQueue("memoryFormation"),
    cleanup: createNoopQueue("cleanup"),
    searchCache: createNoopQueue("searchCache"),
    prefix
  };
}
async function bootstrapBot() {
  const env = (0, import_config.loadEnv)();
  (0, import_config.assertEnvForRole)(env, "bot");
  const logger = (0, import_shared6.createLogger)(env.LOG_LEVEL);
  const prisma = (0, import_shared6.createPrismaClient)();
  const redis = (0, import_shared6.createRedisClient)(env.REDIS_URL);
  const { redisReady } = await (0, import_shared6.ensureInfrastructureReady)({
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
    const persistedOllamaUrl = await (0, import_shared6.loadPersistedOllamaBaseUrl)(prisma, logger);
    if (persistedOllamaUrl) {
      env.OLLAMA_BASE_URL = persistedOllamaUrl;
    }
  }
  const queues = redisReady ? (0, import_shared6.createAppQueues)(env.REDIS_URL, env.JOB_QUEUE_PREFIX) : createNoopQueues(logger, env.JOB_QUEUE_PREFIX);
  const client = createDiscordClient();
  const analytics = new import_analytics2.AnalyticsQueryService(prisma);
  const summaryService = new import_memory2.SummaryService(prisma);
  const relationshipService = new import_memory2.RelationshipService(prisma);
  const retrievalService = new import_memory2.RetrievalService(prisma);
  const activeMemoryService = new import_memory2.ActiveMemoryService(retrievalService);
  const memoryAlbumService = new import_memory2.MemoryAlbumService(prisma);
  const interactionRequestService = new import_memory2.InteractionRequestService(prisma);
  const reflectionService = new import_memory2.ReflectionService(prisma);
  const profileService = new import_memory2.ProfileService(prisma, env);
  const runtimeConfig = new import_core2.RuntimeConfigService(prisma, env);
  const affinityService = new import_core2.AffinityService(prisma);
  const moodService = new import_core2.MoodService(prisma);
  const mediaReactionService = new import_core2.MediaReactionService(prisma);
  const replyQueueService = new import_core2.ReplyQueueService(prisma, env.REPLY_QUEUE_BUSY_TTL_SEC);
  const contextService = new import_memory2.ContextService(prisma, summaryService, profileService, relationshipService, retrievalService, activeMemoryService);
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
  const slashAdmin = new import_core2.SlashAdminService(
    prisma,
    analytics,
    relationshipService,
    retrievalService,
    summaryService,
    runtimeConfig,
    moodService,
    replyQueueService,
    memoryAlbumService,
    reflectionService
  );
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
    media: mediaReactionService,
    reflection: reflectionService
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
    memoryAlbum: memoryAlbumService,
    interactionRequests: interactionRequestService,
    reflection: reflectionService,
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
