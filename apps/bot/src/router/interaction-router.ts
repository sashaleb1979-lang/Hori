import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  ContextMenuCommandInteraction,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle
} from "discord.js";

import { CONTEXT_ACTIONS, asErrorMessage, parseCsv, persistOllamaBaseUrl, type PersonaMode } from "@hori/shared";
import { RelationshipService } from "@hori/memory";

import type { BotRuntime } from "../bootstrap";
import { getOwnerLockdownState, isBotOwner, setOwnerLockdownState, shouldIgnoreForOwnerLockdown } from "./owner-lockdown";

const PUBLIC_COMMANDS = new Set(["bot-help", "bot-album"]);
const OWNER_COMMANDS = new Set(["bot-ai-url", "bot-import", "bot-lockdown", "bot-power"]);
const MEMORY_ALBUM_MODAL_PREFIX = "memory-album";
const POWER_PANEL_PREFIX = "power-panel";
const POWER_PROFILES = ["economy", "balanced", "expanded", "max"] as const;

function ensureModerator(interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction | ModalSubmitInteraction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
}

export async function routeInteraction(
  runtime: BotRuntime,
  interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction | ModalSubmitInteraction | ButtonInteraction
) {
  const isOwner = isBotOwner(runtime, interaction.user.id);

  if (!isOwner && (await shouldIgnoreForOwnerLockdown(runtime, interaction.user.id))) {
    return;
  }

  if (interaction.isButton()) {
    await routeButtonInteraction(runtime, interaction, isOwner);
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
      await interaction.reply({ content: "Только внутри сервера.", flags: MessageFlags.Ephemeral });
      return;
    }

    const isModerator = ensureModerator(interaction);

    if (!isModerator && !PUBLIC_COMMANDS.has(interaction.commandName) && !(isOwner && OWNER_COMMANDS.has(interaction.commandName))) {
      await interaction.reply({ content: "Это только для модеров.", flags: MessageFlags.Ephemeral });
      return;
    }

    switch (interaction.commandName) {
      case "bot-help":
        await interaction.reply({ content: await runtime.slashAdmin.handleHelp(), flags: MessageFlags.Ephemeral });
        return;
      case "bot-ai-url": {
        const isOwner = runtime.env.DISCORD_OWNER_IDS.includes(interaction.user.id);

        if (!isOwner) {
          await interaction.reply({ content: "Эта команда только для владельца бота.", flags: MessageFlags.Ephemeral });
          return;
        }

        const newUrl = interaction.options.getString("url", true).trim();

        try {
          new URL(newUrl);
        } catch {
          await interaction.reply({ content: `Невалидный URL: ${newUrl}`, flags: MessageFlags.Ephemeral });
          return;
        }

        const oldUrl = runtime.env.OLLAMA_BASE_URL ?? "(не задан)";
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        let status = "⏳ проверяю...";
        let appliedUrl = oldUrl;
        try {
          const probe = await fetch(new URL("/api/tags", newUrl), { signal: AbortSignal.timeout(5000) });
          if (probe.ok) {
            const data = (await probe.json()) as { models?: { name: string }[] };
            const models = data.models?.map((m) => m.name).join(", ") ?? "?";
            runtime.env.OLLAMA_BASE_URL = newUrl;
            appliedUrl = newUrl;
            status = `✅ Ollama доступен (модели: ${models})`;

            try {
              await persistOllamaBaseUrl(runtime.prisma, newUrl, interaction.user.id);
              status += "\n💾 URL сохранён и переживёт рестарт.";
            } catch (error) {
              runtime.logger.warn({ error: asErrorMessage(error), url: newUrl }, "failed to persist ollama url");
              status += "\n⚠️ URL применён только в памяти процесса. После рестарта понадобится задать его снова.";
            }
          } else {
            status = `❌ URL не применён: Ollama вернул ${probe.status}`;
          }
        } catch (err) {
          status = `❌ URL не применён: ${err instanceof Error ? err.message : "unknown"}`;
        }

        await interaction.editReply({
          content: `AI URL ${appliedUrl === newUrl ? "обновлён" : "не изменён"}\nТекущий: \`${appliedUrl}\`\nПроверяли: \`${newUrl}\`\n\n${status}`
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
            replyLength: interaction.options.getString("reply-length") as "short" | "medium" | "long" | null,
            preferredStyle: interaction.options.getString("preferred-style"),
            forbiddenWords: interaction.options.getString("forbidden-words"),
            forbiddenTopics: interaction.options.getString("forbidden-topics")
          }),
          flags: MessageFlags.Ephemeral
        });
        return;
      case "bot-memory": {
        const subcommand = interaction.options.getSubcommand();
        const key = interaction.options.getString("key", true);

        const content =
          subcommand === "remember"
            ? await runtime.slashAdmin.remember(
                interaction.guildId,
                interaction.user.id,
                key,
                interaction.options.getString("value", true)
              )
            : await runtime.slashAdmin.forget(interaction.guildId, key);

        await interaction.reply({ content, flags: MessageFlags.Ephemeral });
        return;
      }
      case "bot-album": {
        const featureFlags = await runtime.runtimeConfig.getFeatureFlags(interaction.guildId);

        if (!featureFlags.memoryAlbumEnabled) {
          await interaction.reply({ content: "Memory Album сейчас выключен.", flags: MessageFlags.Ephemeral });
          return;
        }

        const content =
          interaction.options.getSubcommand() === "remove"
            ? await runtime.slashAdmin.albumRemove(
                interaction.guildId,
                interaction.user.id,
                interaction.options.getString("id", true)
              )
            : await runtime.slashAdmin.albumList(
                interaction.guildId,
                interaction.user.id,
                interaction.options.getInteger("limit") ?? 8
              );

        await interaction.reply({ content, flags: MessageFlags.Ephemeral });
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
              protectedTopics: (interaction.options.getString("protected-topics") ?? "")
                .split(",")
                .map((part) => part.trim())
                .filter(Boolean)
            }
          ),
          flags: MessageFlags.Ephemeral
        });
        return;
      case "bot-feature":
        await interaction.reply({
          content: await runtime.slashAdmin.updateFeature(
            interaction.guildId,
            interaction.options.getString("key", true),
            interaction.options.getBoolean("enabled", true)
          ),
          flags: MessageFlags.Ephemeral
        });
        return;
      case "bot-power": {
        if (!isOwner) {
          await interaction.reply({ content: "Эта команда только для владельца бота.", flags: MessageFlags.Ephemeral });
          return;
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === "panel") {
          const status = await runtime.runtimeConfig.getPowerProfileStatus();
          await interaction.reply({
            content: await runtime.slashAdmin.powerPanel(),
            components: buildPowerPanelRows(status.activeProfile),
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        const content =
          subcommand === "apply"
            ? await runtime.slashAdmin.powerApply(
                interaction.options.getString("profile", true) as (typeof POWER_PROFILES)[number],
                interaction.user.id
              )
            : await runtime.slashAdmin.powerStatus();

        await interaction.reply({ content, flags: MessageFlags.Ephemeral });
        return;
      }
      case "bot-debug":
        await interaction.reply({
          content: await runtime.slashAdmin.debugTrace(interaction.options.getString("message-id", true)),
          flags: MessageFlags.Ephemeral
        });
        return;
      case "bot-profile":
        await interaction.reply({
          content: await runtime.slashAdmin.profile(interaction.guildId, interaction.options.getUser("user", true).id),
          flags: MessageFlags.Ephemeral
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
          flags: MessageFlags.Ephemeral
        });
        return;
      case "bot-summary":
        await interaction.reply({
          content: await runtime.slashAdmin.summary(interaction.guildId, interaction.options.getChannel("channel", true).id),
          flags: MessageFlags.Ephemeral
        });
        return;
      case "bot-stats":
        await interaction.reply({ content: await runtime.slashAdmin.stats(interaction.guildId), flags: MessageFlags.Ephemeral });
        return;
      case "bot-topic": {
        const channelId = interaction.options.getChannel("channel")?.id ?? interaction.channelId;
        const content =
          interaction.options.getSubcommand() === "reset"
            ? await runtime.slashAdmin.topicReset(interaction.guildId, channelId)
            : await runtime.slashAdmin.topicStatus(interaction.guildId, channelId);
        await interaction.reply({ content, flags: MessageFlags.Ephemeral });
        return;
      }
      case "bot-mood": {
        const subcommand = interaction.options.getSubcommand();
        const content =
          subcommand === "set"
            ? await runtime.slashAdmin.moodSet(
                interaction.guildId,
                interaction.options.getString("mode", true) as PersonaMode,
                interaction.options.getInteger("minutes") ?? 60,
                interaction.options.getString("reason")
              )
            : subcommand === "clear"
              ? await runtime.slashAdmin.moodClear(interaction.guildId)
              : await runtime.slashAdmin.moodStatus(interaction.guildId);
        await interaction.reply({ content, flags: MessageFlags.Ephemeral });
        return;
      }
      case "bot-queue": {
        const channelId = interaction.options.getChannel("channel")?.id ?? null;
        const content =
          interaction.options.getSubcommand() === "clear"
            ? await runtime.slashAdmin.queueClear(interaction.guildId, channelId)
            : await runtime.slashAdmin.queueStatus(interaction.guildId, channelId);
        await interaction.reply({ content, flags: MessageFlags.Ephemeral });
        return;
      }
      case "bot-reflection": {
        const content =
          interaction.options.getSubcommand() === "list"
            ? await runtime.slashAdmin.reflectionList(interaction.guildId, interaction.options.getInteger("limit") ?? 8)
            : await runtime.slashAdmin.reflectionStatus(interaction.guildId);
        await interaction.reply({ content, flags: MessageFlags.Ephemeral });
        return;
      }
      case "bot-media": {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === "sync-pack" && !isOwner) {
          await interaction.reply({ content: "Синхронизация pack доступна только владельцу бота.", flags: MessageFlags.Ephemeral });
          return;
        }

        const content =
          subcommand === "add"
            ? await runtime.slashAdmin.mediaAdd({
                mediaId: interaction.options.getString("id", true),
                type: interaction.options.getString("type", true),
                filePath: interaction.options.getString("path", true),
                triggerTags: interaction.options.getString("trigger-tags"),
                toneTags: interaction.options.getString("tone-tags"),
                allowedChannels: interaction.options.getString("channels"),
                allowedMoods: interaction.options.getString("moods"),
                nsfw: interaction.options.getBoolean("nsfw")
              })
            : subcommand === "sync-pack"
              ? await runtime.slashAdmin.mediaSyncPack(interaction.options.getString("path") ?? "assets/memes/catalog.json")
            : subcommand === "disable"
              ? await runtime.slashAdmin.mediaDisable(interaction.options.getString("id", true))
              : await runtime.slashAdmin.mediaList();
        await interaction.reply({ content, flags: MessageFlags.Ephemeral });
        return;
      }
      case "bot-import": {
        const isOwner = runtime.env.DISCORD_OWNER_IDS.includes(interaction.user.id);
        if (!isOwner) {
          await interaction.reply({ content: "Импорт доступен только владельцу бота.", flags: MessageFlags.Ephemeral });
          return;
        }

        const attachment = interaction.options.getAttachment("file", true);
        if (!attachment.name.endsWith(".json")) {
          await interaction.reply({ content: "Нужен .json файл.", flags: MessageFlags.Ephemeral });
          return;
        }

        if (attachment.size > 50 * 1024 * 1024) {
          await interaction.reply({ content: "Файл слишком большой (макс 50 МБ).", flags: MessageFlags.Ephemeral });
          return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
          const response = await fetch(attachment.url);
          if (!response.ok) {
            await interaction.editReply({ content: `Не удалось скачать файл: ${response.status}` });
            return;
          }

          const data = (await response.json()) as {
            guildId?: string;
            messages?: { userId: string; username?: string; content: string; timestamp: string; channelId?: string; replyToId?: string }[];
          };

          const guildId = data.guildId ?? interaction.guildId;
          const messages = data.messages;

          if (!Array.isArray(messages) || messages.length === 0) {
            await interaction.editReply({ content: "Файл пуст или не содержит массив messages." });
            return;
          }

          if (messages.length > 50000) {
            await interaction.editReply({ content: "Максимум 50 000 сообщений за раз." });
            return;
          }

          await runtime.prisma.guild.upsert({
            where: { id: guildId! },
            update: {},
            create: { id: guildId! },
          });

          let imported = 0;
          let skipped = 0;
          let errors = 0;
          const seenUsers = new Set<string>();
          const userMsgCounts = new Map<string, number>();

          for (const entry of messages) {
            if (!entry.userId || !entry.content || !entry.timestamp) { skipped++; continue; }
            const createdAt = new Date(entry.timestamp);
            if (isNaN(createdAt.getTime())) { skipped++; continue; }
            const messageId = `import:${guildId}:${entry.userId}:${createdAt.getTime()}`;
            try {
              const exists = await runtime.prisma.message.findUnique({ where: { id: messageId }, select: { id: true } });
              if (exists) { skipped++; continue; }
              await runtime.prisma.user.upsert({
                where: { id: entry.userId },
                update: { username: entry.username ?? undefined },
                create: { id: entry.userId, username: entry.username ?? null },
              });
              await runtime.prisma.message.create({
                data: {
                  id: messageId, guildId: guildId!, channelId: entry.channelId ?? "imported",
                  userId: entry.userId, content: entry.content, createdAt,
                  charCount: entry.content.length, tokenEstimate: Math.ceil(entry.content.length / 4),
                  mentionCount: 0, replyToMessageId: entry.replyToId ? `import:${guildId}:${entry.replyToId}` : undefined,
                },
              });
              seenUsers.add(entry.userId);
              userMsgCounts.set(entry.userId, (userMsgCounts.get(entry.userId) ?? 0) + 1);
              imported++;
            } catch { errors++; }
          }

          let seeded = 0;
          if (userMsgCounts.size > 0) {
            try {
              const relService = new RelationshipService(runtime.prisma);
              seeded = await relService.seedFromImportedHistory(guildId!, userMsgCounts);
            } catch { /* non-critical */ }
          }

          await interaction.editReply({
            content: `✅ Импорт завершён\n📥 Импортировано: ${imported}\n⏭️ Пропущено: ${skipped}\n❌ Ошибок: ${errors}\n👤 Пользователей: ${seenUsers.size}\n🤝 Профилей отношений создано: ${seeded}`,
          });
        } catch (err) {
          await interaction.editReply({ content: `❌ Ошибка импорта: ${err instanceof Error ? err.message : "unknown"}` });
        }
        return;
      }
      default:
        await interaction.reply({ content: "Не знаю такую команду.", flags: MessageFlags.Ephemeral });
        return;
    }
  }

  if (!interaction.isMessageContextMenuCommand() || !interaction.guildId) {
    return;
  }

  const featureFlags = await runtime.runtimeConfig.getFeatureFlags(interaction.guildId);

  if (interaction.commandName === CONTEXT_ACTIONS.rememberMoment) {
    await handleRememberMomentContext(runtime, interaction, featureFlags);
    return;
  }

  if (!featureFlags.contextActions) {
    await interaction.reply({ content: "Контекстные действия выключены.", flags: MessageFlags.Ephemeral });
    return;
  }

  const action =
    interaction.commandName === CONTEXT_ACTIONS.explain
      ? "explain"
      : interaction.commandName === CONTEXT_ACTIONS.summarize
        ? "summarize"
        : "tone";

  const result = await runtime.orchestrator.handleContextAction({
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    requesterId: interaction.user.id,
    requesterIsModerator: ensureModerator(interaction),
    action,
    sourceMessageId: interaction.targetId
  });

  await interaction.reply({ content: result, flags: MessageFlags.Ephemeral });
}

async function handleOwnerLockdownCommand(
  runtime: BotRuntime,
  interaction: ChatInputCommandInteraction,
  isOwner: boolean
) {
  if (!isOwner) {
    await interaction.reply({ content: "Эта команда только для владельца бота.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (!runtime.env.DISCORD_OWNER_IDS.length) {
    await interaction.reply({ content: "Сначала укажи Discord user ID владельца в BOT_OWNERS.", flags: MessageFlags.Ephemeral });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "status") {
    const state = await getOwnerLockdownState(runtime, true);
    await interaction.reply({
      content: `Owner lockdown: ${state.enabled ? "on" : "off"}${state.updatedBy ? `\nПоследнее изменение: ${state.updatedBy}` : ""}`,
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const enabled = subcommand === "on";
  await setOwnerLockdownState(runtime, enabled, interaction.user.id);
  const cleared = enabled ? await runtime.replyQueue.clearAll() : { count: 0 };

  await interaction.reply({
    content: enabled
      ? `Локдаун включён. Теперь Хори молча игнорирует всех, кроме владельца. Очередь ответов сброшена: ${cleared.count}.`
      : "Локдаун выключен. Хори снова слушает обычные правила сервера.",
    flags: MessageFlags.Ephemeral
  });
}

async function handleRememberMomentContext(
  runtime: BotRuntime,
  interaction: ContextMenuCommandInteraction,
  featureFlags: Awaited<ReturnType<BotRuntime["runtimeConfig"]["getFeatureFlags"]>>
) {
  if (!interaction.guildId) {
    await interaction.reply({ content: "Только внутри сервера.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (!featureFlags.memoryAlbumEnabled) {
    await interaction.reply({ content: "Memory Album сейчас выключен.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (!featureFlags.interactionRequestsEnabled) {
    await interaction.reply({ content: "Interaction Requests сейчас выключены.", flags: MessageFlags.Ephemeral });
    return;
  }

  const request = await runtime.interactionRequests.create({
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    messageId: interaction.targetId,
    userId: interaction.user.id,
    requestType: "dialogue",
    title: "Запомнить момент",
    prompt: "Добавь короткую заметку и теги для Memory Album.",
    category: "memory_album",
    expectedAnswerType: "note_tags",
    metadataJson: { targetMessageId: interaction.targetId },
    expiresAt: new Date(Date.now() + 15 * 60 * 1000)
  });

  const modal = new ModalBuilder()
    .setCustomId(buildMemoryAlbumModalId(request.id, interaction.targetId))
    .setTitle("Запомнить момент");
  const noteInput = new TextInputBuilder()
    .setCustomId("note")
    .setLabel("Заметка")
    .setPlaceholder("Почему этот момент стоит сохранить? Можно оставить пустым.")
    .setRequired(false)
    .setMaxLength(500)
    .setStyle(TextInputStyle.Paragraph);
  const tagsInput = new TextInputBuilder()
    .setCustomId("tags")
    .setLabel("Теги через запятую")
    .setPlaceholder("шутка, идея, договорённость")
    .setRequired(false)
    .setMaxLength(120)
    .setStyle(TextInputStyle.Short);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(noteInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(tagsInput)
  );

  await interaction.showModal(modal);
}

async function routeModalSubmit(runtime: BotRuntime, interaction: ModalSubmitInteraction) {
  const parsed = parseMemoryAlbumModalId(interaction.customId);

  if (!parsed) {
    return;
  }

  if (!interaction.guildId) {
    await interaction.reply({ content: "Только внутри сервера.", flags: MessageFlags.Ephemeral });
    return;
  }

  const featureFlags = await runtime.runtimeConfig.getFeatureFlags(interaction.guildId);

  if (!featureFlags.memoryAlbumEnabled) {
    await interaction.reply({ content: "Memory Album сейчас выключен.", flags: MessageFlags.Ephemeral });
    return;
  }

  const request = await runtime.interactionRequests.getPending(parsed.requestId);

  if (!request || request.userId !== interaction.user.id) {
    await interaction.reply({ content: "Этот запрос уже устарел или не твой.", flags: MessageFlags.Ephemeral });
    return;
  }

  const note = interaction.fields.getTextInputValue("note").trim();
  const tags = parseCsv(interaction.fields.getTextInputValue("tags"));
  const source = await fetchSourceMessageForAlbum(runtime, interaction, parsed.messageId);

  if (!source.content.trim()) {
    await runtime.interactionRequests.cancel(request.id, interaction.user.id, "source message is empty");
    await interaction.reply({ content: "Не стала сохранять: у сообщения нет текста.", flags: MessageFlags.Ephemeral });
    return;
  }

  await runtime.prisma.guild.upsert({
    where: { id: interaction.guildId },
    update: { name: interaction.guild?.name ?? undefined },
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
    content: `Запомнила момент в альбом. ID: ${entry.id}${tags.length ? `\nТеги: ${tags.join(", ")}` : ""}`,
    flags: MessageFlags.Ephemeral
  });
}

async function routeButtonInteraction(runtime: BotRuntime, interaction: ButtonInteraction, isOwner: boolean) {
  if (!interaction.customId.startsWith(`${POWER_PANEL_PREFIX}:`)) {
    return;
  }

  if (!isOwner) {
    await interaction.reply({ content: "Эта панель только для владельца бота.", flags: MessageFlags.Ephemeral });
    return;
  }

  const [, action, profile] = interaction.customId.split(":");

  if (action !== "apply" || !isPowerProfile(profile)) {
    await interaction.reply({ content: "Неизвестная кнопка панели мощности.", flags: MessageFlags.Ephemeral });
    return;
  }

  const content = await runtime.slashAdmin.powerApply(profile, interaction.user.id);
  const status = await runtime.runtimeConfig.getPowerProfileStatus();

  await interaction.update({
    content,
    components: buildPowerPanelRows(status.activeProfile)
  });
}

async function fetchSourceMessageForAlbum(
  runtime: BotRuntime,
  interaction: ModalSubmitInteraction,
  messageId: string
): Promise<{ content: string; authorUserId?: string | null; sourceUrl?: string | null }> {
  if (interaction.channel && "messages" in interaction.channel) {
    try {
      const sourceMessage = await interaction.channel.messages.fetch(messageId);
      return {
        content: sourceMessage.content,
        authorUserId: sourceMessage.author.id,
        sourceUrl: sourceMessage.url
      };
    } catch {
      // Fall through to the ingested message table.
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

function buildMemoryAlbumModalId(requestId: string, messageId: string) {
  return `${MEMORY_ALBUM_MODAL_PREFIX}:${requestId}:${messageId}`;
}

function parseMemoryAlbumModalId(customId: string) {
  const [prefix, requestId, messageId] = customId.split(":");

  if (prefix !== MEMORY_ALBUM_MODAL_PREFIX || !requestId || !messageId) {
    return null;
  }

  return { requestId, messageId };
}

function buildPowerPanelRows(activeProfile: (typeof POWER_PROFILES)[number]) {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      ...POWER_PROFILES.map((profile) =>
        new ButtonBuilder()
          .setCustomId(`${POWER_PANEL_PREFIX}:apply:${profile}`)
          .setLabel(profile)
          .setStyle(profile === activeProfile ? ButtonStyle.Primary : ButtonStyle.Secondary)
      )
    )
  ];
}

function isPowerProfile(value: string): value is (typeof POWER_PROFILES)[number] {
  return POWER_PROFILES.includes(value as (typeof POWER_PROFILES)[number]);
}
