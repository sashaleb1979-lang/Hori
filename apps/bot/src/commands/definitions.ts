import {
  ApplicationCommandType,
  ChannelType,
  ContextMenuCommandBuilder,
  SlashCommandBuilder
} from "discord.js";

import { CONTEXT_ACTIONS } from "@hori/shared";

export const slashCommandDefinitions = [
  new SlashCommandBuilder().setName("bot-help").setDescription("Короткая справка по админ-командам"),
  new SlashCommandBuilder()
    .setName("bot-style")
    .setDescription("Настроить стиль Хори")
    .addStringOption((option) => option.setName("bot-name").setDescription("Имя бота"))
    .addIntegerOption((option) => option.setName("roughness").setDescription("Грубость 0-5").setMinValue(0).setMaxValue(5))
    .addIntegerOption((option) => option.setName("sarcasm").setDescription("Сарказм 0-5").setMinValue(0).setMaxValue(5))
    .addIntegerOption((option) => option.setName("roast").setDescription("Стёб 0-5").setMinValue(0).setMaxValue(5))
    .addStringOption((option) =>
      option
        .setName("reply-length")
        .setDescription("Предпочтительная длина")
        .addChoices(
          { name: "short", value: "short" },
          { name: "medium", value: "medium" },
          { name: "long", value: "long" }
        )
    )
    .addStringOption((option) => option.setName("preferred-style").setDescription("Предпочтительный стиль речи"))
    .addStringOption((option) => option.setName("forbidden-words").setDescription("CSV список запрещённых слов"))
    .addStringOption((option) => option.setName("forbidden-topics").setDescription("CSV список запрещённых тем")),
  new SlashCommandBuilder()
    .setName("bot-memory")
    .setDescription("Управлять долгой памятью")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remember")
        .setDescription("Запомнить факт")
        .addStringOption((option) => option.setName("key").setDescription("Ключ").setRequired(true))
        .addStringOption((option) => option.setName("value").setDescription("Значение").setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("forget")
        .setDescription("Забыть факт")
        .addStringOption((option) => option.setName("key").setDescription("Ключ").setRequired(true))
    ),
  new SlashCommandBuilder()
    .setName("bot-album")
    .setDescription("Личный альбом сохранённых моментов")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("list")
        .setDescription("Показать последние сохранённые моменты")
        .addIntegerOption((option) => option.setName("limit").setDescription("Сколько показать").setMinValue(1).setMaxValue(10))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Удалить момент из своего альбома")
        .addStringOption((option) => option.setName("id").setDescription("ID момента").setRequired(true))
    ),
  new SlashCommandBuilder()
    .setName("bot-relationship")
    .setDescription("Настроить отношение к пользователю")
    .addUserOption((option) => option.setName("user").setDescription("Пользователь").setRequired(true))
    .addStringOption((option) => option.setName("tone-bias").setDescription("neutral, friendly, sharp, playful"))
    .addIntegerOption((option) => option.setName("roast-level").setDescription("0-5").setMinValue(0).setMaxValue(5))
    .addIntegerOption((option) => option.setName("praise-bias").setDescription("0-5").setMinValue(0).setMaxValue(5))
    .addIntegerOption((option) => option.setName("interrupt-priority").setDescription("0-5").setMinValue(0).setMaxValue(5))
    .addBooleanOption((option) => option.setName("do-not-mock").setDescription("Не подкалывать"))
    .addBooleanOption((option) => option.setName("do-not-initiate").setDescription("Не инициировать общение"))
    .addStringOption((option) => option.setName("protected-topics").setDescription("CSV protected topics")),
  new SlashCommandBuilder()
    .setName("bot-feature")
    .setDescription("Переключить feature flag")
    .addStringOption((option) =>
      option.setName("key").setDescription("Название флага").setRequired(true)
    )
    .addBooleanOption((option) => option.setName("enabled").setDescription("Включить/выключить").setRequired(true)),
  new SlashCommandBuilder()
    .setName("bot-debug")
    .setDescription("Получить debug trace по сообщению")
    .addStringOption((option) => option.setName("message-id").setDescription("ID сообщения").setRequired(true)),
  new SlashCommandBuilder()
    .setName("bot-profile")
    .setDescription("Посмотреть профиль пользователя")
    .addUserOption((option) => option.setName("user").setDescription("Пользователь").setRequired(true)),
  new SlashCommandBuilder()
    .setName("bot-channel")
    .setDescription("Настроить канал")
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Канал")
        .addChannelTypes(ChannelType.GuildText, ChannelType.PublicThread, ChannelType.PrivateThread)
        .setRequired(true)
    )
    .addBooleanOption((option) => option.setName("allow-bot-replies").setDescription("Разрешить ответы"))
    .addBooleanOption((option) => option.setName("allow-interjections").setDescription("Разрешить автовмешательства"))
    .addBooleanOption((option) => option.setName("is-muted").setDescription("Хори должна молчать"))
    .addStringOption((option) => option.setName("topic-interest-tags").setDescription("CSV tags")),
  new SlashCommandBuilder()
    .setName("bot-summary")
    .setDescription("Показать последние channel summaries")
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Канал")
        .addChannelTypes(ChannelType.GuildText, ChannelType.PublicThread, ChannelType.PrivateThread)
        .setRequired(true)
    ),
  new SlashCommandBuilder().setName("bot-stats").setDescription("Показать недельную статистику"),
  new SlashCommandBuilder()
    .setName("bot-topic")
    .setDescription("Посмотреть или сбросить активную тему")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("status")
        .setDescription("Активная тема канала")
        .addChannelOption((option) =>
          option.setName("channel").setDescription("Канал").addChannelTypes(ChannelType.GuildText, ChannelType.PublicThread, ChannelType.PrivateThread)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("reset")
        .setDescription("Сбросить активную тему")
        .addChannelOption((option) =>
          option.setName("channel").setDescription("Канал").addChannelTypes(ChannelType.GuildText, ChannelType.PublicThread, ChannelType.PrivateThread)
        )
    ),
  new SlashCommandBuilder()
    .setName("bot-mood")
    .setDescription("Управлять mood Hori")
    .addSubcommand((subcommand) => subcommand.setName("status").setDescription("Текущий mood"))
    .addSubcommand((subcommand) =>
      subcommand
        .setName("set")
        .setDescription("Задать mood")
        .addStringOption((option) =>
          option
            .setName("mode")
            .setDescription("Режим")
            .setRequired(true)
            .addChoices(
              { name: "normal", value: "normal" },
              { name: "playful", value: "playful" },
              { name: "dry", value: "dry" },
              { name: "irritated", value: "irritated" },
              { name: "focused", value: "focused" },
              { name: "sleepy", value: "sleepy" },
              { name: "detached", value: "detached" }
            )
        )
        .addIntegerOption((option) => option.setName("minutes").setDescription("Сколько минут").setMinValue(1).setMaxValue(1440))
        .addStringOption((option) => option.setName("reason").setDescription("Причина"))
    )
    .addSubcommand((subcommand) => subcommand.setName("clear").setDescription("Сбросить mood")),
  new SlashCommandBuilder()
    .setName("bot-queue")
    .setDescription("Управлять reply queue")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("status")
        .setDescription("Статус очереди")
        .addChannelOption((option) =>
          option.setName("channel").setDescription("Канал").addChannelTypes(ChannelType.GuildText, ChannelType.PublicThread, ChannelType.PrivateThread)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("clear")
        .setDescription("Очистить очередь")
        .addChannelOption((option) =>
          option.setName("channel").setDescription("Канал").addChannelTypes(ChannelType.GuildText, ChannelType.PublicThread, ChannelType.PrivateThread)
        )
    ),
  new SlashCommandBuilder()
    .setName("bot-reflection")
    .setDescription("Посмотреть тихий журнал уроков Hori")
    .addSubcommand((subcommand) => subcommand.setName("status").setDescription("Сводка по урокам"))
    .addSubcommand((subcommand) =>
      subcommand
        .setName("list")
        .setDescription("Последние открытые уроки")
        .addIntegerOption((option) => option.setName("limit").setDescription("Сколько показать").setMinValue(1).setMaxValue(10))
    ),
  new SlashCommandBuilder()
    .setName("bot-media")
    .setDescription("Управлять media registry")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription("Зарегистрировать локальный media-файл")
        .addStringOption((option) => option.setName("id").setDescription("media id").setRequired(true))
        .addStringOption((option) =>
          option
            .setName("type")
            .setDescription("Тип")
            .setRequired(true)
            .addChoices(
              { name: "image", value: "image" },
              { name: "gif", value: "gif" },
              { name: "video", value: "video" },
              { name: "audio", value: "audio" }
            )
        )
        .addStringOption((option) => option.setName("path").setDescription("Абсолютный путь к файлу").setRequired(true))
        .addStringOption((option) => option.setName("trigger-tags").setDescription("CSV trigger tags"))
        .addStringOption((option) => option.setName("tone-tags").setDescription("CSV tone tags"))
        .addStringOption((option) => option.setName("channels").setDescription("CSV channel kinds"))
        .addStringOption((option) => option.setName("moods").setDescription("CSV moods"))
        .addBooleanOption((option) => option.setName("nsfw").setDescription("NSFW"))
    )
    .addSubcommand((subcommand) => subcommand.setName("list").setDescription("Список media"))
    .addSubcommand((subcommand) =>
      subcommand
        .setName("sync-pack")
        .setDescription("Синхронизировать media из catalog.json")
        .addStringOption((option) => option.setName("path").setDescription("Путь к catalog.json внутри репозитория"))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("disable")
        .setDescription("Отключить media")
        .addStringOption((option) => option.setName("id").setDescription("media id").setRequired(true))
    ),
  new SlashCommandBuilder()
    .setName("bot-power")
    .setDescription("Глобальные пресеты мощности Ollama и контекста")
    .addSubcommand((subcommand) => subcommand.setName("panel").setDescription("Открыть owner-only панель пресетов"))
    .addSubcommand((subcommand) => subcommand.setName("status").setDescription("Показать активный power profile и лимиты"))
    .addSubcommand((subcommand) =>
      subcommand
        .setName("apply")
        .setDescription("Применить power profile")
        .addStringOption((option) =>
          option
            .setName("profile")
            .setDescription("Пресет мощности")
            .setRequired(true)
            .addChoices(
              { name: "economy", value: "economy" },
              { name: "balanced", value: "balanced" },
              { name: "expanded", value: "expanded" },
              { name: "max", value: "max" }
            )
        )
    ),
  new SlashCommandBuilder()
    .setName("bot-ai-url")
    .setDescription("Сменить Ollama URL (только владелец бота)")
    .addStringOption((option) => option.setName("url").setDescription("Новый URL (https://...)").setRequired(true)),
  new SlashCommandBuilder()
    .setName("bot-lockdown")
    .setDescription("Включить режим: Хори слушает только владельца")
    .addSubcommand((subcommand) => subcommand.setName("on").setDescription("Включить локдаун"))
    .addSubcommand((subcommand) => subcommand.setName("off").setDescription("Выключить локдаун"))
    .addSubcommand((subcommand) => subcommand.setName("status").setDescription("Проверить статус локдауна")),
  new SlashCommandBuilder()
    .setName("bot-import")
    .setDescription("Импортировать историю чата из JSON файла")
    .addAttachmentOption((option) => option.setName("file").setDescription(".json файл с историей чата").setRequired(true))
].map((command) => command.toJSON());

export const contextMenuDefinitions = [
  new ContextMenuCommandBuilder()
    .setName(CONTEXT_ACTIONS.explain)
    .setType(ApplicationCommandType.Message),
  new ContextMenuCommandBuilder()
    .setName(CONTEXT_ACTIONS.summarize)
    .setType(ApplicationCommandType.Message),
  new ContextMenuCommandBuilder()
    .setName(CONTEXT_ACTIONS.tone)
    .setType(ApplicationCommandType.Message),
  new ContextMenuCommandBuilder()
    .setName(CONTEXT_ACTIONS.rememberMoment)
    .setType(ApplicationCommandType.Message)
].map((command) => command.toJSON());

