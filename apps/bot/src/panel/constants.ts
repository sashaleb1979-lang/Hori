export const MEMORY_ALBUM_MODAL_PREFIX = "memory-album";
export const HORI_MODAL_PREFIX = "hori-modal";
export const HORI_PANEL_PREFIX = "hori-panel";
export const HORI_ACTION_PREFIX = "hori-action";
export const HORI_STATE_PANEL_PREFIX = "hori-state";
export const POWER_PANEL_PREFIX = "power-panel";
export const LLM_PANEL_PREFIX = "llm-panel";
export const CORE_PROMPT_PANEL_PREFIX = "core-prompt-panel";

export const POWER_PROFILES = ["economy", "balanced", "expanded", "max"] as const;
export const HORI_PANEL_TABS = ["main", "persona", "behavior", "memory", "channels", "llm", "system"] as const;

export type HoriPanelTab = (typeof HORI_PANEL_TABS)[number];

export const TAB_EMOJI: Record<HoriPanelTab, string> = {
  main: "🏠",
  persona: "🎭",
  behavior: "⚡",
  memory: "🧠",
  channels: "📡",
  llm: "🤖",
  system: "⚙️"
};

export const TAB_COLOR: Record<HoriPanelTab, number> = {
  main: 0x5865F2,
  persona: 0xED4245,
  behavior: 0xFEE75C,
  memory: 0x57F287,
  channels: 0x5865F2,
  llm: 0x57F287,
  system: 0xEB459E
};

export const PANEL_FEATURE_LABELS = {
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
} as const;

export type PanelFeatureKey = keyof typeof PANEL_FEATURE_LABELS;

export const HORI_PANEL_OWNER_ONLY_MESSAGE = "Hori master panel доступна только владельцу. Для обычной работы используй прямые ветки /hori.";
