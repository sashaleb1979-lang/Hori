"use strict";

// src/bootstrap.ts
var import_analytics2 = require("@hori/analytics");
var import_config = require("@hori/config");
var import_core = require("@hori/core");
var import_llm = require("@hori/llm");
var import_memory = require("@hori/memory");
var import_search = require("@hori/search");
var import_shared4 = require("@hori/shared");

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
      { name: "roast", value: "roast" }
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
  new import_discord2.SlashCommandBuilder().setName("bot-stats").setDescription("\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u043D\u0435\u0434\u0435\u043B\u044C\u043D\u0443\u044E \u0441\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043A\u0443")
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
      await interaction.reply({ content: "\u0422\u043E\u043B\u044C\u043A\u043E \u0432\u043D\u0443\u0442\u0440\u0438 \u0441\u0435\u0440\u0432\u0435\u0440\u0430.", ephemeral: true });
      return;
    }
    const isModerator = ensureModerator(interaction);
    if (!isModerator && interaction.commandName !== "bot-help") {
      await interaction.reply({ content: "\u042D\u0442\u043E \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u043C\u043E\u0434\u0435\u0440\u043E\u0432.", ephemeral: true });
      return;
    }
    switch (interaction.commandName) {
      case "bot-help":
        await interaction.reply({ content: await runtime.slashAdmin.handleHelp(), ephemeral: true });
        return;
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
          ephemeral: true
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
        await interaction.reply({ content, ephemeral: true });
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
          ephemeral: true
        });
        return;
      case "bot-feature":
        await interaction.reply({
          content: await runtime.slashAdmin.updateFeature(
            interaction.guildId,
            interaction.options.getString("key", true),
            interaction.options.getBoolean("enabled", true)
          ),
          ephemeral: true
        });
        return;
      case "bot-debug":
        await interaction.reply({
          content: await runtime.slashAdmin.debugTrace(interaction.options.getString("message-id", true)),
          ephemeral: true
        });
        return;
      case "bot-profile":
        await interaction.reply({
          content: await runtime.slashAdmin.profile(interaction.guildId, interaction.options.getUser("user", true).id),
          ephemeral: true
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
          ephemeral: true
        });
        return;
      case "bot-summary":
        await interaction.reply({
          content: await runtime.slashAdmin.summary(interaction.guildId, interaction.options.getChannel("channel", true).id),
          ephemeral: true
        });
        return;
      case "bot-stats":
        await interaction.reply({ content: await runtime.slashAdmin.stats(interaction.guildId), ephemeral: true });
        return;
      default:
        await interaction.reply({ content: "\u041D\u0435 \u0437\u043D\u0430\u044E \u0442\u0430\u043A\u0443\u044E \u043A\u043E\u043C\u0430\u043D\u0434\u0443.", ephemeral: true });
        return;
    }
  }
  if (!interaction.isMessageContextMenuCommand() || !interaction.guildId) {
    return;
  }
  const featureFlags = await runtime.runtimeConfig.getFeatureFlags(interaction.guildId);
  if (!featureFlags.contextActions) {
    await interaction.reply({ content: "\u041A\u043E\u043D\u0442\u0435\u043A\u0441\u0442\u043D\u044B\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044F \u0432\u044B\u043A\u043B\u044E\u0447\u0435\u043D\u044B.", ephemeral: true });
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
  await interaction.reply({ content: result, ephemeral: true });
}

// src/router/message-router.ts
var import_discord4 = require("discord.js");
var import_analytics = require("@hori/analytics");

// src/responders/message-responder.ts
var import_shared3 = require("@hori/shared");
async function sendReply(message, text) {
  const chunks = (0, import_shared3.splitLongMessage)(text);
  for (let index = 0; index < chunks.length; index += 1) {
    if (index === 0) {
      await message.reply(chunks[index]);
    } else if ("send" in message.channel) {
      await message.channel.send(chunks[index]);
    }
  }
}

// src/router/message-router.ts
async function detectTriggerSource(message, botName, botId) {
  const content = message.content.trim();
  if (message.mentions.has(botId)) {
    return "mention";
  }
  if (message.reference?.messageId) {
    try {
      const referenced = await message.fetchReference();
      if (referenced.author.id === botId) {
        return "reply";
      }
    } catch {
      return void 0;
    }
  }
  if (new RegExp(`^${botName}[,:!\\s-]*`, "i").test(content)) {
    return "name";
  }
  return void 0;
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
  const triggerSource = await detectTriggerSource(message, botName, runtime.client.user.id);
  const explicitInvocation = Boolean(triggerSource);
  const autoInterject = !explicitInvocation && routingConfig.featureFlags.autoInterject && routingConfig.channelPolicy.allowInterjections && !routingConfig.channelPolicy.isMuted && (!runtime.env.AUTOINTERJECT_CHANNEL_ALLOWLIST.length || runtime.env.AUTOINTERJECT_CHANNEL_ALLOWLIST.includes(message.channelId)) && await shouldAutoInterject(runtime, message);
  const member = message.member ?? await message.guild.members.fetch(message.author.id);
  const envelope = {
    messageId: message.id,
    guildId: message.guildId,
    channelId: message.channelId,
    userId: message.author.id,
    username: message.author.username,
    displayName: member.displayName,
    content: message.content,
    createdAt: message.createdAt,
    replyToMessageId: message.reference?.messageId ?? null,
    mentionCount: message.mentions.users.size,
    mentionedBot: message.mentions.has(runtime.client.user.id),
    mentionsBotByName: new RegExp(`\\b${botName}\\b`, "i").test(message.content),
    mentionedUserIds: [...message.mentions.users.keys()],
    triggerSource: triggerSource ?? (autoInterject ? "auto_interject" : void 0),
    isModerator: member.permissions.has(import_discord4.PermissionFlagsBits.ManageGuild),
    explicitInvocation
  };
  await runtime.ingestService.ingestMessage({
    ...envelope,
    guildName: message.guild.name,
    channelName: "name" in message.channel ? message.channel.name : void 0,
    isBotUser: false
  });
  (0, import_analytics.trackIngestedMessage)();
  await Promise.all([
    runtime.queues.summary.add("summary", { guildId: envelope.guildId, channelId: envelope.channelId }, { jobId: `summary:${envelope.guildId}:${envelope.channelId}` }),
    runtime.queues.profile.add("profile", { guildId: envelope.guildId, userId: envelope.userId }, { jobId: `profile:${envelope.guildId}:${envelope.userId}` }),
    message.content.length >= runtime.env.MESSAGE_EMBED_MIN_CHARS ? runtime.queues.embedding.add("embedding", { entityType: "message", entityId: envelope.messageId }, { jobId: `embedding:${envelope.messageId}` }) : Promise.resolve()
  ]);
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
  const result = await runtime.orchestrator.handleMessage(envelope, routingConfig);
  if (!result.reply) {
    return;
  }
  await sendReply(message, result.reply);
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
  runtime.client.once("ready", async () => {
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
        await interaction.reply({ content: "\u0427\u0442\u043E-\u0442\u043E \u0441\u043B\u043E\u043C\u0430\u043B\u043E\u0441\u044C.", ephemeral: true });
      }
    }
  });
}

// src/bootstrap.ts
async function bootstrapBot() {
  const env = (0, import_config.loadEnv)();
  (0, import_config.assertEnvForRole)(env, "bot");
  const logger = (0, import_shared4.createLogger)(env.LOG_LEVEL);
  const prisma = (0, import_shared4.createPrismaClient)();
  const redis = (0, import_shared4.createRedisClient)(env.REDIS_URL);
  await (0, import_shared4.ensureInfrastructureReady)({
    role: "bot",
    nodeEnv: env.NODE_ENV,
    databaseUrl: env.DATABASE_URL,
    redisUrl: env.REDIS_URL,
    prisma,
    redis,
    logger
  });
  const queues = (0, import_shared4.createAppQueues)(env.REDIS_URL, env.JOB_QUEUE_PREFIX);
  const client = createDiscordClient();
  const analytics = new import_analytics2.AnalyticsQueryService(prisma);
  const summaryService = new import_memory.SummaryService(prisma);
  const relationshipService = new import_memory.RelationshipService(prisma);
  const retrievalService = new import_memory.RetrievalService(prisma);
  const profileService = new import_memory.ProfileService(prisma, env);
  const runtimeConfig = new import_core.RuntimeConfigService(prisma, env);
  const contextService = new import_memory.ContextService(prisma, summaryService, profileService, relationshipService, retrievalService);
  const llmClient = new import_llm.OllamaClient(env, logger);
  const modelRouter = new import_llm.ModelRouter(env);
  const embeddingAdapter = new import_llm.EmbeddingAdapter(llmClient, env);
  const searchCache = new import_search.SearchCacheService(prisma, redis);
  const searchClient = new import_search.BraveSearchClient(env, logger, searchCache);
  const toolOrchestrator = new import_llm.ToolOrchestrator(llmClient, logger);
  const ingestService = new import_analytics2.MessageIngestService(prisma, logger);
  const slashAdmin = new import_core.SlashAdminService(prisma, analytics, relationshipService, retrievalService, summaryService);
  const orchestrator = (0, import_core.createChatOrchestrator)({
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
    runtimeConfig
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
    orchestrator
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
