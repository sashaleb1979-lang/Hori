import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  ContextMenuCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  TextInputBuilder,
  TextInputStyle
} from "discord.js";

import { CONTEXT_ACTIONS, asErrorMessage, parseCsv, persistOllamaBaseUrl, type MemoryFormationJobPayload, type MessageEnvelope, type PersonaMode } from "@hori/shared";
import { RelationshipService } from "@hori/memory";

import type { BotRuntime } from "../bootstrap";
import { getOwnerLockdownState, isBotOwner, setOwnerLockdownState, shouldIgnoreForOwnerLockdown } from "./owner-lockdown";
import { BotStateService, HORI_STATE_TABS, horiStateTabLabel, parseHoriStateTab, type HoriStateTab } from "../services/bot-state-service";

const PUBLIC_COMMANDS = new Set(["hori", "bot-help", "bot-album"]);
const OWNER_COMMANDS = new Set(["bot-ai-url", "bot-import", "bot-lockdown", "bot-power"]);
const MEMORY_ALBUM_MODAL_PREFIX = "memory-album";
const HORI_MODAL_PREFIX = "hori-modal";
const HORI_PANEL_PREFIX = "hori-panel";
const HORI_ACTION_PREFIX = "hori-action";
const HORI_STATE_PANEL_PREFIX = "hori-state";
const POWER_PANEL_PREFIX = "power-panel";
const POWER_PROFILES = ["economy", "balanced", "expanded", "max"] as const;
const HORI_PANEL_TABS = ["main", "owner", "style", "liveliness", "memory", "people", "channels", "search", "experiments", "diagnostics"] as const;
type HoriPanelTab = (typeof HORI_PANEL_TABS)[number];

function ensureModerator(interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction | ModalSubmitInteraction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
}

export async function routeInteraction(
  runtime: BotRuntime,
  interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction | ModalSubmitInteraction | ButtonInteraction | StringSelectMenuInteraction
) {
  const isOwner = isBotOwner(runtime, interaction.user.id);

  if (!isOwner && (await shouldIgnoreForOwnerLockdown(runtime, interaction.user.id))) {
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
      await interaction.reply({ content: "Только внутри сервера.", flags: MessageFlags.Ephemeral });
      return;
    }

    const isModerator = ensureModerator(interaction);

    if (!isModerator && !PUBLIC_COMMANDS.has(interaction.commandName) && !(isOwner && OWNER_COMMANDS.has(interaction.commandName))) {
      await interaction.reply({ content: "Это только для модеров.", flags: MessageFlags.Ephemeral });
      return;
    }

    switch (interaction.commandName) {
      case "hori":
        await handleHoriCommand(runtime, interaction, isOwner, isModerator);
        return;
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
              toneBias: interaction.options.getString("tone-bias") ?? undefined,
              roastLevel: interaction.options.getInteger("roast-level") ?? undefined,
              praiseBias: interaction.options.getInteger("praise-bias") ?? undefined,
              interruptPriority: interaction.options.getInteger("interrupt-priority") ?? undefined,
              doNotMock: interaction.options.getBoolean("do-not-mock") ?? undefined,
              doNotInitiate: interaction.options.getBoolean("do-not-initiate") ?? undefined,
              protectedTopics: interaction.options.getString("protected-topics")
                ? parseCsv(interaction.options.getString("protected-topics") ?? undefined)
                : undefined,
              closeness: interaction.options.getNumber("closeness") ?? undefined,
              trustLevel: interaction.options.getNumber("trust") ?? undefined,
              familiarity: interaction.options.getNumber("familiarity") ?? undefined,
              proactivityPreference: interaction.options.getNumber("proactivity") ?? undefined
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
            ...buildPowerPanelResponse(await runtime.slashAdmin.powerPanel(), status.activeProfile),
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

async function handleHoriCommand(
  runtime: BotRuntime,
  interaction: ChatInputCommandInteraction,
  isOwner: boolean,
  isModerator: boolean
) {
  if (!interaction.guildId) {
    await interaction.reply({ content: "Только внутри сервера.", flags: MessageFlags.Ephemeral });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "panel") {
    const tab = parseHoriPanelTab(interaction.options.getString("tab")) ?? "main";
    await interaction.reply({
      ...buildHoriPanelResponse(tab, isOwner, isModerator),
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (subcommand === "state") {
    if (!isOwner) {
      await interaction.reply({ content: "Панель состояния только для владельца.", flags: MessageFlags.Ephemeral });
      return;
    }

    const tab = parseHoriStateTab(interaction.options.getString("tab")) ?? "persona";
    await interaction.reply({
      ...(await buildHoriStatePanelResponse(runtime, tab, interaction.guildId, interaction.channelId)),
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (subcommand === "search") {
    await handleHoriSearchCommand(runtime, interaction, isModerator);
    return;
  }

  if (subcommand === "memory-build") {
    const scope = interaction.options.getString("scope", true) as MemoryFormationJobPayload["scope"];
    const depth = (interaction.options.getString("depth") ?? "recent") as MemoryFormationJobPayload["depth"];

    if (!isOwner && (!isModerator || scope === "server")) {
      await interaction.reply({
        content: scope === "server" ? "Сборка памяти по всему серверу только для владельца." : "Memory-build только для модеров.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await interaction.reply({
      content: await startMemoryBuildRun(runtime, interaction.guildId, scope === "channel" ? interaction.channelId : null, scope, depth, interaction.user.id),
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (subcommand === "profile") {
    const target = interaction.options.getUser("user")?.id ?? interaction.user.id;
    if (target !== interaction.user.id && !isOwner && !isModerator) {
      await interaction.reply({ content: "Чужой профиль видит только модер/владелец.", flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.reply({
      content: await runtime.slashAdmin.personalMemory(interaction.guildId, target, isOwner || isModerator),
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (subcommand === "relationship") {
    if (!isOwner) {
      await interaction.reply({ content: "Relationship-цифры только для владельца.", flags: MessageFlags.Ephemeral });
      return;
    }

    const targetUserId = interaction.options.getUser("user", true).id;
    const hasUpdate =
      interaction.options.getString("tone-bias") !== null ||
      interaction.options.getInteger("roast-level") !== null ||
      interaction.options.getInteger("praise-bias") !== null ||
      interaction.options.getInteger("interrupt-priority") !== null ||
      interaction.options.getBoolean("do-not-mock") !== null ||
      interaction.options.getBoolean("do-not-initiate") !== null ||
      interaction.options.getString("protected-topics") !== null ||
      interaction.options.getNumber("closeness") !== null ||
      interaction.options.getNumber("trust") !== null ||
      interaction.options.getNumber("familiarity") !== null ||
      interaction.options.getNumber("proactivity") !== null;

    const content = hasUpdate
      ? [
          await runtime.slashAdmin.updateRelationship(interaction.guildId, targetUserId, interaction.user.id, {
            toneBias: interaction.options.getString("tone-bias") ?? undefined,
            roastLevel: interaction.options.getInteger("roast-level") ?? undefined,
            praiseBias: interaction.options.getInteger("praise-bias") ?? undefined,
            interruptPriority: interaction.options.getInteger("interrupt-priority") ?? undefined,
            doNotMock: interaction.options.getBoolean("do-not-mock") ?? undefined,
            doNotInitiate: interaction.options.getBoolean("do-not-initiate") ?? undefined,
            protectedTopics: interaction.options.getString("protected-topics")
              ? parseCsv(interaction.options.getString("protected-topics") ?? undefined)
              : undefined,
            closeness: interaction.options.getNumber("closeness") ?? undefined,
            trustLevel: interaction.options.getNumber("trust") ?? undefined,
            familiarity: interaction.options.getNumber("familiarity") ?? undefined,
            proactivityPreference: interaction.options.getNumber("proactivity") ?? undefined
          }),
          "",
          await runtime.slashAdmin.relationshipDetails(interaction.guildId, targetUserId)
        ].join("\n")
      : await runtime.slashAdmin.relationshipDetails(interaction.guildId, targetUserId);

    await interaction.reply({
      content,
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (subcommand === "memory") {
    if (!isOwner && !isModerator) {
      await interaction.reply({ content: "Память сервера через `/hori memory` только для модеров.", flags: MessageFlags.Ephemeral });
      return;
    }

    const action = interaction.options.getString("action", true);
    const key = interaction.options.getString("key", true);
    const content = action === "remember"
      ? await runtime.slashAdmin.remember(interaction.guildId, interaction.user.id, key, interaction.options.getString("value") ?? "")
      : await runtime.slashAdmin.forget(interaction.guildId, key);
    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    return;
  }

  if (subcommand === "channel") {
    if (!isOwner && !isModerator) {
      await interaction.reply({ content: "Настройки канала только для модеров.", flags: MessageFlags.Ephemeral });
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
          topicInterestTags: interaction.options.getString("topic-interest-tags")
        }
      ),
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (subcommand === "summary") {
    if (!isOwner && !isModerator) {
      await interaction.reply({ content: "Сводки канала только для модеров.", flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.reply({
      content: await runtime.slashAdmin.summary(interaction.guildId, interaction.options.getChannel("channel")?.id ?? interaction.channelId),
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (subcommand === "stats") {
    if (!isOwner && !isModerator) {
      await interaction.reply({ content: "Статистика только для модеров.", flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.reply({ content: await runtime.slashAdmin.stats(interaction.guildId), flags: MessageFlags.Ephemeral });
    return;
  }

  if (subcommand === "topic") {
    if (!isOwner && !isModerator) {
      await interaction.reply({ content: "Темы канала только для модеров.", flags: MessageFlags.Ephemeral });
      return;
    }

    const channelId = interaction.options.getChannel("channel")?.id ?? interaction.channelId;
    const content = interaction.options.getString("action", true) === "reset"
      ? await runtime.slashAdmin.topicReset(interaction.guildId, channelId)
      : await runtime.slashAdmin.topicStatus(interaction.guildId, channelId);
    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    return;
  }

  if (subcommand === "mood") {
    if (!isOwner && !isModerator) {
      await interaction.reply({ content: "Mood только для модеров.", flags: MessageFlags.Ephemeral });
      return;
    }

    const action = interaction.options.getString("action", true);
    const content = action === "set"
      ? await runtime.slashAdmin.moodSet(
          interaction.guildId,
          (interaction.options.getString("mode") ?? "normal") as PersonaMode,
          interaction.options.getInteger("minutes") ?? 60,
          interaction.options.getString("reason")
        )
      : action === "clear"
        ? await runtime.slashAdmin.moodClear(interaction.guildId)
        : await runtime.slashAdmin.moodStatus(interaction.guildId);
    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    return;
  }

  if (subcommand === "queue") {
    if (!isOwner && !isModerator) {
      await interaction.reply({ content: "Очередь только для модеров.", flags: MessageFlags.Ephemeral });
      return;
    }

    const channelId = interaction.options.getChannel("channel")?.id ?? null;
    const content = interaction.options.getString("action", true) === "clear"
      ? await runtime.slashAdmin.queueClear(interaction.guildId, channelId)
      : await runtime.slashAdmin.queueStatus(interaction.guildId, channelId);
    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    return;
  }

  if (subcommand === "album") {
    const featureFlags = await runtime.runtimeConfig.getFeatureFlags(interaction.guildId);
    if (!featureFlags.memoryAlbumEnabled) {
      await interaction.reply({ content: "Memory Album сейчас выключен.", flags: MessageFlags.Ephemeral });
      return;
    }

    const action = interaction.options.getString("action", true);
    const content = action === "remove"
      ? await runtime.slashAdmin.albumRemove(interaction.guildId, interaction.user.id, interaction.options.getString("id") ?? "")
      : await runtime.slashAdmin.albumList(interaction.guildId, interaction.user.id, interaction.options.getInteger("limit") ?? 8);
    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    return;
  }

  if (subcommand === "debug") {
    if (!isOwner && !isModerator) {
      await interaction.reply({ content: "Debug trace только для модеров.", flags: MessageFlags.Ephemeral });
      return;
    }

    const messageId = interaction.options.getString("message-id");
    await interaction.reply({
      content: messageId ? await runtime.slashAdmin.debugTrace(messageId) : await buildLatestDebugTrace(runtime, interaction.guildId),
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (subcommand === "feature") {
    if (!isOwner && !isModerator) {
      await interaction.reply({ content: "Feature flags только для модеров.", flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.reply({
      content: await runtime.slashAdmin.updateFeature(
        interaction.guildId,
        interaction.options.getString("key", true),
        interaction.options.getBoolean("enabled", true)
      ),
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (subcommand === "media") {
    if (!isOwner && !isModerator) {
      await interaction.reply({ content: "Media registry только для модеров.", flags: MessageFlags.Ephemeral });
      return;
    }

    const action = interaction.options.getString("action", true);
    if (action === "sync-pack" && !isOwner) {
      await interaction.reply({ content: "Синхронизация pack доступна только владельцу.", flags: MessageFlags.Ephemeral });
      return;
    }

    const content = action === "add"
      ? await runtime.slashAdmin.mediaAdd({
          mediaId: interaction.options.getString("id") ?? "",
          type: interaction.options.getString("type") ?? "image",
          filePath: interaction.options.getString("path") ?? "",
          triggerTags: interaction.options.getString("trigger-tags"),
          toneTags: interaction.options.getString("tone-tags"),
          allowedChannels: interaction.options.getString("channels"),
          allowedMoods: interaction.options.getString("moods"),
          nsfw: interaction.options.getBoolean("nsfw")
        })
      : action === "sync-pack"
        ? await runtime.slashAdmin.mediaSyncPack(interaction.options.getString("path") ?? "assets/memes/catalog.json")
      : action === "disable"
        ? await runtime.slashAdmin.mediaDisable(interaction.options.getString("id") ?? "")
        : await runtime.slashAdmin.mediaList();
    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    return;
  }

  if (subcommand === "power") {
    if (!isOwner) {
      await interaction.reply({ content: "Power только для владельца.", flags: MessageFlags.Ephemeral });
      return;
    }

    const action = interaction.options.getString("action", true);
    if (action === "panel") {
      const status = await runtime.runtimeConfig.getPowerProfileStatus();
      await interaction.reply({
        ...buildPowerPanelResponse(await runtime.slashAdmin.powerPanel(), status.activeProfile),
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const content = action === "apply"
      ? await runtime.slashAdmin.powerApply((interaction.options.getString("profile") ?? "balanced") as (typeof POWER_PROFILES)[number], interaction.user.id)
      : await runtime.slashAdmin.powerStatus();
    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
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

  await interaction.reply({ content: "Не знаю такую ветку `/hori`.", flags: MessageFlags.Ephemeral });
}

async function handleHoriSearchCommand(
  runtime: BotRuntime,
  interaction: ChatInputCommandInteraction,
  isModerator: boolean
) {
  if (!interaction.guildId) {
    await interaction.reply({ content: "Только внутри сервера.", flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
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
    content: reply?.trim() || "Поиск не дал нормального ответа. Открой `/hori panel` -> Поиск -> Диагностика, там будет видно где затык."
  });
}

async function executeHoriSearch(
  runtime: BotRuntime,
  input: {
    guildId: string;
    channelId: string;
    interactionId: string;
    userId: string;
    username: string;
    displayName?: string | null;
    channelName?: string | null;
    query: string;
    isModerator: boolean;
  }
) {
  const routingConfig = await runtime.runtimeConfig.getRoutingConfig(input.guildId, input.channelId);
  const envelope: MessageEnvelope = {
    messageId: `slash:hori-search:${input.interactionId}`,
    guildId: input.guildId,
    channelId: input.channelId,
    userId: input.userId,
    username: input.username,
    displayName: input.displayName,
    channelName: input.channelName,
    content: `Хори найди в интернете: ${input.query}`,
    createdAt: new Date(),
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

async function handleHoriAiUrlCommand(
  runtime: BotRuntime,
  interaction: ChatInputCommandInteraction,
  isOwner: boolean
) {
  if (!isOwner) {
    await interaction.reply({ content: "AI URL только для владельца.", flags: MessageFlags.Ephemeral });
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

  let status = "проверяю...";
  let appliedUrl = oldUrl;
  try {
    const probe = await fetch(new URL("/api/tags", newUrl), { signal: AbortSignal.timeout(5000) });
    if (probe.ok) {
      const data = (await probe.json()) as { models?: { name: string }[] };
      const models = data.models?.map((m) => m.name).join(", ") ?? "?";
      runtime.env.OLLAMA_BASE_URL = newUrl;
      appliedUrl = newUrl;
      status = `Ollama доступен: ${models}`;

      try {
        await persistOllamaBaseUrl(runtime.prisma, newUrl, interaction.user.id);
        status += "\nURL сохранён и переживёт рестарт.";
      } catch (error) {
        runtime.logger.warn({ error: asErrorMessage(error), url: newUrl }, "failed to persist ollama url");
        status += "\nURL применён только в памяти процесса.";
      }
    } else {
      status = `URL не применён: Ollama вернул ${probe.status}`;
    }
  } catch (err) {
    status = `URL не применён: ${err instanceof Error ? err.message : "unknown"}`;
  }

  await interaction.editReply({
    content: `AI URL ${appliedUrl === newUrl ? "обновлён" : "не изменён"}\nТекущий: \`${appliedUrl}\`\nПроверяли: \`${newUrl}\`\n\n${status}`
  });
}

async function handleHoriLockdownCommand(
  runtime: BotRuntime,
  interaction: ChatInputCommandInteraction,
  isOwner: boolean
) {
  if (!isOwner) {
    await interaction.reply({ content: "Локдаун только для владельца.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (!runtime.env.DISCORD_OWNER_IDS.length) {
    await interaction.reply({ content: "Сначала укажи Discord user ID владельца в BOT_OWNERS.", flags: MessageFlags.Ephemeral });
    return;
  }

  const mode = interaction.options.getString("mode", true);
  if (mode === "status") {
    const state = await getOwnerLockdownState(runtime, true);
    await interaction.reply({
      content: `Owner lockdown: ${state.enabled ? "on" : "off"}${state.updatedBy ? `\nПоследнее изменение: ${state.updatedBy}` : ""}`,
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const enabled = mode === "on";
  await setOwnerLockdownState(runtime, enabled, interaction.user.id);
  const cleared = enabled ? await runtime.replyQueue.clearAll() : { count: 0 };

  await interaction.reply({
    content: enabled
      ? `Локдаун включён. Теперь Хори молча игнорирует всех, кроме владельца. Очередь ответов сброшена: ${cleared.count}.`
      : "Локдаун выключен. Хори снова слушает обычные правила сервера.",
    flags: MessageFlags.Ephemeral
  });
}

async function handleHoriImportCommand(
  runtime: BotRuntime,
  interaction: ChatInputCommandInteraction,
  isOwner: boolean
) {
  if (!isOwner) {
    await interaction.reply({ content: "Импорт доступен только владельцу.", flags: MessageFlags.Ephemeral });
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

    if (!guildId || !Array.isArray(messages) || messages.length === 0) {
      await interaction.editReply({ content: "Файл пуст или не содержит массив messages." });
      return;
    }

    if (messages.length > 50000) {
      await interaction.editReply({ content: "Максимум 50 000 сообщений за раз." });
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
    const seenUsers = new Set<string>();
    const userMsgCounts = new Map<string, number>();

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
          update: { username: entry.username ?? undefined },
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
            replyToMessageId: entry.replyToId ? `import:${guildId}:${entry.replyToId}` : undefined
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
        const relService = new RelationshipService(runtime.prisma);
        seeded = await relService.seedFromImportedHistory(guildId, userMsgCounts);
      } catch {
        // Non-critical.
      }
    }

    await interaction.editReply({
      content: [
        "Импорт завершён",
        `Импортировано: ${imported}`,
        `Пропущено: ${skipped}`,
        `Ошибок: ${errors}`,
        `Пользователей: ${seenUsers.size}`,
        `Профилей отношений создано: ${seeded}`
      ].join("\n")
    });
  } catch (err) {
    await interaction.editReply({ content: `Ошибка импорта: ${err instanceof Error ? err.message : "unknown"}` });
  }
}

async function routeStringSelectInteraction(
  runtime: BotRuntime,
  interaction: StringSelectMenuInteraction,
  isOwner: boolean
) {
  if (interaction.customId === `${HORI_STATE_PANEL_PREFIX}:tab`) {
    if (!interaction.guildId) {
      await interaction.reply({ content: "Только внутри сервера.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (!isOwner) {
      await interaction.reply({ content: "Панель состояния только для владельца.", flags: MessageFlags.Ephemeral });
      return;
    }

    const tab = parseHoriStateTab(interaction.values[0]) ?? "persona";
    await interaction.update(await buildHoriStatePanelResponse(runtime, tab, interaction.guildId, interaction.channelId));
    return;
  }

  if (interaction.customId === `${HORI_PANEL_PREFIX}:tab`) {
    const tab = parseHoriPanelTab(interaction.values[0]) ?? "main";
    await interaction.update(buildHoriPanelResponse(tab, isOwner, hasManageGuild(interaction)));
  }
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
  if (interaction.customId.startsWith(`${HORI_MODAL_PREFIX}:`)) {
    await handleHoriModalSubmit(runtime, interaction);
    return;
  }

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

async function handleHoriModalSubmit(runtime: BotRuntime, interaction: ModalSubmitInteraction) {
  if (!interaction.guildId) {
    await interaction.reply({ content: "Только внутри сервера.", flags: MessageFlags.Ephemeral });
    return;
  }

  const isOwner = isBotOwner(runtime, interaction.user.id);
  const isModerator = ensureModerator(interaction);
  const [, modalKind, channelIdFromModal] = interaction.customId.split(":");

  if (modalKind === "ai-url") {
    if (!isOwner) {
      await interaction.reply({ content: "AI URL только для владельца.", flags: MessageFlags.Ephemeral });
      return;
    }

    const url = interaction.fields.getTextInputValue("url").trim();
    try {
      new URL(url);
    } catch {
      await interaction.reply({ content: `Невалидный URL: ${url}`, flags: MessageFlags.Ephemeral });
      return;
    }

    runtime.env.OLLAMA_BASE_URL = url;
    await persistOllamaBaseUrl(runtime.prisma, url, interaction.user.id);
    await interaction.reply({ content: `AI URL сохранён: ${url}`, flags: MessageFlags.Ephemeral });
    return;
  }

  if (modalKind === "search") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const query = interaction.fields.getTextInputValue("query").trim();

    if (!query) {
      await interaction.editReply({ content: "Запрос пустой." });
      return;
    }

    const reply = await executeHoriSearch(runtime, {
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      interactionId: interaction.id,
      userId: interaction.user.id,
      username: interaction.user.username,
      displayName: getInteractionMemberDisplayName(interaction),
      channelName: interaction.channel && "name" in interaction.channel ? interaction.channel.name : null,
      query,
      isModerator
    });

    await interaction.editReply({
      content: reply?.trim() || "Поиск не дал нормального ответа. Открой `/hori panel` -> Поиск -> Диагностика, там будет видно где затык."
    });
    return;
  }

  if (modalKind === "relationship") {
    if (!isOwner) {
      await interaction.reply({ content: "Relationship-цифры только для владельца.", flags: MessageFlags.Ephemeral });
      return;
    }

    const [roastLevel, praiseBias, interruptPriority] = readNumberList(interaction.fields.getTextInputValue("levels"));
    const [closeness, trustLevel, familiarity, proactivityPreference] = readNumberList(interaction.fields.getTextInputValue("signals"));
    const [doNotMock, doNotInitiate, ...topics] = interaction.fields.getTextInputValue("switches").split(",").map((part) => part.trim()).filter(Boolean);
    const userId = interaction.fields.getTextInputValue("userId").trim();
    const toneBias = interaction.fields.getTextInputValue("toneBias").trim();

    const content = [
      await runtime.slashAdmin.updateRelationship(interaction.guildId, userId, interaction.user.id, {
        toneBias: toneBias || undefined,
        roastLevel: readIntInRange(roastLevel, 0, 5),
        praiseBias: readIntInRange(praiseBias, 0, 5),
        interruptPriority: readIntInRange(interruptPriority, 0, 5),
        doNotMock: readOptionalBoolean(doNotMock),
        doNotInitiate: readOptionalBoolean(doNotInitiate),
        protectedTopics: topics.length ? topics : undefined,
        closeness: readUnitFloat(closeness),
        trustLevel: readUnitFloat(trustLevel),
        familiarity: readUnitFloat(familiarity),
        proactivityPreference: readUnitFloat(proactivityPreference)
      }),
      "",
      await runtime.slashAdmin.relationshipDetails(interaction.guildId, userId)
    ].join("\n");
    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    return;
  }

  if (modalKind === "style") {
    if (!isOwner && !isModerator) {
      await interaction.reply({ content: "Стиль только для модеров.", flags: MessageFlags.Ephemeral });
      return;
    }

    const [roughness, sarcasm, roast] = readNumberList(interaction.fields.getTextInputValue("levels"));
    const replyLength = interaction.fields.getTextInputValue("replyLength").trim();
    const [forbiddenWords, forbiddenTopics] = interaction.fields.getTextInputValue("forbidden").split("|").map((part) => part.trim());

    await interaction.reply({
      content: await runtime.slashAdmin.updateStyle(interaction.guildId, {
        botName: blankToNull(interaction.fields.getTextInputValue("botName")),
        roughnessLevel: readIntInRange(roughness, 0, 5) ?? null,
        sarcasmLevel: readIntInRange(sarcasm, 0, 5) ?? null,
        roastLevel: readIntInRange(roast, 0, 5) ?? null,
        replyLength: replyLength === "short" || replyLength === "medium" || replyLength === "long" ? replyLength : null,
        preferredStyle: blankToNull(interaction.fields.getTextInputValue("preferredStyle")),
        forbiddenWords: blankToNull(forbiddenWords ?? ""),
        forbiddenTopics: blankToNull(forbiddenTopics ?? "")
      }),
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (modalKind === "channel") {
    if (!isOwner && !isModerator) {
      await interaction.reply({ content: "Канал только для модеров.", flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.reply({
      content: await runtime.slashAdmin.channelConfig(interaction.guildId, channelIdFromModal ?? interaction.channelId, {
        allowBotReplies: readOptionalBoolean(interaction.fields.getTextInputValue("allowBotReplies")),
        allowInterjections: readOptionalBoolean(interaction.fields.getTextInputValue("allowInterjections")),
        isMuted: readOptionalBoolean(interaction.fields.getTextInputValue("isMuted")),
        topicInterestTags: blankToNull(interaction.fields.getTextInputValue("topicInterestTags"))
      }),
      flags: MessageFlags.Ephemeral
    });
  }
}

async function routeButtonInteraction(runtime: BotRuntime, interaction: ButtonInteraction, isOwner: boolean) {
  if (interaction.customId.startsWith(`${HORI_ACTION_PREFIX}:`)) {
    await handleHoriPanelAction(runtime, interaction, isOwner, hasManageGuild(interaction));
    return;
  }

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

  await interaction.update(buildPowerPanelResponse(content, status.activeProfile));
}

async function handleHoriPanelAction(
  runtime: BotRuntime,
  interaction: ButtonInteraction,
  isOwner: boolean,
  isModerator: boolean
) {
  if (!interaction.guildId) {
    await interaction.reply({ content: "Только внутри сервера.", flags: MessageFlags.Ephemeral });
    return;
  }

  const action = interaction.customId.slice(`${HORI_ACTION_PREFIX}:`.length);

  if (action === "state_panel") {
    if (!isOwner) {
      await interaction.reply({ content: "Панель состояния только для владельца.", flags: MessageFlags.Ephemeral });
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
      await interaction.reply({ content: "Панель состояния только для владельца.", flags: MessageFlags.Ephemeral });
      return;
    }

    const tab = parseHoriStateTab(action.replace("state_", ""));
    if (!tab) {
      await interaction.reply({ content: "Неизвестная вкладка state panel.", flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.update(await buildHoriStatePanelResponse(runtime, tab, interaction.guildId, interaction.channelId));
    return;
  }

  if (action === "ai_url_modal") {
    if (!isOwner) {
      await interaction.reply({ content: "AI URL только для владельца.", flags: MessageFlags.Ephemeral });
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
      await interaction.reply({ content: "Relationship-цифры только для владельца.", flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.showModal(buildRelationshipModal());
    return;
  }

  if (action === "style_edit_modal") {
    if (!isOwner && !isModerator) {
      await interaction.reply({ content: "Стиль только для модеров.", flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.showModal(buildStyleModal());
    return;
  }

  if (action === "channel_edit_modal") {
    if (!isOwner && !isModerator) {
      await interaction.reply({ content: "Канал только для модеров.", flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.showModal(buildChannelModal(interaction.channelId));
    return;
  }

  if (action === "power_panel") {
    if (!isOwner) {
      await interaction.reply({ content: "Эта панель только для владельца бота.", flags: MessageFlags.Ephemeral });
      return;
    }

    const status = await runtime.runtimeConfig.getPowerProfileStatus();
    await interaction.update(buildPowerPanelResponse(await runtime.slashAdmin.powerPanel(), status.activeProfile));
    return;
  }

  if (action.startsWith("lockdown_")) {
    if (!isOwner) {
      await interaction.reply({ content: "Локдаун только для владельца.", flags: MessageFlags.Ephemeral });
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
          `Owner lockdown: ${state.enabled ? "on" : "off"}${state.updatedBy ? `\nПоследнее изменение: ${state.updatedBy}` : ""}`
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
        enabled ? "Lockdown включён" : "Lockdown выключен",
        enabled
          ? `Локдаун включён. Все кроме владельца молча игнорируются. Очередь сброшена: ${cleared.count}.`
          : "Локдаун выключен."
      )
    );
    return;
  }

  if (action === "memory_build_channel" || action === "memory_build_server") {
    const scope: MemoryFormationJobPayload["scope"] = action.endsWith("server") ? "server" : "channel";
    if (!isOwner && (!isModerator || scope === "server")) {
      await interaction.reply({
        content: scope === "server" ? "Сборка памяти по всему серверу только для владельца." : "Memory-build только для модеров.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await interaction.update({
      ...buildHoriPanelDetailResponse(
        "memory",
        isOwner,
        isModerator,
        scope === "server" ? "Memory-build сервера" : "Memory-build канала",
        await startMemoryBuildRun(runtime, interaction.guildId, scope === "channel" ? interaction.channelId : null, scope, "recent", interaction.user.id)
      )
    });
    return;
  }

  const content = await resolveHoriActionContent(runtime, interaction, action, isOwner, isModerator);
  const tab = inferTabForHoriAction(action);
  await interaction.update(buildHoriPanelDetailResponse(tab, isOwner, isModerator, horiActionTitle(action), content));
}

async function resolveHoriActionContent(
  runtime: BotRuntime,
  interaction: ButtonInteraction,
  action: string,
  isOwner: boolean,
  isModerator: boolean
) {
  const guildId = interaction.guildId!;

  switch (action) {
    case "status":
      return buildHoriStatus(runtime, guildId, interaction.channelId);
    case "help":
      return `${await runtime.slashAdmin.handleHelp()}\n\nВидимый список команд теперь держится вокруг /hori. Старые /bot-* можно вернуть через DISCORD_REGISTER_LEGACY_COMMANDS=true.`;
    case "profile_self":
    case "memory_self":
      return runtime.slashAdmin.personalMemory(guildId, interaction.user.id, isOwner || isModerator);
    case "relationship_self":
      return runtime.slashAdmin.relationshipDetails(guildId, interaction.user.id);
    case "relationship_hint":
      return "Для точной настройки: `/hori relationship user:@человек ...` или кнопка Edit relation в owner panel. Owner может менять toneBias, roast/praise/interrupt и цифры closeness/trust/familiarity/proactivity.";
    case "style_default":
      return runtime.slashAdmin.updateStyle(guildId, {
        botName: "Хори",
        roughnessLevel: 2,
        sarcasmLevel: 3,
        roastLevel: 2,
        replyLength: "short",
        preferredStyle: "женская персона; коротко; тепло, но не сахарно; умеренно язвительно; нормальный живой сленг без кринжа; не ставь финальные точки в коротких репликах",
        forbiddenWords: null,
        forbiddenTopics: null
      });
    case "natural_split_on":
      if (!isModerator && !isOwner) {
        return "Это только для модеров.";
      }
      return runtime.slashAdmin.updateFeature(guildId, "natural_message_splitting_enabled", true);
    case "natural_split_off":
      if (!isModerator && !isOwner) {
        return "Это только для модеров.";
      }
      return runtime.slashAdmin.updateFeature(guildId, "natural_message_splitting_enabled", false);
    case "read_chat_on":
      if (!isModerator && !isOwner) {
        return "Это только для модеров.";
      }
      return runtime.slashAdmin.channelConfig(guildId, interaction.channelId, {
        allowBotReplies: true,
        allowInterjections: true,
        isMuted: false,
        topicInterestTags: null
      });
    case "read_chat_off":
      if (!isModerator && !isOwner) {
        return "Это только для модеров.";
      }
      return runtime.slashAdmin.channelConfig(guildId, interaction.channelId, {
        allowBotReplies: false,
        allowInterjections: false,
        isMuted: false,
        topicInterestTags: null
      });
    case "media_sync":
      if (!isOwner) {
        return "Media sync-pack только для владельца.";
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
        return "Это только для модеров.";
      }
      return runtime.slashAdmin.topicReset(guildId, interaction.channelId);
    case "queue_status":
      return runtime.slashAdmin.queueStatus(guildId, interaction.channelId);
    case "queue_clear":
      if (!isModerator && !isOwner) {
        return "Это только для модеров.";
      }
      return runtime.slashAdmin.queueClear(guildId, interaction.channelId);
    case "mood_status":
      return runtime.slashAdmin.moodStatus(guildId);
    case "mood_normal":
      if (!isModerator && !isOwner) {
        return "Это только для модеров.";
      }
      return runtime.slashAdmin.moodSet(guildId, "normal", 60, "panel quick action");
    case "mood_playful":
      if (!isModerator && !isOwner) {
        return "Это только для модеров.";
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
      return "Неизвестная кнопка панели.";
  }
}

function buildHoriPanelResponse(tab: HoriPanelTab, isOwner: boolean, isModerator: boolean) {
  return {
    content: "",
    embeds: [buildHoriPanelEmbed(tab, isOwner, isModerator)],
    components: buildHoriPanelRows(tab, isOwner, isModerator)
  };
}

function buildHoriPanelDetailResponse(
  tab: HoriPanelTab,
  isOwner: boolean,
  isModerator: boolean,
  title: string,
  body: string
) {
  return {
    content: "",
    embeds: [buildHoriPanelEmbed(tab, isOwner, isModerator), buildHoriDetailEmbed(title, body)],
    components: buildHoriPanelRows(tab, isOwner, isModerator)
  };
}

function buildHoriPanelEmbed(tab: HoriPanelTab, isOwner: boolean, isModerator: boolean) {
  const ownerLine = isOwner ? "owner-доступ активен" : isModerator ? "moderator-доступ активен" : "обычный доступ: видишь только своё";

  const tabText: Record<HoriPanelTab, string> = {
    main: "Главный вход: профиль, память, поиск, канал, стиль и диагностика без старого командного шума.",
    owner: isOwner
      ? "Owner panel: power profile, lockdown, relationship редактор, media sync-pack, server memory-build и отдельная state-панель."
      : "Owner panel скрыта. Тут ничего страшного, просто не твоё меню",
    style: "Стиль: женская персона, короткие ответы, тепло без сахара, умеренная язвительность, живой сленг и без финальных точек в коротких репликах",
    liveliness: "Живость: чтение чата, редкие аккуратные вмешательства, natural message sprinting максимум в 2 коротких чанка",
    memory: "Память: Active Memory + Hybrid Recall применяется к каждому ответу; memory-build собирает user/channel/server/event факты из БД",
    people: "Люди: свой профиль видит каждый; owner/moderator могут смотреть подробнее, owner настраивает relationship цифры",
    channels: "Каналы: можно включить replies/interjections, посмотреть policy и локальную channel memory",
    search: "Поиск: диагностика Brave/Ollama/cooldown/denylist и усиленный fallback через прямой Brave search + fetch страниц",
    experiments: "Эксперименты: natural splitting, media reactions, selective engagement, reflection и link understanding",
    diagnostics: "Диагностика: последние trace, feature flags, search preflight и состояние памяти"
  };

  const actions = getHoriTabActions(tab, isOwner, isModerator).map((action) => action.label).join(" / ") || "нет доступных кнопок";

  return new EmbedBuilder()
    .setTitle(`Hori Panel: ${horiTabLabel(tab)}`)
    .setDescription(tabText[tab])
    .addFields(
      { name: "Доступ", value: ownerLine, inline: true },
      { name: "Кнопки", value: actions.slice(0, 1024) },
      { name: "Команды", value: "Основной вход: `/hori`. Legacy `/bot-*` скрыты из регистрации по умолчанию." }
    );
}

function buildHoriPanelRows(tab: HoriPanelTab, isOwner: boolean, isModerator: boolean) {
  const rows: Array<ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>> = [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`${HORI_PANEL_PREFIX}:tab`)
        .setPlaceholder("Раздел панели")
        .addOptions(
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
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...actions.slice(index, index + 5).map((action) =>
          new ButtonBuilder()
            .setCustomId(`${HORI_ACTION_PREFIX}:${action.id}`)
            .setLabel(action.label)
            .setStyle(action.style ?? ButtonStyle.Secondary)
        )
      )
    );
  }

  return rows;
}

async function buildHoriStatePanelResponse(runtime: BotRuntime, tab: HoriStateTab, guildId: string, channelId: string) {
  const service = new BotStateService(runtime);
  const panel = await service.build(tab, guildId, channelId);

  return {
    content: "",
    embeds: [
      new EmbedBuilder()
        .setTitle(panel.title)
        .setDescription(panel.description)
        .addFields(...panel.fields.map((field) => ({
          name: field.name,
          value: field.value || "none",
          inline: field.inline
        })))
    ],
    components: buildHoriStatePanelRows(tab)
  };
}

function buildHoriStatePanelRows(tab: HoriStateTab) {
  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`${HORI_STATE_PANEL_PREFIX}:tab`)
        .setPlaceholder("Состояние")
        .addOptions(
          ...HORI_STATE_TABS.map((value) => ({
            label: horiStateTabLabel(value),
            value,
            default: value === tab
          }))
        )
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${HORI_ACTION_PREFIX}:panel_home`)
        .setLabel("Panel")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${HORI_ACTION_PREFIX}:state_brain`)
        .setLabel("Brain")
        .setStyle(tab === "brain" ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${HORI_ACTION_PREFIX}:state_trace`)
        .setLabel("Trace")
        .setStyle(tab === "trace" ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${HORI_ACTION_PREFIX}:state_tokens`)
        .setLabel("Tokens")
        .setStyle(tab === "tokens" ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${HORI_ACTION_PREFIX}:power_panel`)
        .setLabel("Power")
        .setStyle(ButtonStyle.Primary)
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${HORI_ACTION_PREFIX}:debug_latest`)
        .setLabel("Latest trace")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${HORI_ACTION_PREFIX}:search_diagnose`)
        .setLabel("Search diag")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${HORI_ACTION_PREFIX}:state_search`)
        .setLabel("Search state")
        .setStyle(tab === "search" ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${HORI_ACTION_PREFIX}:state_features`)
        .setLabel("Features")
        .setStyle(tab === "features" ? ButtonStyle.Primary : ButtonStyle.Secondary)
    )
  ];
}

function getHoriTabActions(tab: HoriPanelTab, isOwner: boolean, isModerator: boolean) {
  const common = [
    { id: "status", label: "Статус", style: ButtonStyle.Primary },
    { id: "help", label: "Help" },
    { id: "search_query_modal", label: "Search" },
    { id: "queue_status", label: "Queue" },
    { id: "mood_status", label: "Mood" },
    { id: "profile_self", label: "Мой профиль" },
    { id: "memory_self", label: "Моя память" }
  ];

  const byTab: Record<HoriPanelTab, Array<{ id: string; label: string; style?: ButtonStyle; ownerOnly?: boolean; modOnly?: boolean }>> = {
    main: common,
    owner: [
      { id: "state_panel", label: "State", ownerOnly: true, style: ButtonStyle.Primary },
      { id: "state_trace", label: "Trace", ownerOnly: true },
      { id: "state_tokens", label: "Tokens", ownerOnly: true },
      { id: "power_panel", label: "Power", ownerOnly: true, style: ButtonStyle.Primary },
      { id: "ai_url_modal", label: "AI URL", ownerOnly: true },
      { id: "relationship_edit_modal", label: "Edit relation", ownerOnly: true },
      { id: "lockdown_status", label: "Lockdown?", ownerOnly: true },
      { id: "lockdown_on", label: "Lockdown on", ownerOnly: true, style: ButtonStyle.Danger },
      { id: "lockdown_off", label: "Lockdown off", ownerOnly: true },
      { id: "media_sync", label: "Media sync", ownerOnly: true },
      { id: "media_list", label: "Media list", ownerOnly: true },
      { id: "memory_build_server", label: "Build сервер", ownerOnly: true }
    ],
    style: [
      { id: "style_default", label: "Живой preset", modOnly: true, style: ButtonStyle.Primary },
      { id: "style_edit_modal", label: "Edit style", modOnly: true },
      { id: "mood_playful", label: "Mood playful", modOnly: true },
      { id: "mood_normal", label: "Mood normal", modOnly: true },
      { id: "natural_split_on", label: "Sprinting on", modOnly: true },
      { id: "natural_split_off", label: "Sprinting off", modOnly: true },
      { id: "feature_status", label: "Фичи" },
      { id: "status", label: "Статус" }
    ],
    liveliness: [
      { id: "read_chat_on", label: "Читать чат", modOnly: true, style: ButtonStyle.Primary },
      { id: "read_chat_off", label: "Тихий канал", modOnly: true },
      { id: "natural_split_on", label: "2 чанка", modOnly: true },
      { id: "natural_split_off", label: "1 chunk", modOnly: true },
      { id: "mood_status", label: "Mood" },
      { id: "queue_status", label: "Queue" },
      { id: "media_sync", label: "GIF pack", ownerOnly: true },
      { id: "reflection_status", label: "Reflection" },
      { id: "feature_status", label: "Фичи" }
    ],
    memory: [
      { id: "memory_status", label: "Memory status", style: ButtonStyle.Primary },
      { id: "memory_build_channel", label: "Build канал", modOnly: true },
      { id: "memory_build_server", label: "Build сервер", ownerOnly: true },
      { id: "summary_current", label: "Summary" },
      { id: "topic_status", label: "Topic" },
      { id: "reflection_list", label: "Lessons" },
      { id: "memory_self", label: "Моя память" }
    ],
    people: [
      { id: "profile_self", label: "Мой профиль", style: ButtonStyle.Primary },
      { id: "relationship_self", label: "Отношение ко мне" },
      { id: "relationship_edit_modal", label: "Edit relation", ownerOnly: true },
      { id: "relationship_hint", label: "Owner edit", ownerOnly: true },
      { id: "memory_self", label: "Моя память" }
    ],
    channels: [
      { id: "channel_policy", label: "Policy", style: ButtonStyle.Primary },
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
      { id: "search_query_modal", label: "Search", style: ButtonStyle.Primary },
      { id: "search_diagnose", label: "Диагностика", style: ButtonStyle.Primary },
      { id: "feature_status", label: "Фичи" },
      { id: "state_search", label: "Search state", ownerOnly: true },
      { id: "state_tokens", label: "Tokens", ownerOnly: true }
    ],
    experiments: [
      { id: "natural_split_on", label: "Sprinting on", modOnly: true, style: ButtonStyle.Primary },
      { id: "natural_split_off", label: "Sprinting off", modOnly: true },
      { id: "mood_playful", label: "Mood playful", modOnly: true },
      { id: "feature_status", label: "Фичи" },
      { id: "media_list", label: "Media list" },
      { id: "reflection_status", label: "Reflection" },
      { id: "reflection_list", label: "Lessons" },
      { id: "media_sync", label: "Media sync", ownerOnly: true }
    ],
    diagnostics: [
      { id: "debug_latest", label: "Latest trace", style: ButtonStyle.Primary },
      { id: "search_diagnose", label: "Search diag" },
      { id: "feature_status", label: "Фичи" },
      { id: "queue_status", label: "Queue" },
      { id: "stats_week", label: "Stats" },
      { id: "state_trace", label: "Trace state", ownerOnly: true },
      { id: "state_tokens", label: "Token state", ownerOnly: true },
      { id: "status", label: "Статус" }
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

function parseHoriPanelTab(value: string | null | undefined): HoriPanelTab | null {
  return HORI_PANEL_TABS.includes(value as HoriPanelTab) ? (value as HoriPanelTab) : null;
}

function horiTabLabel(tab: HoriPanelTab) {
  const labels: Record<HoriPanelTab, string> = {
    main: "Главная",
    owner: "Владелец",
    style: "Стиль",
    liveliness: "Живость",
    memory: "Память",
    people: "Люди",
    channels: "Каналы",
    search: "Поиск",
    experiments: "Эксперименты",
    diagnostics: "Диагностика"
  };
  return labels[tab];
}

function inferTabForHoriAction(action: string): HoriPanelTab {
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

function horiActionTitle(action: string) {
  const titles: Record<string, string> = {
    status: "Быстрый статус",
    help: "Help",
    search_query_modal: "Поиск",
    profile_self: "Мой профиль",
    memory_self: "Моя память",
    relationship_self: "Отношение ко мне",
    relationship_hint: "Relationship hint",
    style_default: "Живой preset",
    natural_split_on: "Natural splitting: on",
    natural_split_off: "Natural splitting: off",
    read_chat_on: "Чтение чата: on",
    read_chat_off: "Чтение чата: off",
    media_sync: "Media sync-pack",
    media_list: "Media list",
    memory_status: "Memory status",
    summary_current: "Summary",
    stats_week: "Недельная статистика",
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

function buildHoriDetailEmbed(title: string, body: string) {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(clipPanelText(body));
}

function buildPowerPanelResponse(content: string, activeProfile: (typeof POWER_PROFILES)[number]) {
  return {
    content: "",
    embeds: [buildHoriDetailEmbed("Hori Power Panel", content)],
    components: [
      ...buildPowerPanelRows(activeProfile),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`${HORI_ACTION_PREFIX}:panel_home`).setLabel("Panel").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`${HORI_ACTION_PREFIX}:state_brain`).setLabel("Brain").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`${HORI_ACTION_PREFIX}:state_tokens`).setLabel("Tokens").setStyle(ButtonStyle.Secondary)
      )
    ]
  };
}

function clipPanelText(value: string, max = 4000) {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value || "none";
}

async function buildHoriStatus(runtime: BotRuntime, guildId: string, channelId: string) {
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

async function buildFeatureStatus(runtime: BotRuntime, guildId: string) {
  const flags = await runtime.runtimeConfig.getFeatureFlags(guildId);
  return Object.entries(flags)
    .map(([key, value]) => `${value ? "on " : "off"} ${key}`)
    .join("\n")
    .slice(0, 1900);
}

async function buildChannelPolicyStatus(runtime: BotRuntime, guildId: string, channelId: string) {
  const policy = await runtime.runtimeConfig.getChannelPolicy(guildId, channelId);
  return [
    `Channel policy for ${channelId}`,
    `allowBotReplies=${policy.allowBotReplies}`,
    `allowInterjections=${policy.allowInterjections}`,
    `isMuted=${policy.isMuted}`,
    `topicInterestTags=${policy.topicInterestTags.join(", ") || "none"}`
  ].join("\n");
}

async function buildLatestDebugTrace(runtime: BotRuntime, guildId: string) {
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
    return "Trace пока нет.";
  }

  return JSON.stringify(trace, null, 2).slice(0, 1900);
}

async function diagnoseSearch(runtime: BotRuntime) {
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
        signal: AbortSignal.timeout(5000)
      });
      if (response.ok) {
        const payload = (await response.json()) as { models?: Array<{ name?: string }> };
        lines.push(`Ollama tags: ok (${payload.models?.map((model) => model.name).filter(Boolean).join(", ") || "no models"})`);
      } else {
        lines.push(`Ollama tags: status ${response.status}`);
      }
    } catch (error) {
      lines.push(`Ollama tags: ${asErrorMessage(error)}`);
    }
  }

  return lines.join("\n");
}

async function startMemoryBuildRun(
  runtime: BotRuntime,
  guildId: string,
  channelId: string | null,
  scope: MemoryFormationJobPayload["scope"],
  depth: MemoryFormationJobPayload["depth"],
  requestedBy: string
) {
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
  const payload: MemoryFormationJobPayload = { runId: run.id, guildId, channelId, scope, depth, requestedBy };
  await runtime.queues.memoryFormation.add("memory.formation", payload, { jobId: `memory-formation:${run.id}` });

  return [
    "Memory-build поставлен в очередь",
    `runId: ${run.id}`,
    `scope=${scope}, depth=${depth}${channelId ? `, channel=${channelId}` : ""}`,
    "Статус смотри в /hori panel -> Память -> Memory status"
  ].join("\n");
}

function getInteractionDisplayName(interaction: ChatInputCommandInteraction) {
  return interaction.member && "displayName" in interaction.member
    ? interaction.member.displayName
    : interaction.user.globalName;
}

function getInteractionMemberDisplayName(interaction: ModalSubmitInteraction) {
  return interaction.member && "displayName" in interaction.member
    ? interaction.member.displayName
    : interaction.user.globalName;
}

function hasManageGuild(interaction: ButtonInteraction | StringSelectMenuInteraction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
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

function buildAiUrlModal(currentUrl?: string) {
  const modal = new ModalBuilder()
    .setCustomId(`${HORI_MODAL_PREFIX}:ai-url`)
    .setTitle("Ollama URL");

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("url")
        .setLabel("Новый Ollama URL")
        .setPlaceholder("https://...")
        .setValue(currentUrl ?? "")
        .setRequired(true)
        .setMaxLength(300)
        .setStyle(TextInputStyle.Short)
    )
  );

  return modal;
}

function buildSearchModal() {
  const modal = new ModalBuilder()
    .setCustomId(`${HORI_MODAL_PREFIX}:search`)
    .setTitle("Hori Search");

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("query")
        .setLabel("Что искать")
        .setPlaceholder("например: лучшие практики discord button ux")
        .setRequired(true)
        .setMaxLength(300)
        .setStyle(TextInputStyle.Paragraph)
    )
  );

  return modal;
}

function buildRelationshipModal() {
  const modal = new ModalBuilder()
    .setCustomId(`${HORI_MODAL_PREFIX}:relationship`)
    .setTitle("Relationship editor");

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("userId")
        .setLabel("Discord user ID")
        .setRequired(true)
        .setMaxLength(40)
        .setStyle(TextInputStyle.Short)
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("toneBias")
        .setLabel("toneBias")
        .setPlaceholder("neutral / friendly / sharp / playful")
        .setRequired(false)
        .setMaxLength(40)
        .setStyle(TextInputStyle.Short)
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("levels")
        .setLabel("roast,praise,interrupt")
        .setPlaceholder("2,1,0")
        .setRequired(false)
        .setMaxLength(30)
        .setStyle(TextInputStyle.Short)
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("signals")
        .setLabel("closeness,trust,familiarity,proactivity")
        .setPlaceholder("0.6,0.5,0.7,0.5")
        .setRequired(false)
        .setMaxLength(60)
        .setStyle(TextInputStyle.Short)
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("switches")
        .setLabel("doNotMock,doNotInitiate,topics")
        .setPlaceholder("false,false,тема1,тема2")
        .setRequired(false)
        .setMaxLength(200)
        .setStyle(TextInputStyle.Paragraph)
    )
  );

  return modal;
}

function buildStyleModal() {
  const modal = new ModalBuilder()
    .setCustomId(`${HORI_MODAL_PREFIX}:style`)
    .setTitle("Style editor");

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("botName")
        .setLabel("Имя")
        .setPlaceholder("Хори")
        .setRequired(false)
        .setMaxLength(40)
        .setStyle(TextInputStyle.Short)
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("levels")
        .setLabel("roughness,sarcasm,roast")
        .setPlaceholder("2,3,2")
        .setRequired(false)
        .setMaxLength(30)
        .setStyle(TextInputStyle.Short)
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("replyLength")
        .setLabel("replyLength")
        .setPlaceholder("short / medium / long")
        .setRequired(false)
        .setMaxLength(20)
        .setStyle(TextInputStyle.Short)
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("preferredStyle")
        .setLabel("Стиль")
        .setRequired(false)
        .setMaxLength(900)
        .setStyle(TextInputStyle.Paragraph)
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("forbidden")
        .setLabel("forbiddenWords | forbiddenTopics")
        .setPlaceholder("слово1,слово2 | тема1,тема2")
        .setRequired(false)
        .setMaxLength(400)
        .setStyle(TextInputStyle.Paragraph)
    )
  );

  return modal;
}

function buildChannelModal(channelId: string) {
  const modal = new ModalBuilder()
    .setCustomId(`${HORI_MODAL_PREFIX}:channel:${channelId}`)
    .setTitle("Channel policy");

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("allowBotReplies")
        .setLabel("allowBotReplies")
        .setPlaceholder("true / false / пусто")
        .setRequired(false)
        .setMaxLength(10)
        .setStyle(TextInputStyle.Short)
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("allowInterjections")
        .setLabel("allowInterjections")
        .setPlaceholder("true / false / пусто")
        .setRequired(false)
        .setMaxLength(10)
        .setStyle(TextInputStyle.Short)
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("isMuted")
        .setLabel("isMuted")
        .setPlaceholder("true / false / пусто")
        .setRequired(false)
        .setMaxLength(10)
        .setStyle(TextInputStyle.Short)
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("topicInterestTags")
        .setLabel("topicInterestTags")
        .setPlaceholder("мемы,тех,игры")
        .setRequired(false)
        .setMaxLength(200)
        .setStyle(TextInputStyle.Paragraph)
    )
  );

  return modal;
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

function blankToNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readNumberList(value: string) {
  return value.split(",").map((part) => {
    const parsed = Number(part.trim());
    return Number.isFinite(parsed) ? parsed : undefined;
  });
}

function readIntInRange(value: number | undefined, min: number, max: number) {
  if (value === undefined || !Number.isInteger(value)) {
    return undefined;
  }

  return Math.max(min, Math.min(max, value));
}

function readUnitFloat(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.max(0, Math.min(1, value));
}

function readOptionalBoolean(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  if (["true", "1", "yes", "on", "да"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no", "off", "нет"].includes(normalized)) {
    return false;
  }

  return undefined;
}
