import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder
} from "discord.js";

import { HORI_ACTION_PREFIX, HORI_PANEL_PREFIX } from "./constants";
import {
  DEFAULT_PANEL_TAB_ID,
  PANEL_TABS,
  resolvePanelTab
} from "./registry";
import {
  panelTabAllowed,
  resolveTabActions,
  type PanelTabDefinition,
  type PanelViewer
} from "./types";

export interface PanelResponseOptions {
  /** optional extra detail embed appended after the tab embed */
  detail?: { title: string; body: string };
}

export function buildPanelResponse(
  tabId: string | null | undefined,
  viewer: PanelViewer,
  options: PanelResponseOptions = {}
) {
  const tab = resolvePanelTab(tabId);
  const embeds: EmbedBuilder[] = [buildTabEmbed(tab, viewer)];
  if (options.detail) {
    embeds.push(buildDetailEmbed(options.detail.title, options.detail.body));
  }
  return {
    content: "",
    embeds,
    components: buildTabRows(tab, viewer)
  };
}

export function buildTabEmbed(tab: PanelTabDefinition, viewer: PanelViewer): EmbedBuilder {
  const role = viewer.isOwner ? "👑 owner" : viewer.isModerator ? "🛡️ moderator" : "👤 user";
  const actions = resolveTabActions(tab, viewer);
  const actionsLine = actions.map((a) => a.label).join(" · ") || "—";

  return new EmbedBuilder()
    .setTitle(`${tab.emoji} Hori Panel — ${tab.label}`)
    .setColor(tab.color)
    .setDescription(tab.description)
    .addFields(
      { name: "Доступ", value: role, inline: true },
      { name: "Кнопки", value: actionsLine.slice(0, 1024) }
    );
}

export function buildDetailEmbed(title: string, body: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(title.slice(0, 256))
    .setColor(0x2F3136)
    .setDescription((body || "—").slice(0, 4096));
}

export function buildTabRows(tab: PanelTabDefinition, viewer: PanelViewer) {
  const visibleTabs = PANEL_TABS.filter((candidate) => panelTabAllowed(candidate, viewer));
  const tabSelector = new StringSelectMenuBuilder()
    .setCustomId(`${HORI_PANEL_PREFIX}:tab`)
    .setPlaceholder("Раздел панели")
    .addOptions(
      ...visibleTabs.map((candidate) => ({
        label: candidate.label,
        value: candidate.id,
        emoji: candidate.emoji,
        default: candidate.id === tab.id
      }))
    );

  const rows: Array<ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>> = [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(tabSelector)
  ];

  const actions = resolveTabActions(tab, viewer);
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

export function parsePanelTabId(value: string | null | undefined): string {
  if (!value) return DEFAULT_PANEL_TAB_ID;
  return resolvePanelTab(value).id;
}
