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
import {
  isModelRoutingModelId,
  isModelRoutingPresetName,
  isModelRoutingSlot,
  MODEL_ROUTING_MODEL_IDS,
  MODEL_ROUTING_PRESETS,
  MODEL_ROUTING_SLOTS,
  SUPPORTED_OPENAI_EMBEDDING_DIMENSIONS,
  type ModelRoutingSlot
} from "@hori/llm";

import type { BotRuntime } from "../bootstrap";
import {
  HORI_ACTION_PREFIX,
  HORI_MODAL_PREFIX,
  HORI_PANEL_OWNER_ONLY_MESSAGE,
  HORI_PANEL_PREFIX,
  HORI_PANEL_TABS,
  HORI_STATE_PANEL_PREFIX,
  LLM_PANEL_PREFIX,
  MEMORY_ALBUM_MODAL_PREFIX,
  PANEL_FEATURE_LABELS,
  POWER_PANEL_PREFIX,
  POWER_PROFILES,
  TAB_COLOR,
  TAB_EMOJI,
  type HoriPanelTab,
  type PanelFeatureKey
} from "../panel/constants";
import { getOwnerLockdownState, isBotOwner, setOwnerLockdownState, shouldIgnoreForOwnerLockdown } from "./owner-lockdown";
import { BotStateService, HORI_STATE_TABS, horiStateTabLabel, parseHoriStateTab, type HoriStateTab } from "../services/bot-state-service";

const PUBLIC_COMMANDS = new Set(["hori", "bot-help", "bot-album"]);
const OWNER_COMMANDS = new Set(["bot-ai-url", "bot-import", "bot-lockdown", "bot-power"]);
type HoriPanelAction = {
  id: string;
  label: string;
  emoji?: string;
  style?: ButtonStyle;
  ownerOnly?: boolean;
  modOnly?: boolean;
};

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
            preferredLanguage: interaction.options.getString("preferred-language"),
            roughnessLevel: interaction.options.getInteger("roughness"),
            sarcasmLevel: interaction.options.getInteger("sarcasm"),
            roastLevel: interaction.options.getInteger("roast"),
            interjectTendency: interaction.options.getInteger("interject-tendency"),
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
              responseLengthOverride: parseReplyLengthSelection(interaction.options.getString("response-length")),
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
    if (!isOwner) {
      await interaction.reply({ content: HORI_PANEL_OWNER_ONLY_MESSAGE, flags: MessageFlags.Ephemeral });
      return;
    }

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

  if (subcommand === "ai-status") {
    if (!isOwner) {
      await interaction.reply({ content: "AI router status только для владельца.", flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.reply({
      content: await runtime.slashAdmin.aiStatus(),
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

  if (subcommand === "dossier") {
    if (!isOwner) {
      await interaction.reply({ content: "Досье доступно только владельцу.", flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.reply({
      content: await runtime.slashAdmin.personDossier(interaction.guildId, interaction.options.getUser("user", true).id),
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
          responseLengthOverride: parseReplyLengthSelection(interaction.options.getString("response-length")),
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
  if (interaction.customId.startsWith(`${LLM_PANEL_PREFIX}:`)) {
    await handleLlmPanelSelect(runtime, interaction, isOwner);
    return;
  }

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
    if (!isOwner) {
      await interaction.reply({ content: HORI_PANEL_OWNER_ONLY_MESSAGE, flags: MessageFlags.Ephemeral });
      return;
    }

    const tab = parseHoriPanelTab(interaction.values[0]) ?? "main";
    await interaction.update(buildHoriPanelResponse(tab, isOwner, hasManageGuild(interaction)));
  }
}

async function handleLlmPanelSelect(
  runtime: BotRuntime,
  interaction: StringSelectMenuInteraction,
  isOwner: boolean
) {
  if (!interaction.guildId) {
    await interaction.reply({ content: "Только внутри сервера.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (!isOwner) {
    await interaction.reply({ content: HORI_PANEL_OWNER_ONLY_MESSAGE, flags: MessageFlags.Ephemeral });
    return;
  }

  const [, action, selectedSlot] = interaction.customId.split(":");
  const value = interaction.values[0];

  if (action === "preset") {
    if (!(await ensureLlmModelControlsEditable(runtime, interaction))) {
      return;
    }

    if (!isModelRoutingPresetName(value)) {
      await interaction.reply({ content: "Неизвестный LLM preset.", flags: MessageFlags.Ephemeral });
      return;
    }

    await runtime.runtimeConfig.setModelPreset(value, interaction.user.id);
    await interaction.update(await buildLlmPanelResponse(runtime, "chat", interaction.guildId));
    return;
  }

  if (action === "slot") {
    const slot = isModelRoutingSlot(value) ? value : "chat";
    await interaction.update(await buildLlmPanelResponse(runtime, slot, interaction.guildId));
    return;
  }

  if (action === "model") {
    if (!(await ensureLlmModelControlsEditable(runtime, interaction))) {
      return;
    }

    const slot = isModelRoutingSlot(selectedSlot ?? "") ? selectedSlot as ModelRoutingSlot : null;

    if (!slot || !isModelRoutingModelId(value)) {
      await interaction.reply({ content: "Неизвестный LLM slot/model.", flags: MessageFlags.Ephemeral });
      return;
    }

    await runtime.runtimeConfig.setModelSlot(slot, value, interaction.user.id);
    await interaction.update(await buildLlmPanelResponse(runtime, slot, interaction.guildId));
    return;
  }

  if (action === "runtime") {
    if (value === "hyde:on") {
      await runtime.runtimeConfig.setMemoryHydeEnabled(true, interaction.user.id);
      await interaction.update(await buildLlmPanelResponse(runtime, "chat", interaction.guildId));
      return;
    }

    if (value === "hyde:off") {
      await runtime.runtimeConfig.setMemoryHydeEnabled(false, interaction.user.id);
      await interaction.update(await buildLlmPanelResponse(runtime, "chat", interaction.guildId));
      return;
    }

    if (value === "hyde:reset") {
      await runtime.runtimeConfig.resetMemoryHydeEnabled();
      await interaction.update(await buildLlmPanelResponse(runtime, "chat", interaction.guildId));
      return;
    }

    if (value === "embed:reset") {
      await runtime.runtimeConfig.resetOpenAIEmbeddingDimensions();
      await interaction.update(await buildLlmPanelResponse(runtime, "chat", interaction.guildId));
      return;
    }

    if (value.startsWith("embed:")) {
      const dimensions = Number(value.slice("embed:".length));

      if (!Number.isInteger(dimensions)) {
        await interaction.reply({ content: "Неизвестный embedding preset.", flags: MessageFlags.Ephemeral });
        return;
      }

      await runtime.runtimeConfig.setOpenAIEmbeddingDimensions(dimensions, interaction.user.id);
      await interaction.update(await buildLlmPanelResponse(runtime, "chat", interaction.guildId));
      return;
    }

    await interaction.reply({ content: "Неизвестный runtime control.", flags: MessageFlags.Ephemeral });
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

  if (!isOwner) {
    await interaction.reply({ content: HORI_PANEL_OWNER_ONLY_MESSAGE, flags: MessageFlags.Ephemeral });
    return;
  }

  if (modalKind === "ai-url") {
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
    const searchChannelId = interaction.channelId ?? interaction.channel?.id;

    if (!query) {
      await interaction.editReply({ content: "Запрос пустой." });
      return;
    }

    if (!searchChannelId) {
      await interaction.editReply({ content: "Не смогла определить канал для поиска." });
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
      content: reply?.trim() || "Поиск не дал нормального ответа. Открой `/hori panel` -> Поиск -> Диагностика, там будет видно где затык."
    });
    return;
  }

  if (modalKind === "dossier") {
    const userId = interaction.fields.getTextInputValue("userId").trim();

    if (!userId) {
      await interaction.reply({ content: "Нужен Discord user ID.", flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.reply({
      content: await runtime.slashAdmin.personDossier(interaction.guildId, userId),
      flags: MessageFlags.Ephemeral
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
      flags: MessageFlags.Ephemeral
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
      flags: MessageFlags.Ephemeral
    });
  }
}

async function routeButtonInteraction(runtime: BotRuntime, interaction: ButtonInteraction, isOwner: boolean) {
  if (interaction.customId.startsWith(`${HORI_ACTION_PREFIX}:`)) {
    await handleHoriPanelAction(runtime, interaction, isOwner, hasManageGuild(interaction));
    return;
  }

  if (interaction.customId.startsWith(`${LLM_PANEL_PREFIX}:`)) {
    await handleLlmPanelButton(runtime, interaction, isOwner);
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

async function handleLlmPanelButton(runtime: BotRuntime, interaction: ButtonInteraction, isOwner: boolean) {
  if (!interaction.guildId) {
    await interaction.reply({ content: "Только внутри сервера.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (!isOwner) {
    await interaction.reply({ content: HORI_PANEL_OWNER_ONLY_MESSAGE, flags: MessageFlags.Ephemeral });
    return;
  }

  const [, action, selectedSlot] = interaction.customId.split(":");
  const slot = isModelRoutingSlot(selectedSlot ?? "") ? selectedSlot as ModelRoutingSlot : "chat";

  if (action === "reset-slot") {
    if (!(await ensureLlmModelControlsEditable(runtime, interaction))) {
      return;
    }

    await runtime.runtimeConfig.resetModelSlot(slot, interaction.user.id);
    await interaction.update(await buildLlmPanelResponse(runtime, slot, interaction.guildId));
    return;
  }

  if (action === "reset-all") {
    if (!(await ensureLlmModelControlsEditable(runtime, interaction))) {
      return;
    }

    await runtime.runtimeConfig.resetModelRouting(interaction.user.id);
    await interaction.update(await buildLlmPanelResponse(runtime, slot, interaction.guildId));
    return;
  }

  await interaction.reply({ content: "Неизвестная кнопка LLM panel.", flags: MessageFlags.Ephemeral });
}

async function ensureLlmModelControlsEditable(
  runtime: BotRuntime,
  interaction: StringSelectMenuInteraction | ButtonInteraction
) {
  const status = await runtime.runtimeConfig.getModelRoutingStatus();

  if (status.controlsEditable) {
    return true;
  }

  await interaction.reply({
    content: status.controlsNote ?? "Эти model controls сейчас только для просмотра.",
    flags: MessageFlags.Ephemeral
  });
  return false;
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

  if (!isOwner) {
    await interaction.reply({ content: HORI_PANEL_OWNER_ONLY_MESSAGE, flags: MessageFlags.Ephemeral });
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

  if (action === "llm_panel") {
    await interaction.update(await buildLlmPanelResponse(runtime, "chat", interaction.guildId));
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
      await interaction.reply({ content: "Feature toggles только для модеров.", flags: MessageFlags.Ephemeral });
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
          "system",
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
        "system",
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
    case "style_status":
      return buildStyleStatus(runtime, guildId);
    case "style_default":
      return runtime.slashAdmin.updateStyle(guildId, {
        botName: "Хори",
        preferredLanguage: "ru",
        roughnessLevel: 2,
        sarcasmLevel: 3,
        roastLevel: 2,
        interjectTendency: 1,
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
  const role = isOwner ? "👑 owner" : isModerator ? "🛡️ moderator" : "👤 user";

  const tabText: Record<HoriPanelTab, string> = {
    main: "Быстрый доступ к статусу, помощи, поиску, очереди и профилю. Отсюда можно перейти в любой раздел.",
    persona: "Настройки персоны: имя, стиль, roughness/sarcasm/roast, длина ответов, mood и запреты. Живой preset для быстрого сброса.",
    behavior: "Активность бота: чтение чата, auto-interject, reply queue, natural message splitting, media reactions.",
    memory: "Всё про память: Active Memory, hybrid recall, memory-build, topic engine, album, reflection, профили людей и отношения.",
    channels: "Каналы: policy, mute, reply length override, topic tags, поиск, summary. Web search и link understanding тоже тут.",
    llm: "LLM routing: preset, модели по функциям, legacy fallback и диагностика токенов без россыпи env.",
    system: "Система: State panel, Power profile, lockdown, AI URL, debug trace, feature flags, context/safety diagnostics и эксперименты."
  };

  const actions = getHoriTabActions(tab, isOwner, isModerator).map((a) => a.label).join(" · ") || "—";

  return new EmbedBuilder()
    .setTitle(`${TAB_EMOJI[tab]} Hori Panel — ${horiTabLabel(tab)}`)
    .setColor(TAB_COLOR[tab])
    .setDescription(tabText[tab])
    .addFields(
      { name: "Доступ", value: role, inline: true },
      { name: "Кнопки", value: actions.slice(0, 1024) }
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
            emoji: TAB_EMOJI[value],
            default: value === tab
          }))
        )
    )
  ];

  const actions = getHoriTabActions(tab, isOwner, isModerator);
  for (let index = 0; index < actions.length; index += 5) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...actions.slice(index, index + 5).map((action) => {
          const btn = new ButtonBuilder()
            .setCustomId(`${HORI_ACTION_PREFIX}:${action.id}`)
            .setLabel(action.label)
            .setStyle(action.style ?? ButtonStyle.Secondary);
          if (action.emoji) btn.setEmoji(action.emoji);
          return btn;
        })
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
        .setTitle(`📡 ${panel.title}`)
        .setColor(0xEB459E)
        .setDescription(panel.description)
        .addFields(...panel.fields.map((field) => ({
          name: field.name,
          value: field.value || "—",
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
        .setEmoji("🏠")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${HORI_ACTION_PREFIX}:state_brain`)
        .setLabel("Brain")
        .setEmoji("🧠")
        .setStyle(tab === "brain" ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${HORI_ACTION_PREFIX}:state_trace`)
        .setLabel("Trace")
        .setEmoji("📜")
        .setStyle(tab === "trace" ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${HORI_ACTION_PREFIX}:state_tokens`)
        .setLabel("Tokens")
        .setEmoji("🪙")
        .setStyle(tab === "tokens" ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${HORI_ACTION_PREFIX}:power_panel`)
        .setLabel("Power")
        .setEmoji("⚡")
        .setStyle(ButtonStyle.Primary)
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${HORI_ACTION_PREFIX}:debug_latest`)
        .setLabel("Latest trace")
        .setEmoji("🔬")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${HORI_ACTION_PREFIX}:search_diagnose`)
        .setLabel("Search diag")
        .setEmoji("🩺")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${HORI_ACTION_PREFIX}:state_search`)
        .setLabel("Search state")
        .setEmoji("🔎")
        .setStyle(tab === "search" ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${HORI_ACTION_PREFIX}:state_features`)
        .setLabel("Features")
        .setEmoji("🏷️")
        .setStyle(tab === "features" ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${HORI_ACTION_PREFIX}:llm_panel`)
        .setLabel("LLM")
        .setEmoji("🤖")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

function getHoriTabActions(tab: HoriPanelTab, isOwner: boolean, isModerator: boolean) {
  const byTab: Record<HoriPanelTab, HoriPanelAction[]> = {
    main: [
      { id: "status", label: "Статус", emoji: "📊", style: ButtonStyle.Primary },
      { id: "help", label: "Help", emoji: "❓" },
      { id: "search_query_modal", label: "Поиск", emoji: "🔍" },
      { id: "queue_status", label: "Queue", emoji: "📬" },
      { id: "mood_status", label: "Mood", emoji: "🎭" },
      { id: "profile_self", label: "Мой профиль", emoji: "👤" },
      { id: "memory_self", label: "Моя память", emoji: "💭" }
    ],
    persona: [
      { id: "style_status", label: "Snapshot", emoji: "📋", style: ButtonStyle.Primary },
      { id: "style_edit_modal", label: "Редактор", emoji: "✏️", modOnly: true, style: ButtonStyle.Primary },
      { id: "style_default", label: "Живой preset", emoji: "🔄", modOnly: true },
      { id: "mood_playful", label: "Playful", emoji: "🎉", modOnly: true },
      { id: "mood_normal", label: "Normal", emoji: "😐", modOnly: true },
      featureAction("playful_mode_enabled", true, "Playful ON", { emoji: "✅", modOnly: true }),
      featureAction("playful_mode_enabled", false, "Playful OFF", { emoji: "❌", modOnly: true }),
      featureAction("irritated_mode_enabled", true, "Irritated ON", { emoji: "✅", modOnly: true }),
      featureAction("irritated_mode_enabled", false, "Irritated OFF", { emoji: "❌", modOnly: true }),
      featureAction("roast", true, "Roast ON", { emoji: "✅", modOnly: true }),
      featureAction("roast", false, "Roast OFF", { emoji: "❌", modOnly: true })
    ],
    behavior: [
      { id: "read_chat_on", label: "Читать чат", emoji: "📖", modOnly: true, style: ButtonStyle.Primary },
      { id: "read_chat_off", label: "Тихий режим", emoji: "🔇", modOnly: true },
      { id: "natural_split_on", label: "Split ON", emoji: "✂️", modOnly: true },
      { id: "natural_split_off", label: "Split OFF", emoji: "📃", modOnly: true },
      featureAction("auto_interject", true, "Interject ON", { emoji: "✅", modOnly: true }),
      featureAction("auto_interject", false, "Interject OFF", { emoji: "❌", modOnly: true }),
      featureAction("reply_queue_enabled", true, "Queue ON", { emoji: "✅", modOnly: true }),
      featureAction("reply_queue_enabled", false, "Queue OFF", { emoji: "❌", modOnly: true }),
      featureAction("media_reactions_enabled", true, "Media ON", { emoji: "✅", modOnly: true }),
      featureAction("media_reactions_enabled", false, "Media OFF", { emoji: "❌", modOnly: true }),
      featureAction("selective_engagement_enabled", true, "Engage ON", { emoji: "✅", modOnly: true }),
      featureAction("selective_engagement_enabled", false, "Engage OFF", { emoji: "❌", modOnly: true }),
      { id: "media_sync", label: "GIF pack", emoji: "🎞️", ownerOnly: true },
      { id: "media_list", label: "Media list", emoji: "📋" }
    ],
    memory: [
      { id: "memory_status", label: "Memory", emoji: "🧠", style: ButtonStyle.Primary },
      { id: "memory_build_channel", label: "Build канал", emoji: "🔨", modOnly: true },
      { id: "memory_build_server", label: "Build сервер", emoji: "🏗️", ownerOnly: true },
      featureAction("topic_engine_enabled", true, "Topic ON", { emoji: "✅", modOnly: true }),
      featureAction("topic_engine_enabled", false, "Topic OFF", { emoji: "❌", modOnly: true }),
      featureAction("memory_album_enabled", true, "Album ON", { emoji: "✅", modOnly: true }),
      featureAction("memory_album_enabled", false, "Album OFF", { emoji: "❌", modOnly: true }),
      featureAction("interaction_requests_enabled", true, "Requests ON", { emoji: "✅", modOnly: true }),
      featureAction("interaction_requests_enabled", false, "Requests OFF", { emoji: "❌", modOnly: true }),
      { id: "summary_current", label: "Summary", emoji: "📝" },
      { id: "topic_status", label: "Topic", emoji: "💬" },
      { id: "reflection_list", label: "Lessons", emoji: "📚" },
      { id: "profile_self", label: "Мой профиль", emoji: "👤" },
      { id: "dossier_modal", label: "Досье", emoji: "🔎", ownerOnly: true, style: ButtonStyle.Primary },
      { id: "relationship_self", label: "Отношение", emoji: "💞" },
      { id: "relationship_edit_modal", label: "Edit relation", emoji: "✏️", ownerOnly: true },
      { id: "relationship_hint", label: "Hints", emoji: "💡", ownerOnly: true }
    ],
    channels: [
      { id: "channel_policy", label: "Policy", emoji: "📋", style: ButtonStyle.Primary },
      { id: "channel_edit_modal", label: "Edit channel", emoji: "✏️", modOnly: true },
      { id: "topic_status", label: "Topic", emoji: "💬" },
      { id: "topic_reset", label: "Reset topic", emoji: "🗑️", modOnly: true },
      { id: "queue_status", label: "Queue", emoji: "📬" },
      { id: "queue_clear", label: "Clear queue", emoji: "🧹", modOnly: true },
      { id: "summary_current", label: "Summary", emoji: "📝" },
      { id: "memory_status", label: "Memory канала", emoji: "🧠" },
      { id: "search_query_modal", label: "Поиск", emoji: "🔍", style: ButtonStyle.Primary },
      { id: "search_diagnose", label: "Диагностика", emoji: "🩺" },
      featureAction("web_search", true, "Search ON", { emoji: "✅", modOnly: true }),
      featureAction("web_search", false, "Search OFF", { emoji: "❌", modOnly: true }),
      featureAction("link_understanding_enabled", true, "Links ON", { emoji: "✅", modOnly: true }),
      featureAction("link_understanding_enabled", false, "Links OFF", { emoji: "❌", modOnly: true })
    ],
    llm: [
      { id: "llm_panel", label: "LLM models", emoji: "🤖", ownerOnly: true, style: ButtonStyle.Primary },
      { id: "state_brain", label: "Brain", emoji: "🧠", ownerOnly: true },
      { id: "state_tokens", label: "Tokens", emoji: "🪙", ownerOnly: true },
      { id: "debug_latest", label: "Latest trace", emoji: "🔬", ownerOnly: true },
      { id: "power_panel", label: "Power", emoji: "⚡", ownerOnly: true }
    ],
    system: [
      { id: "state_panel", label: "State", emoji: "📡", ownerOnly: true, style: ButtonStyle.Primary },
      { id: "llm_panel", label: "LLM models", emoji: "🤖", ownerOnly: true, style: ButtonStyle.Primary },
      { id: "power_panel", label: "Power", emoji: "⚡", ownerOnly: true, style: ButtonStyle.Primary },
      { id: "ai_url_modal", label: "AI URL", emoji: "🔗", ownerOnly: true },
      { id: "lockdown_status", label: "Lockdown?", emoji: "🔒", ownerOnly: true },
      { id: "lockdown_on", label: "Lockdown ON", emoji: "🚨", ownerOnly: true, style: ButtonStyle.Danger },
      { id: "lockdown_off", label: "Lockdown OFF", emoji: "🔓", ownerOnly: true },
      { id: "debug_latest", label: "Latest trace", emoji: "🔬", style: ButtonStyle.Primary },
      { id: "feature_status", label: "Фичи", emoji: "🏷️" },
      { id: "search_diagnose", label: "Search diag", emoji: "🩺" },
      { id: "stats_week", label: "Stats", emoji: "📊" },
      featureAction("anti_slop_strict_mode", true, "Strict ON", { emoji: "✅", modOnly: true }),
      featureAction("anti_slop_strict_mode", false, "Strict OFF", { emoji: "❌", modOnly: true }),
      featureAction("context_confidence_enabled", true, "Ctx conf ON", { emoji: "✅", modOnly: true }),
      featureAction("context_confidence_enabled", false, "Ctx conf OFF", { emoji: "❌", modOnly: true }),
      featureAction("context_actions", true, "Ctx actions ON", { emoji: "✅", modOnly: true }),
      featureAction("context_actions", false, "Ctx actions OFF", { emoji: "❌", modOnly: true }),
      featureAction("channel_aware_mode", true, "Channel-aware ON", { emoji: "✅", modOnly: true }),
      featureAction("channel_aware_mode", false, "Channel-aware OFF", { emoji: "❌", modOnly: true }),
      featureAction("message_kind_aware_mode", true, "Kind-aware ON", { emoji: "✅", modOnly: true }),
      featureAction("message_kind_aware_mode", false, "Kind-aware OFF", { emoji: "❌", modOnly: true }),
      featureAction("self_reflection_lessons_enabled", true, "Reflect ON", { emoji: "✅", modOnly: true }),
      featureAction("self_reflection_lessons_enabled", false, "Reflect OFF", { emoji: "❌", modOnly: true }),
      { id: "reflection_status", label: "Reflection", emoji: "🪞" },
      { id: "state_trace", label: "Trace", emoji: "📜", ownerOnly: true },
      { id: "state_tokens", label: "Tokens", emoji: "🪙", ownerOnly: true },
      { id: "state_search", label: "Search state", emoji: "🔎", ownerOnly: true }
    ]
  };

  return byTab[tab].filter((action) => {
    if (action.ownerOnly) return isOwner;
    if (action.modOnly) return isOwner || isModerator;
    return true;
  });
}

function parseHoriPanelTab(value: string | null | undefined): HoriPanelTab | null {
  return HORI_PANEL_TABS.includes(value as HoriPanelTab) ? (value as HoriPanelTab) : null;
}

function horiTabLabel(tab: HoriPanelTab) {
  const labels: Record<HoriPanelTab, string> = {
    main: "🏠 Главная",
    persona: "🎭 Персона",
    behavior: "⚡ Поведение",
    memory: "🧠 Память и люди",
    channels: "📡 Каналы и поиск",
    llm: "🤖 LLM",
    system: "⚙️ Система"
  };
  return labels[tab];
}

function inferTabForHoriAction(action: string): HoriPanelTab {
  const featureToggle = parsePanelFeatureToggleAction(action);
  if (featureToggle) {
    return inferPanelTabForFeatureKey(featureToggle.key);
  }

  if (action.startsWith("memory") || action.startsWith("reflection") || action.startsWith("profile") || action.startsWith("relationship") || action === "dossier_modal") return "memory";
  if (action.startsWith("search") || action.startsWith("channel") || action === "read_chat_on" || action === "read_chat_off" || action.startsWith("topic") || action.startsWith("queue") || action === "summary_current") return "channels";
  if (action.startsWith("llm")) return "llm";
  if (action.startsWith("lockdown") || action === "power_panel" || action === "state_panel" || action === "ai_url_modal" || action.startsWith("debug") || action === "feature_status" || action === "stats_week" || action.startsWith("state_")) return "system";
  if (action.startsWith("style") || action.startsWith("mood")) return "persona";
  if (action.startsWith("natural") || action === "media_list" || action === "media_sync") return "behavior";
  return "main";
}

function horiActionTitle(action: string) {
  const featureToggle = parsePanelFeatureToggleAction(action);
  if (featureToggle) {
    return `${PANEL_FEATURE_LABELS[featureToggle.key]}: ${featureToggle.enabled ? "on" : "off"}`;
  }

  const titles: Record<string, string> = {
    status: "Быстрый статус",
    help: "Help",
    search_query_modal: "Поиск",
    style_status: "Persona snapshot",
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
    llm_panel: "LLM models",
    debug_latest: "Latest trace"
  };

  return titles[action] ?? "Panel action";
}

function featureAction(key: PanelFeatureKey, enabled: boolean, label: string, options: Omit<HoriPanelAction, "id" | "label"> = {}): HoriPanelAction {
  return {
    id: `feature_${key}_${enabled ? "on" : "off"}`,
    label,
    style: enabled ? ButtonStyle.Success : ButtonStyle.Secondary,
    ...options
  };
}

function parsePanelFeatureToggleAction(action: string): { key: PanelFeatureKey; enabled: boolean } | null {
  if (!action.startsWith("feature_")) {
    return null;
  }

  if (action.endsWith("_on")) {
    const key = action.slice("feature_".length, -3) as PanelFeatureKey;
    return key in PANEL_FEATURE_LABELS ? { key, enabled: true } : null;
  }

  if (action.endsWith("_off")) {
    const key = action.slice("feature_".length, -4) as PanelFeatureKey;
    return key in PANEL_FEATURE_LABELS ? { key, enabled: false } : null;
  }

  return null;
}

function inferPanelTabForFeatureKey(key: PanelFeatureKey): HoriPanelTab {
  switch (key) {
    case "web_search":
    case "link_understanding_enabled":
      return "channels";
    case "auto_interject":
    case "reply_queue_enabled":
    case "media_reactions_enabled":
    case "selective_engagement_enabled":
      return "behavior";
    case "playful_mode_enabled":
    case "irritated_mode_enabled":
    case "roast":
      return "persona";
    case "topic_engine_enabled":
    case "memory_album_enabled":
    case "interaction_requests_enabled":
      return "memory";
    case "anti_slop_strict_mode":
    case "context_confidence_enabled":
    case "channel_aware_mode":
    case "message_kind_aware_mode":
    case "context_actions":
    case "self_reflection_lessons_enabled":
      return "system";
  }
}

async function applyPanelFeatureToggle(runtime: BotRuntime, guildId: string, key: PanelFeatureKey, enabled: boolean) {
  return [
    await runtime.slashAdmin.updateFeature(guildId, key, enabled),
    "",
    await buildFeatureStatus(runtime, guildId)
  ].join("\n");
}

function buildHoriDetailEmbed(title: string, body: string) {
  return new EmbedBuilder()
    .setTitle(title)
    .setColor(0x2B2D31)
    .setDescription(clipPanelText(body));
}

async function buildLlmPanelResponse(runtime: BotRuntime, selectedSlot: ModelRoutingSlot = "chat", guildId?: string) {
  const [status, hydeStatus, embedStatus] = await Promise.all([
    runtime.runtimeConfig.getModelRoutingStatus(),
    runtime.runtimeConfig.getMemoryHydeStatus(),
    runtime.runtimeConfig.getOpenAIEmbeddingDimensionsStatus()
  ]);
  const activeSlot = MODEL_ROUTING_SLOTS.includes(selectedSlot) ? selectedSlot : "chat";
  const activeModel = status.slots[activeSlot];
  const preset = MODEL_ROUTING_PRESETS[status.preset];
  const embeddingStatus = formatEmbeddingStatus(status);
  const ignoredOverrides = status.storedOverrides && Object.keys(status.storedOverrides).length
    ? Object.entries(status.storedOverrides).map(([slot, model]) => `${slot}=${model}`).join(", ")
    : null;
  const controlsStatus = status.controlsEditable ? "editable" : "informational-only";
  const telemetry = guildId ? await buildLlmTelemetry(runtime, guildId) : "Открой панель внутри сервера, чтобы увидеть telemetry.";
  const updated = status.updatedAt
    ? `\nupdated=${status.updatedAt.toISOString()}${status.updatedBy ? ` by ${status.updatedBy}` : ""}`
    : "";
  const parseWarning = status.parseError ? `\n\nRouting JSON был проигнорирован: ${status.parseError}` : "";

  return {
    content: "",
    embeds: [
      new EmbedBuilder()
        .setTitle("🤖 Hori LLM Models")
        .setColor(0x57F287)
        .setDescription([
          `Preset: **${status.preset}** (${preset.label})`,
          `Provider: **${status.provider}** · source=${status.source}${updated}`,
          `Model controls: **${controlsStatus}**`,
          `Selected slot: **${activeSlot}** -> \`${activeModel}\``,
          ...(status.storedPreset ? [`Ignored stored preset: \`${status.storedPreset}\``] : []),
          ...(ignoredOverrides ? [`Ignored stored overrides: \`${ignoredOverrides}\``] : []),
          ...(status.controlsNote ? [status.controlsNote] : []),
          "",
          `Embeddings: \`${embeddingStatus}\``,
          `HyDE retrieval: **${hydeStatus.value ? "on" : "off"}** (${hydeStatus.source})`,
          embedStatus.source === "unsupported"
            ? "OpenAI embedding dimensions: n/a for Ollama"
            : `OpenAI embedding dimensions: **${embedStatus.value}** (${embedStatus.source})`,
          "Backfill before a real dim cutover: `pnpm reembed:openai --target-dimensions 512 --apply`.",
          parseWarning
        ].filter(Boolean).join("\n"))
        .addFields(
          { name: "Slots", value: clipFieldText(formatLlmSlots(status.slots, status.overrides, activeSlot)) },
          {
            name: "Legacy fallback",
            value: clipFieldText(`chat=${status.legacyFallback.chat}\nsmart=${status.legacyFallback.smart}\nembed=${embeddingStatus}`),
            inline: true
          },
          {
            name: "Runtime controls",
            value: clipFieldText([
              `HyDE=${hydeStatus.value ? "on" : "off"} (${hydeStatus.source})`,
              embedStatus.source === "unsupported"
                ? "embedDims=native"
                : `embedDims=${embedStatus.value} (${embedStatus.source})`
            ].join("\n")),
            inline: true
          },
          { name: "Telemetry", value: clipFieldText(telemetry) }
        )
    ],
    components: buildLlmPanelRows(status.preset, activeSlot, activeModel, {
      provider: status.provider,
      controlsEditable: status.controlsEditable,
      hydeEnabled: hydeStatus.value,
      supportsEmbeddingDimensions: embedStatus.source !== "unsupported",
      embedDimensions: embedStatus.source === "unsupported" ? undefined : embedStatus.value
    })
  };
}

function buildLlmPanelRows(
  activePreset: string,
  activeSlot: ModelRoutingSlot,
  activeModel: string,
  runtime: {
    provider: "openai" | "ollama" | "router";
    controlsEditable: boolean;
    hydeEnabled: boolean;
    supportsEmbeddingDimensions: boolean;
    embedDimensions?: number;
  }
) {
  const runtimeOptions = [
    {
      label: runtime.hydeEnabled ? "HyDE: OFF" : "HyDE: ON",
      value: runtime.hydeEnabled ? "hyde:off" : "hyde:on",
      description: runtime.hydeEnabled ? "Disable HyDE retrieval expansion" : "Enable HyDE retrieval expansion"
    },
    {
      label: "HyDE: reset",
      value: "hyde:reset",
      description: "Return HyDE to env default"
    },
    ...(runtime.supportsEmbeddingDimensions
      ? SUPPORTED_OPENAI_EMBEDDING_DIMENSIONS.map((dimensions) => ({
          label: `Embeddings: ${dimensions} dims`,
          value: `embed:${dimensions}`,
          description: runtime.embedDimensions === dimensions ? "Current runtime value" : "Set live OpenAI embedding dimensions",
          default: runtime.embedDimensions === dimensions
        })).concat({
          label: "Embeddings: reset",
          value: "embed:reset",
          description: "Return embedding dimensions to env default"
        })
      : [])
  ];

  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`${LLM_PANEL_PREFIX}:preset`)
        .setPlaceholder(runtime.controlsEditable ? "LLM preset" : "LLM preset (informational-only)")
        .setDisabled(!runtime.controlsEditable)
        .addOptions(
          ...Object.entries(MODEL_ROUTING_PRESETS).map(([value, preset]) => ({
            label: preset.label,
            value,
            description: preset.description.slice(0, 100),
            default: value === activePreset
          }))
        )
    ),
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`${LLM_PANEL_PREFIX}:slot`)
        .setPlaceholder(runtime.controlsEditable ? "LLM slot" : "Inspect slot (read-only)")
        .addOptions(
          ...MODEL_ROUTING_SLOTS.map((slot) => ({
            label: slot,
            value: slot,
            default: slot === activeSlot
          }))
        )
    ),
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`${LLM_PANEL_PREFIX}:model:${activeSlot}`)
        .setPlaceholder(runtime.controlsEditable ? `Model for ${activeSlot}` : `Model for ${activeSlot} (read-only)`)
        .setDisabled(!runtime.controlsEditable)
        .addOptions(
          ...MODEL_ROUTING_MODEL_IDS.map((model) => ({
            label: model,
            value: model,
            default: model === activeModel
          }))
        )
    ),
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`${LLM_PANEL_PREFIX}:runtime`)
        .setPlaceholder("Runtime controls")
        .addOptions(...runtimeOptions)
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${LLM_PANEL_PREFIX}:reset-slot:${activeSlot}`)
        .setLabel("Reset slot")
        .setDisabled(!runtime.controlsEditable)
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${LLM_PANEL_PREFIX}:reset-all:${activeSlot}`)
        .setLabel("Reset all")
        .setDisabled(!runtime.controlsEditable)
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`${HORI_ACTION_PREFIX}:panel_home`)
        .setLabel("Panel")
        .setEmoji("🏠")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${HORI_ACTION_PREFIX}:state_brain`)
        .setLabel("Brain")
        .setEmoji("🧠")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${HORI_ACTION_PREFIX}:state_tokens`)
        .setLabel("Tokens")
        .setEmoji("🪙")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

function formatLlmSlots(
  slots: Record<ModelRoutingSlot, string>,
  overrides: Partial<Record<ModelRoutingSlot, string>>,
  activeSlot: ModelRoutingSlot
) {
  return MODEL_ROUTING_SLOTS
    .map((slot) => {
      const active = slot === activeSlot ? ">" : " ";
      const override = overrides[slot] ? "*" : " ";
      return `${active}${override} ${slot}: ${slots[slot]}`;
    })
    .join("\n");
}

function formatEmbeddingStatus(status: { embeddingModel: string; embeddingDimensions?: number }) {
  return status.embeddingDimensions
    ? `${status.embeddingModel} @ ${status.embeddingDimensions} dims`
    : status.embeddingModel;
}

async function buildLlmTelemetry(runtime: BotRuntime, guildId: string) {
  const rows = await runtime.prisma.botEventLog.findMany({
    where: {
      guildId,
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    },
    orderBy: { createdAt: "desc" },
    take: 300,
    select: {
      createdAt: true,
      debugTrace: true
    }
  });
  const calls = rows.flatMap((row) =>
    extractTraceLlmCalls(row.debugTrace).map((call) => ({
      ...call,
      createdAt: row.createdAt
    }))
  );

  if (!calls.length) {
    return "Пока нет llmCalls в trace.";
  }

  const latest = calls
    .slice(0, 5)
    .map((call) => `${call.purpose}:${call.model} ${call.promptTokens}/${call.completionTokens}`)
    .join("\n");
  const day = summarizeTraceCalls(calls.filter((call) => call.createdAt.getTime() >= Date.now() - 24 * 60 * 60 * 1000));
  const week = summarizeTraceCalls(calls);

  return clipPanelText([
    "Latest:",
    latest,
    "",
    "24h:",
    day || "нет данных",
    "",
    "7d:",
    week || "нет данных"
  ].join("\n"), 1000);
}

function extractTraceLlmCalls(debugTrace: unknown) {
  if (!debugTrace || typeof debugTrace !== "object") {
    return [];
  }

  const calls = (debugTrace as { llmCalls?: unknown }).llmCalls;
  if (!Array.isArray(calls)) {
    return [];
  }

  return calls.flatMap((call) => {
    if (!call || typeof call !== "object") {
      return [];
    }

    const record = call as Record<string, unknown>;
    const purpose = typeof record.purpose === "string" ? record.purpose : "unknown";
    const model = typeof record.model === "string" ? record.model : "unknown";
    const promptTokens = typeof record.promptTokens === "number" ? record.promptTokens : 0;
    const completionTokens = typeof record.completionTokens === "number" ? record.completionTokens : 0;
    const totalTokens = typeof record.totalTokens === "number" ? record.totalTokens : promptTokens + completionTokens;

    return [{ purpose, model, promptTokens, completionTokens, totalTokens }];
  });
}

function summarizeTraceCalls(calls: Array<{ purpose: string; model: string; promptTokens: number; completionTokens: number; totalTokens: number }>) {
  const groups = new Map<string, { calls: number; promptTokens: number; completionTokens: number; totalTokens: number }>();

  for (const call of calls) {
    const key = `${call.purpose}:${call.model}`;
    const current = groups.get(key) ?? { calls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    current.calls += 1;
    current.promptTokens += call.promptTokens;
    current.completionTokens += call.completionTokens;
    current.totalTokens += call.totalTokens;
    groups.set(key, current);
  }

  return [...groups.entries()]
    .sort(([, a], [, b]) => b.totalTokens - a.totalTokens)
    .slice(0, 6)
    .map(([key, value]) => `${key} x${value.calls} ${value.promptTokens}/${value.completionTokens}`)
    .join("\n");
}

function clipFieldText(value: string, max = 1024) {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value || "none";
}

function buildPowerPanelResponse(content: string, activeProfile: (typeof POWER_PROFILES)[number]) {
  return {
    content: "",
    embeds: [buildHoriDetailEmbed("⚡ Hori Power Panel", content)],
    components: [
      ...buildPowerPanelRows(activeProfile),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`${HORI_ACTION_PREFIX}:panel_home`).setLabel("Panel").setEmoji("🏠").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`${HORI_ACTION_PREFIX}:state_brain`).setLabel("Brain").setEmoji("🧠").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`${HORI_ACTION_PREFIX}:state_tokens`).setLabel("Tokens").setEmoji("🪙").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`${HORI_ACTION_PREFIX}:llm_panel`).setLabel("LLM").setEmoji("🤖").setStyle(ButtonStyle.Secondary)
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
    "📊 **Hori status**",
    "",
    `⚡ ${power}`,
    `🔒 Owner lockdown: ${lockdown.enabled ? "**ON**" : "off"}`,
    "",
    `🧠 ${memory}`
  ].join("\n");
}

async function buildFeatureStatus(runtime: BotRuntime, guildId: string) {
  const flags = await runtime.runtimeConfig.getFeatureFlags(guildId);
  return Object.entries(flags)
    .map(([key, value]) => `${value ? "🟢" : "🔴"} ${key}`)
    .join("\n")
    .slice(0, 1900);
}

async function buildChannelPolicyStatus(runtime: BotRuntime, guildId: string, channelId: string) {
  const policy = await runtime.runtimeConfig.getChannelPolicy(guildId, channelId);
  return [
    `📡 **Channel policy** · <#${channelId}>`,
    "",
    `${policy.allowBotReplies ? "🟢" : "🔴"} Ответы бота: **${policy.allowBotReplies ? "да" : "нет"}**`,
    `${policy.allowInterjections ? "🟢" : "🔴"} Интерджекции: **${policy.allowInterjections ? "да" : "нет"}**`,
    `${policy.isMuted ? "🔇" : "🔊"} Muted: **${policy.isMuted ? "да" : "нет"}**`,
    `📏 Длина: **${policy.responseLengthOverride ?? "inherit"}**`,
    `🏷️ Теги: ${policy.topicInterestTags.join(", ") || "—"}`
  ].join("\n");
}

async function buildStyleStatus(runtime: BotRuntime, guildId: string) {
  const s = await runtime.runtimeConfig.getGuildSettings(guildId);
  const bar = (val: number, max = 5) => "▓".repeat(val) + "░".repeat(max - val);
  return [
    `🎭 **Persona snapshot**`,
    "",
    `📛 Имя: **${s.botName}** · Язык: **${s.preferredLanguage}**`,
    `🗣️ Roughness: ${bar(s.roughnessLevel)} ${s.roughnessLevel}/5`,
    `😏 Sarcasm: ${bar(s.sarcasmLevel)} ${s.sarcasmLevel}/5`,
    `🔥 Roast: ${bar(s.roastLevel)} ${s.roastLevel}/5`,
    `💬 Interject: ${bar(s.interjectTendency)} ${s.interjectTendency}/5`,
    `📏 Длина: **${s.replyLength}**`,
    `✍️ Стиль: ${s.preferredStyle || "—"}`,
    `🚫 Запреты: ${[...s.forbiddenWords, ...s.forbiddenTopics].join(", ") || "—"}`
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
    "🩺 **Search diagnostics**",
    "",
    `${runtime.env.BRAVE_SEARCH_API_KEY ? "🟢" : "🔴"} BRAVE_SEARCH_API_KEY: ${runtime.env.BRAVE_SEARCH_API_KEY ? "set" : "**missing**"}`,
    `⏱️ COOLDOWN: ${runtime.env.SEARCH_USER_COOLDOWN_SEC}s`,
    `🔢 MAX_REQUESTS: ${runtime.env.SEARCH_MAX_REQUESTS_PER_RESPONSE} · MAX_PAGES: ${runtime.env.SEARCH_MAX_PAGES_PER_RESPONSE}`,
    `🚫 DENYLIST: ${runtime.env.SEARCH_DOMAIN_DENYLIST.join(", ") || "—"}`,
    `${runtime.env.OLLAMA_BASE_URL ? "🟢" : "🔴"} OLLAMA: ${runtime.env.OLLAMA_BASE_URL ?? "**missing**"}`,
    `🤖 Model: ${runtime.env.OLLAMA_SMART_MODEL} · Timeout: ${runtime.env.OLLAMA_TIMEOUT_MS}ms`
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

function buildDossierModal() {
  const modal = new ModalBuilder()
    .setCustomId(`${HORI_MODAL_PREFIX}:dossier`)
    .setTitle("Owner dossier");

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("userId")
        .setLabel("Discord user ID")
        .setPlaceholder("123456789012345678")
        .setRequired(true)
        .setMaxLength(40)
        .setStyle(TextInputStyle.Short)
    )
  );

  return modal;
}

function buildStyleModal(current?: {
  botName: string;
  preferredLanguage: string;
  roughnessLevel: number;
  sarcasmLevel: number;
  roastLevel: number;
  interjectTendency: number;
  replyLength: string;
  preferredStyle: string;
  forbiddenWords: string[];
  forbiddenTopics: string[];
}) {
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
        .setValue(current?.botName ?? "")
        .setMaxLength(40)
        .setStyle(TextInputStyle.Short)
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("levels")
        .setLabel("roughness,sarcasm,roast")
        .setPlaceholder("2,3,2")
        .setRequired(false)
        .setValue(current ? `${current.roughnessLevel},${current.sarcasmLevel},${current.roastLevel}` : "")
        .setMaxLength(30)
        .setStyle(TextInputStyle.Short)
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("replyLength")
        .setLabel("replyLength,language,interject")
        .setPlaceholder("short,ru,1")
        .setRequired(false)
        .setValue(current ? `${current.replyLength},${current.preferredLanguage},${current.interjectTendency}` : "")
        .setMaxLength(20)
        .setStyle(TextInputStyle.Short)
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("preferredStyle")
        .setLabel("Стиль")
        .setRequired(false)
        .setValue(current?.preferredStyle ?? "")
        .setMaxLength(900)
        .setStyle(TextInputStyle.Paragraph)
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("forbidden")
        .setLabel("forbiddenWords | forbiddenTopics")
        .setPlaceholder("слово1,слово2 | тема1,тема2")
        .setRequired(false)
        .setValue(current ? `${current.forbiddenWords.join(", ")} | ${current.forbiddenTopics.join(", ")}` : "")
        .setMaxLength(400)
        .setStyle(TextInputStyle.Paragraph)
    )
  );

  return modal;
}

function buildChannelModal(
  channelId: string,
  current?: {
    allowBotReplies: boolean;
    allowInterjections: boolean;
    isMuted: boolean;
    topicInterestTags: string[];
    responseLengthOverride?: string | null;
  }
) {
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
        .setValue(booleanToFieldValue(current?.allowBotReplies))
        .setMaxLength(10)
        .setStyle(TextInputStyle.Short)
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("allowInterjections")
        .setLabel("allowInterjections")
        .setPlaceholder("true / false / пусто")
        .setRequired(false)
        .setValue(booleanToFieldValue(current?.allowInterjections))
        .setMaxLength(10)
        .setStyle(TextInputStyle.Short)
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("isMuted")
        .setLabel("isMuted")
        .setPlaceholder("true / false / пусто")
        .setRequired(false)
        .setValue(booleanToFieldValue(current?.isMuted))
        .setMaxLength(10)
        .setStyle(TextInputStyle.Short)
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("responseLengthOverride")
        .setLabel("responseLengthOverride")
        .setPlaceholder("short / medium / long / inherit")
        .setRequired(false)
        .setValue(current?.responseLengthOverride ?? "")
        .setMaxLength(20)
        .setStyle(TextInputStyle.Short)
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("topicInterestTags")
        .setLabel("topicInterestTags")
        .setPlaceholder("мемы,тех,игры")
        .setRequired(false)
        .setValue(current?.topicInterestTags.join(", ") ?? "")
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
  const profileEmoji: Record<string, string> = { economy: "🌱", balanced: "⚖️", expanded: "🚀", max: "💎" };
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      ...POWER_PROFILES.map((profile) =>
        new ButtonBuilder()
          .setCustomId(`${POWER_PANEL_PREFIX}:apply:${profile}`)
          .setLabel(profile)
          .setEmoji(profileEmoji[profile])
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

function readTextList(value: string) {
  return value.split(",").map((part) => part.trim());
}

function readIntegerText(value: string | undefined, min: number, max: number) {
  if (!value?.trim()) {
    return undefined;
  }

  const parsed = Number(value.trim());
  return Number.isInteger(parsed) ? Math.max(min, Math.min(max, parsed)) : undefined;
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

function parseReplyLengthSelection(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();

  if (!normalized) {
    return undefined;
  }

  if (["inherit", "default", "none", "reset", "clear"].includes(normalized)) {
    return null;
  }

  return normalized === "short" || normalized === "medium" || normalized === "long" ? normalized : undefined;
}

function booleanToFieldValue(value: boolean | undefined) {
  return value === undefined ? "" : value ? "true" : "false";
}
