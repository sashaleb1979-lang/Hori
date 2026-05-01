import type { ButtonStyle } from "discord.js";

export type PanelAccess = "owner" | "moderator" | "user";

export interface PanelViewer {
  isOwner: boolean;
  isModerator: boolean;
}

export interface PanelAction {
  /** custom-id payload after `hori-action:` prefix */
  id: string;
  label: string;
  emoji?: string;
  style?: ButtonStyle;
  /** required access level; defaults to "user" */
  access?: PanelAccess;
}

export interface PanelTabDefinition {
  id: string;
  label: string;
  emoji: string;
  color: number;
  /** short Russian description shown above buttons */
  description: string;
  /** required access level to see the tab; defaults to "user" */
  access?: PanelAccess;
  /** static action set or dynamic builder */
  actions: PanelAction[] | ((viewer: PanelViewer) => PanelAction[]);
}

export function panelActionAllowed(action: PanelAction, viewer: PanelViewer): boolean {
  const access = action.access ?? "user";
  if (access === "owner") return viewer.isOwner;
  if (access === "moderator") return viewer.isOwner || viewer.isModerator;
  return true;
}

export function panelTabAllowed(tab: PanelTabDefinition, viewer: PanelViewer): boolean {
  const access = tab.access ?? "user";
  if (access === "owner") return viewer.isOwner;
  if (access === "moderator") return viewer.isOwner || viewer.isModerator;
  return true;
}

export function resolveTabActions(tab: PanelTabDefinition, viewer: PanelViewer): PanelAction[] {
  const actions = typeof tab.actions === "function" ? tab.actions(viewer) : tab.actions;
  return actions.filter((action) => panelActionAllowed(action, viewer));
}
