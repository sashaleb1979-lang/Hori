import { ButtonStyle } from "discord.js";

import type { PanelTabDefinition } from "./types";

/**
 * Hori Panel V7 — new information architecture.
 *
 * Все вкладки панели управления Хори. Заменяет старый набор V5/V6
 * (main/persona/behavior/memory/channels/llm/system/relationship/recall/sigils/queue/flash/audit).
 *
 * Соглашения:
 *  - id — стабильный slug, используется в slash choices и в state передаваемом
 *    через select-menu.
 *  - label — единственное место, где живёт русское имя вкладки.
 *  - actions перечислены в порядке отображения. Permissioning — через action.access.
 *  - Phase 1: для большинства вкладок включён скелет; конкретные controls будут
 *    добавлены отдельными шагами по мере подключения backend surfaces.
 */
export const PANEL_TABS: PanelTabDefinition[] = [
  {
    id: "home",
    label: "Главная",
    emoji: "🏠",
    color: 0x5865F2,
    description: [
      "Снимок состояния сервера: активный core, провайдер, очередь, агрессия, последние изменения.",
      "Отсюда быстрый переход в любую вкладку и базовые owner-команды."
    ].join("\n"),
    actions: [
      { id: "home_status", label: "Статус", emoji: "📊", style: ButtonStyle.Primary },
      { id: "home_runtime", label: "Рантайм", emoji: "🤖" },
      { id: "home_audit_recent", label: "Свежий аудит", emoji: "📜", access: "moderator" },
      { id: "home_help", label: "Справка", emoji: "❓" }
    ]
  },
  {
    id: "cores",
    label: "Коры и маршруты",
    emoji: "🧩",
    color: 0xED4245,
    description: [
      "Базовый core, relationship-коры по уровням -1..4, sign-варианты (?, !, *, >, ^),",
      "evaluator и aggression-checker prompts. Превью собранного промпта по контексту."
    ].join("\n"),
    access: "moderator",
    actions: [
      { id: "cores_open_panel", label: "Редактор кор", emoji: "🧩", style: ButtonStyle.Primary, access: "owner" },
      { id: "cores_preview", label: "Превью сборки", emoji: "🔍", access: "moderator" },
      { id: "cores_evaluator", label: "Evaluator", emoji: "🧪", access: "owner" },
      { id: "cores_aggression_checker", label: "Aggression checker", emoji: "🛡️", access: "owner" }
    ]
  },
  {
    id: "people",
    label: "Люди и отношения",
    emoji: "💞",
    color: 0xE91E63,
    description: [
      "Поиск пользователя, relationship state, уровень -1..4, characteristic, last-change,",
      "ручные оверрайды, growth deltas, эффективный core по этому пользователю."
    ].join("\n"),
    access: "moderator",
    actions: [
      { id: "people_lookup", label: "Найти пользователя", emoji: "🔎", style: ButtonStyle.Primary, access: "moderator" },
      { id: "people_self", label: "Моё отношение", emoji: "💞" },
      { id: "people_set_state", label: "Поставить уровень", emoji: "🎚️", access: "owner" },
      { id: "people_reset_cold", label: "Снять заморозку", emoji: "🌡️", access: "owner" },
      { id: "people_deltas", label: "Дельты роста", emoji: "🔢", access: "owner" }
    ]
  },
  {
    id: "aggression",
    label: "Агрессия и модерация",
    emoji: "🛡️",
    color: 0xC0392B,
    description: [
      "Stage 1–4 политика, фразы замены, decay/reset, длительность таймаута,",
      "checker prompt/model, ручной сброс stage, лог событий, состояние по пользователю."
    ].join("\n"),
    access: "moderator",
    actions: [
      { id: "aggression_status", label: "Состояние", emoji: "🛡️", style: ButtonStyle.Primary, access: "moderator" },
      { id: "aggression_events", label: "События", emoji: "📜", access: "moderator" },
      { id: "aggression_stage_reset", label: "Сброс stage", emoji: "♻️", access: "owner" },
      { id: "aggression_policy", label: "Политика", emoji: "⚙️", access: "owner" },
      { id: "aggression_phrases", label: "Фразы замены", emoji: "💬", access: "owner" }
    ]
  },
  {
    id: "slots",
    label: "Слоты и стили",
    emoji: "🎟️",
    color: 0x9B59B6,
    description: [
      "Prompt-slot inventory, активные/cooldown, force activate/deactivate,",
      "приоритет по ownerLevel, override prompt strength, legacy memory cards (maintenance)."
    ].join("\n"),
    access: "moderator",
    actions: [
      { id: "slots_list", label: "Активные слоты", emoji: "🎟️", style: ButtonStyle.Primary, access: "moderator" },
      { id: "slots_inventory", label: "Реестр слотов", emoji: "📦", access: "moderator" },
      { id: "slots_force_activate", label: "Активировать", emoji: "⚡", access: "owner" },
      { id: "slots_deactivate", label: "Снять", emoji: "🛑", access: "owner" },
      { id: "slots_legacy_cards", label: "Legacy карты", emoji: "🗄️", access: "owner" }
    ]
  },
  {
    id: "channels",
    label: "Каналы и доступ",
    emoji: "📡",
    color: 0x3498DB,
    description: [
      "Access mode (full/silent/off), reply/interject флаги, search/link флаги,",
      "оверрайды по каналу, bulk-матрица каналов сервера."
    ].join("\n"),
    access: "moderator",
    actions: [
      { id: "channels_status", label: "Текущий канал", emoji: "📡", style: ButtonStyle.Primary, access: "moderator" },
      { id: "channels_matrix", label: "Матрица сервера", emoji: "🗺️", access: "moderator" },
      { id: "channels_set_full", label: "Full", emoji: "🟢", access: "moderator" },
      { id: "channels_set_silent", label: "Silent", emoji: "🟡", access: "moderator" },
      { id: "channels_set_off", label: "Off", emoji: "🔴", access: "moderator" }
    ]
  },
  {
    id: "queue",
    label: "Очередь и реакции",
    emoji: "📬",
    color: 0x1ABC9C,
    description: [
      "Initial/followup ack-pools по relationship-bucket, TTL/max-age,",
      "natural splitting, auto-react/flash веса, состояние meme-индекса."
    ].join("\n"),
    access: "moderator",
    actions: [
      { id: "queue_status", label: "Состояние", emoji: "📬", style: ButtonStyle.Primary, access: "moderator" },
      { id: "queue_clear", label: "Очистить", emoji: "🧹", access: "moderator" },
      { id: "queue_phrase_pools", label: "Phrase pools", emoji: "💬", access: "owner" },
      { id: "queue_reset_pools", label: "Reset pools", emoji: "♻️", access: "owner" },
      { id: "queue_meme_status", label: "Memes", emoji: "🖼️", access: "moderator" }
    ]
  },
  {
    id: "runtime",
    label: "Модели и рантайм",
    emoji: "⚙️",
    color: 0xF39C12,
    description: [
      "Provider routing, preferred chat provider, memory mode, relationship growth,",
      "style preset mode, max timeout, enabled sigils, актуальные feature flags."
    ].join("\n"),
    access: "owner",
    actions: [
      { id: "runtime_status", label: "Сводка", emoji: "📊", style: ButtonStyle.Primary, access: "owner" },
      { id: "runtime_llm_panel", label: "LLM маршрутизация", emoji: "🤖", access: "owner" },
      { id: "runtime_power", label: "Power profile", emoji: "⚡", access: "owner" },
      { id: "runtime_sigils", label: "Sigils", emoji: "🔣", access: "owner" },
      { id: "runtime_features", label: "Feature flags", emoji: "🏷️", access: "owner" },
      { id: "runtime_lockdown", label: "Lockdown", emoji: "🔒", access: "owner" }
    ]
  },
  {
    id: "audit",
    label: "Аудит",
    emoji: "📜",
    color: 0x95A5A6,
    description: [
      "История изменений core prompt, runtime-настроек, ручных правок отношений,",
      "активаций слотов, действий по агрессии и доступу к каналам."
    ].join("\n"),
    access: "moderator",
    actions: [
      { id: "audit_recent", label: "Последние 25", emoji: "📜", style: ButtonStyle.Primary, access: "moderator" },
      { id: "audit_runtime", label: "Runtime", emoji: "⚙️", access: "owner" },
      { id: "audit_relationships", label: "Отношения", emoji: "💞", access: "moderator" },
      { id: "audit_aggression", label: "Агрессия", emoji: "🛡️", access: "moderator" },
      { id: "audit_slots", label: "Слоты", emoji: "🎟️", access: "moderator" }
    ]
  }
];

export const PANEL_TAB_BY_ID: ReadonlyMap<string, PanelTabDefinition> = new Map(
  PANEL_TABS.map((tab) => [tab.id, tab])
);

export const PANEL_TAB_IDS: readonly string[] = PANEL_TABS.map((tab) => tab.id);

export const DEFAULT_PANEL_TAB_ID = "home";

export function getPanelTab(id: string | null | undefined): PanelTabDefinition | null {
  if (!id) return null;
  return PANEL_TAB_BY_ID.get(id) ?? null;
}

export function resolvePanelTab(id: string | null | undefined): PanelTabDefinition {
  return getPanelTab(id) ?? PANEL_TAB_BY_ID.get(DEFAULT_PANEL_TAB_ID)!;
}
