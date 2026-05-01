import {
  ApplicationCommandType,
  ChannelType,
  ContextMenuCommandBuilder,
  SlashCommandBuilder
} from "discord.js";

import { CONTEXT_ACTIONS } from "@hori/shared";

const panelTabChoices = [
  { name: "🏠 Главная", value: "home" },
  { name: "🧩 Коры и маршруты", value: "cores" },
  { name: "💞 Люди и отношения", value: "people" },
  { name: "🛡️ Агрессия и модерация", value: "aggression" },
  { name: "🎟️ Слоты и стили", value: "slots" },
  { name: "📡 Каналы и доступ", value: "channels" },
  { name: "📬 Очередь и реакции", value: "queue" },
  { name: "⚙️ Модели и рантайм", value: "runtime" },
  { name: "📜 Аудит", value: "audit" }
] as const;

const stateTabChoices = [
  { name: "Персона", value: "persona" },
  { name: "Мозги", value: "brain" },
  { name: "Память", value: "memory" },
  { name: "Канал", value: "channel" },
  { name: "Поиск", value: "search" },
  { name: "Очередь", value: "queue" },
  { name: "Медиа", value: "media" },
  { name: "Фичи", value: "features" },
  { name: "Trace", value: "trace" },
  { name: "Токены", value: "tokens" }
] as const;

const powerProfileChoices = [
  { name: "economy", value: "economy" },
  { name: "balanced", value: "balanced" },
  { name: "expanded", value: "expanded" },
  { name: "max", value: "max" }
] as const;

const relationshipStateChoices = [
  { name: "base", value: "base" },
  { name: "warm", value: "warm" },
  { name: "close", value: "close" },
  { name: "teasing", value: "teasing" },
  { name: "sweet", value: "sweet" },
  { name: "serious", value: "serious" },
  { name: "cold_lowest", value: "cold_lowest" }
] as const;

const memoryModeChoices = [
  { name: "OFF", value: "OFF" },
  { name: "TRUSTED_ONLY", value: "TRUSTED_ONLY" },
  { name: "ACTIVE_OPT_IN", value: "ACTIVE_OPT_IN" },
  { name: "ADMIN_SELECTED", value: "ADMIN_SELECTED" }
] as const;

const relationshipGrowthModeChoices = [
  { name: "OFF", value: "OFF" },
  { name: "MANUAL_REVIEW", value: "MANUAL_REVIEW" },
  { name: "TRUSTED_AUTO", value: "TRUSTED_AUTO" },
  { name: "FULL_AUTO", value: "FULL_AUTO" }
] as const;

const stylePresetModeChoices = [
  { name: "manual_only", value: "manual_only" }
] as const;

const replyLengthChoices = [
  { name: "short", value: "short" },
  { name: "medium", value: "medium" },
  { name: "long", value: "long" },
  { name: "inherit/default", value: "inherit" }
] as const;

const moodChoices = [
  { name: "normal", value: "normal" },
  { name: "playful", value: "playful" },
  { name: "dry", value: "dry" },
  { name: "irritated", value: "irritated" },
  { name: "focused", value: "focused" },
  { name: "sleepy", value: "sleepy" },
  { name: "detached", value: "detached" }
] as const;

const mediaTypeChoices = [
  { name: "image", value: "image" },
  { name: "gif", value: "gif" },
  { name: "video", value: "video" },
  { name: "audio", value: "audio" }
] as const;

const horiCommandDefinition = new SlashCommandBuilder()
  .setName("hori")
  .setDescription("Главный центр управления Хори")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("panel")
      .setDescription("Owner: открыть master panel Хори")
      .addStringOption((option) =>
        option
          .setName("tab")
          .setDescription("Вкладка")
          .addChoices(...panelTabChoices)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("state")
      .setDescription("Owner: панель состояния Хори")
      .addStringOption((option) =>
        option
          .setName("tab")
          .setDescription("Раздел состояния")
          .addChoices(...stateTabChoices)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("ai-status")
      .setDescription("Owner: статус AI router, cooldown и fallback цепочки")
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("search")
      .setDescription("Сделать web search через усиленный fallback")
      .addStringOption((option) => option.setName("query").setDescription("Что искать").setRequired(true))
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("profile")
      .setDescription("Показать краткий профиль/память")
      .addUserOption((option) => option.setName("user").setDescription("Пользователь"))
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("dossier")
      .setDescription("Owner: собрать развёрнутое досье по человеку")
      .addUserOption((option) => option.setName("user").setDescription("Пользователь").setRequired(true))
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("relationship")
      .setDescription("Owner: посмотреть или изменить отношение к человеку")
      .addUserOption((option) => option.setName("user").setDescription("Пользователь").setRequired(true))
      .addStringOption((option) => option.setName("tone-bias").setDescription("neutral, friendly, sharp, playful"))
      .addIntegerOption((option) => option.setName("roast-level").setDescription("0-5").setMinValue(0).setMaxValue(5))
      .addIntegerOption((option) => option.setName("praise-bias").setDescription("0-5").setMinValue(0).setMaxValue(5))
      .addIntegerOption((option) => option.setName("interrupt-priority").setDescription("0-5").setMinValue(0).setMaxValue(5))
      .addBooleanOption((option) => option.setName("do-not-mock").setDescription("Не подкалывать"))
      .addBooleanOption((option) => option.setName("do-not-initiate").setDescription("Не инициировать общение"))
      .addStringOption((option) => option.setName("protected-topics").setDescription("CSV protected topics"))
      .addStringOption((option) => option.setName("relationship-state").setDescription("V5 relationship state").addChoices(...relationshipStateChoices))
      .addNumberOption((option) => option.setName("closeness").setDescription("Близость 0-1").setMinValue(0).setMaxValue(1))
      .addNumberOption((option) => option.setName("trust").setDescription("Доверие 0-1").setMinValue(0).setMaxValue(1))
      .addNumberOption((option) => option.setName("familiarity").setDescription("Знакомость 0-1").setMinValue(0).setMaxValue(1))
      .addNumberOption((option) => option.setName("proactivity").setDescription("Желательность инициативы 0-1").setMinValue(0).setMaxValue(1))
      .addNumberOption((option) => option.setName("score").setDescription("relationshipScore (-1.5..3)").setMinValue(-1.5).setMaxValue(3))
      .addStringOption((option) => option.setName("characteristic").setDescription("V6: характеристика (постоянная заметка). 'clear' = очистить.").setMaxLength(400))
      .addStringOption((option) => option.setName("last-change").setDescription("V6: последнее изменение / настроение. 'clear' = очистить.").setMaxLength(400))
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("runtime")
      .setDescription("Owner: V5 runtime modes и лимиты модерации")
      .addStringOption((option) => option.setName("memory-mode").setDescription("Режим памяти").addChoices(...memoryModeChoices))
      .addStringOption((option) =>
        option
          .setName("relationship-growth-mode")
          .setDescription("Режим роста отношений")
          .addChoices(...relationshipGrowthModeChoices)
      )
      .addStringOption((option) =>
        option
          .setName("style-preset-mode")
          .setDescription("Режим style preset")
          .addChoices(...stylePresetModeChoices)
      )
      .addIntegerOption((option) =>
        option
          .setName("max-timeout-minutes")
          .setDescription("Максимум минут тайм-аута")
          .setMinValue(1)
          .setMaxValue(15)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("aggression")
      .setDescription("Owner: escalation, cold state и aggression events")
      .addUserOption((option) => option.setName("user").setDescription("Пользователь").setRequired(true))
      .addStringOption((option) =>
        option
          .setName("action")
          .setDescription("Действие")
          .setRequired(true)
          .addChoices(
            { name: "events", value: "events" },
            { name: "reset-escalation", value: "reset-escalation" },
            { name: "reset-cold", value: "reset-cold" }
          )
      )
      .addIntegerOption((option) => option.setName("limit").setDescription("Сколько событий показать").setMinValue(1).setMaxValue(20))
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("memory-cards")
      .setDescription("Owner/mod: list или remove user memory cards")
      .addUserOption((option) => option.setName("user").setDescription("Пользователь").setRequired(true))
      .addStringOption((option) =>
        option
          .setName("action")
          .setDescription("Действие")
          .setRequired(true)
          .addChoices(
            { name: "list", value: "list" },
            { name: "remove", value: "remove" }
          )
      )
      .addIntegerOption((option) => option.setName("limit").setDescription("Сколько показать").setMinValue(1).setMaxValue(20))
      .addStringOption((option) => option.setName("id").setDescription("ID memory card для remove"))
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("slot")
      .setDescription("Управлять личным prompt-слотом (10 мин / 6 ч cooldown)")
      .addStringOption((option) =>
        option
          .setName("action")
          .setDescription("Действие")
          .setRequired(true)
          .addChoices(
            { name: "create", value: "create" },
            { name: "list", value: "list" },
            { name: "activate", value: "activate" },
            { name: "deactivate", value: "deactivate" },
            { name: "delete", value: "delete" }
          )
      )
      .addStringOption((option) => option.setName("content").setDescription("Текст контекста (для create)").setMaxLength(500))
      .addStringOption((option) => option.setName("title").setDescription("Короткое название слота (для create)").setMaxLength(64))
      .addStringOption((option) => option.setName("keyword").setDescription("Кодовое слово для авто-активации из чата (для create)").setMaxLength(50))
      .addStringOption((option) => option.setName("id").setDescription("ID слота (для activate/deactivate/delete)"))
      .addBooleanOption((option) => option.setName("global").setDescription("Глобальный слот (без привязки к каналу)"))
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("memory")
      .setDescription("Управлять долгой памятью")
      .addStringOption((option) =>
        option
          .setName("action")
          .setDescription("Действие")
          .setRequired(true)
          .addChoices(
            { name: "remember", value: "remember" },
            { name: "forget", value: "forget" }
          )
      )
      .addStringOption((option) => option.setName("key").setDescription("Ключ").setRequired(true))
      .addStringOption((option) => option.setName("value").setDescription("Значение для remember"))
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("channel")
      .setDescription("Настроить канал")
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("Канал")
          .addChannelTypes(ChannelType.GuildText, ChannelType.PublicThread, ChannelType.PrivateThread)
      )
      .addBooleanOption((option) => option.setName("allow-bot-replies").setDescription("Разрешить ответы"))
      .addBooleanOption((option) => option.setName("allow-interjections").setDescription("Разрешить автовмешательства"))
      .addBooleanOption((option) => option.setName("is-muted").setDescription("Хори должна молчать"))
        .addStringOption((option) => option.setName("response-length").setDescription("Локальная длина ответа").addChoices(...replyLengthChoices))
      .addStringOption((option) => option.setName("topic-interest-tags").setDescription("CSV tags"))
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("summary")
      .setDescription("Показать последние channel summaries")
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("Канал")
          .addChannelTypes(ChannelType.GuildText, ChannelType.PublicThread, ChannelType.PrivateThread)
      )
  )
  .addSubcommand((subcommand) => subcommand.setName("stats").setDescription("Показать недельную статистику"))
  .addSubcommand((subcommand) =>
    subcommand
      .setName("topic")
      .setDescription("Посмотреть или сбросить активную тему")
      .addStringOption((option) =>
        option
          .setName("action")
          .setDescription("Действие")
          .setRequired(true)
          .addChoices(
            { name: "status", value: "status" },
            { name: "reset", value: "reset" }
          )
      )
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("Канал")
          .addChannelTypes(ChannelType.GuildText, ChannelType.PublicThread, ChannelType.PrivateThread)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("mood")
      .setDescription("Управлять mood Hori")
      .addStringOption((option) =>
        option
          .setName("action")
          .setDescription("Действие")
          .setRequired(true)
          .addChoices(
            { name: "status", value: "status" },
            { name: "set", value: "set" },
            { name: "clear", value: "clear" }
          )
      )
      .addStringOption((option) => option.setName("mode").setDescription("Режим").addChoices(...moodChoices))
      .addIntegerOption((option) => option.setName("minutes").setDescription("Сколько минут").setMinValue(1).setMaxValue(1440))
      .addStringOption((option) => option.setName("reason").setDescription("Причина"))
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("queue")
      .setDescription("Управлять reply queue")
      .addStringOption((option) =>
        option
          .setName("action")
          .setDescription("Действие")
          .setRequired(true)
          .addChoices(
            { name: "status", value: "status" },
            { name: "clear", value: "clear" }
          )
      )
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("Канал")
          .addChannelTypes(ChannelType.GuildText, ChannelType.PublicThread, ChannelType.PrivateThread)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("album")
      .setDescription("Личный альбом сохранённых моментов")
      .addStringOption((option) =>
        option
          .setName("action")
          .setDescription("Действие")
          .setRequired(true)
          .addChoices(
            { name: "list", value: "list" },
            { name: "remove", value: "remove" }
          )
      )
      .addIntegerOption((option) => option.setName("limit").setDescription("Сколько показать").setMinValue(1).setMaxValue(10))
      .addStringOption((option) => option.setName("id").setDescription("ID момента для remove"))
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("debug")
      .setDescription("Owner/mod: получить debug trace")
      .addStringOption((option) => option.setName("message-id").setDescription("ID сообщения"))
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("feature")
      .setDescription("Переключить feature flag")
      .addStringOption((option) => option.setName("key").setDescription("Название флага").setRequired(true))
      .addBooleanOption((option) => option.setName("enabled").setDescription("Включить/выключить").setRequired(true))
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("media")
      .setDescription("Управлять media registry")
      .addStringOption((option) =>
        option
          .setName("action")
          .setDescription("Действие")
          .setRequired(true)
          .addChoices(
            { name: "list", value: "list" },
            { name: "add", value: "add" },
            { name: "sync-pack", value: "sync-pack" },
            { name: "disable", value: "disable" }
          )
      )
      .addStringOption((option) => option.setName("id").setDescription("media id"))
      .addStringOption((option) => option.setName("type").setDescription("Тип").addChoices(...mediaTypeChoices))
      .addStringOption((option) => option.setName("path").setDescription("Путь к файлу или catalog.json"))
      .addStringOption((option) => option.setName("trigger-tags").setDescription("CSV trigger tags"))
      .addStringOption((option) => option.setName("tone-tags").setDescription("CSV tone tags"))
      .addStringOption((option) => option.setName("channels").setDescription("CSV channel kinds"))
      .addStringOption((option) => option.setName("moods").setDescription("CSV moods"))
      .addBooleanOption((option) => option.setName("nsfw").setDescription("NSFW"))
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("power")
      .setDescription("Owner: пресеты мощности Ollama и контекста")
      .addStringOption((option) =>
        option
          .setName("action")
          .setDescription("Действие")
          .setRequired(true)
          .addChoices(
            { name: "panel", value: "panel" },
            { name: "status", value: "status" },
            { name: "apply", value: "apply" }
          )
      )
      .addStringOption((option) => option.setName("profile").setDescription("Пресет мощности").addChoices(...powerProfileChoices))
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("lockdown")
      .setDescription("Owner: Хори слушает только владельца")
      .addStringOption((option) =>
        option
          .setName("mode")
          .setDescription("Режим")
          .setRequired(true)
          .addChoices(
            { name: "on", value: "on" },
            { name: "off", value: "off" },
            { name: "status", value: "status" }
          )
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("import")
      .setDescription("Owner: импортировать историю чата из JSON файла")
      .addAttachmentOption((option) => option.setName("file").setDescription(".json файл с историей чата").setRequired(true))
  );

const legacySlashCommandBuilders = [
  new SlashCommandBuilder().setName("bot-help").setDescription("Короткая справка по legacy-командам"),
  new SlashCommandBuilder()
    .setName("bot-style")
    .setDescription("Настроить стиль Хори")
    .addStringOption((option) => option.setName("bot-name").setDescription("Имя бота"))
    .addStringOption((option) => option.setName("preferred-language").setDescription("Язык по умолчанию, например ru/en"))
    .addIntegerOption((option) => option.setName("roughness").setDescription("Грубость 0-5").setMinValue(0).setMaxValue(5))
    .addIntegerOption((option) => option.setName("sarcasm").setDescription("Сарказм 0-5").setMinValue(0).setMaxValue(5))
    .addIntegerOption((option) => option.setName("roast").setDescription("Стёб 0-5").setMinValue(0).setMaxValue(5))
    .addIntegerOption((option) => option.setName("interject-tendency").setDescription("Склонность встревать 0-5").setMinValue(0).setMaxValue(5))
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
    .addStringOption((option) => option.setName("protected-topics").setDescription("CSV protected topics"))
    .addNumberOption((option) => option.setName("closeness").setDescription("Близость 0-1").setMinValue(0).setMaxValue(1))
    .addNumberOption((option) => option.setName("trust").setDescription("Доверие 0-1").setMinValue(0).setMaxValue(1))
    .addNumberOption((option) => option.setName("familiarity").setDescription("Знакомость 0-1").setMinValue(0).setMaxValue(1))
    .addNumberOption((option) => option.setName("proactivity").setDescription("Желательность инициативы 0-1").setMinValue(0).setMaxValue(1))
    .addNumberOption((option) => option.setName("score").setDescription("relationshipScore (-1.5..3)").setMinValue(-1.5).setMaxValue(3)),
  new SlashCommandBuilder()
    .setName("bot-feature")
    .setDescription("Переключить feature flag")
    .addStringOption((option) => option.setName("key").setDescription("Название флага").setRequired(true))
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
    .addStringOption((option) => option.setName("response-length").setDescription("Локальная длина ответа").addChoices(...replyLengthChoices))
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
          option.setName("mode").setDescription("Режим").setRequired(true).addChoices(...moodChoices)
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
        .addStringOption((option) => option.setName("type").setDescription("Тип").setRequired(true).addChoices(...mediaTypeChoices))
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
        .addStringOption((option) => option.setName("profile").setDescription("Пресет мощности").setRequired(true).addChoices(...powerProfileChoices))
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
];

export const horiSlashCommandDefinitions = [horiCommandDefinition].map((command) => command.toJSON());
export const legacySlashCommandDefinitions = legacySlashCommandBuilders.map((command) => command.toJSON());
export const slashCommandDefinitions = [...horiSlashCommandDefinitions, ...legacySlashCommandDefinitions];

export function getSlashCommandDefinitions(options: { includeLegacy?: boolean } = {}) {
  return options.includeLegacy ? slashCommandDefinitions : horiSlashCommandDefinitions;
}

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
