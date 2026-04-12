import {
  ChatInputCommandInteraction,
  ContextMenuCommandInteraction,
  MessageFlags,
  PermissionFlagsBits
} from "discord.js";

import { CONTEXT_ACTIONS, asErrorMessage, persistOllamaBaseUrl, type PersonaMode } from "@hori/shared";
import { RelationshipService } from "@hori/memory";

import type { BotRuntime } from "../bootstrap";

function ensureModerator(interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
}

export async function routeInteraction(runtime: BotRuntime, interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction) {
  if (interaction.isChatInputCommand()) {
    if (!interaction.guildId) {
      await interaction.reply({ content: "Только внутри сервера.", flags: MessageFlags.Ephemeral });
      return;
    }

    const isModerator = ensureModerator(interaction);

    if (!isModerator && interaction.commandName !== "bot-help") {
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
      case "bot-media": {
        const subcommand = interaction.options.getSubcommand();
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
