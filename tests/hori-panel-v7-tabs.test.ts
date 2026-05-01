import { describe, expect, it } from "vitest";

import {
  PANEL_TABS,
  PANEL_TAB_IDS,
  DEFAULT_PANEL_TAB_ID,
  resolvePanelTab,
  getPanelTab
} from "../apps/bot/src/panel/registry";
import { panelTabAllowed, resolveTabActions, type PanelViewer } from "../apps/bot/src/panel/types";

const owner: PanelViewer = { isOwner: true, isModerator: true };
const moderator: PanelViewer = { isOwner: false, isModerator: true };
const user: PanelViewer = { isOwner: false, isModerator: false };

describe("Hori Panel V7: tab matrix", () => {
  it("содержит ровно девять вкладок новой IA", () => {
    expect(PANEL_TABS).toHaveLength(9);
    expect(PANEL_TAB_IDS).toEqual([
      "home",
      "cores",
      "people",
      "aggression",
      "slots",
      "channels",
      "queue",
      "runtime",
      "audit"
    ]);
  });

  it("дефолтная вкладка — home", () => {
    expect(DEFAULT_PANEL_TAB_ID).toBe("home");
    expect(resolvePanelTab(null).id).toBe("home");
    expect(resolvePanelTab("totally-bogus").id).toBe("home");
  });

  it("каждая вкладка имеет emoji, цвет и описание на русском", () => {
    for (const tab of PANEL_TABS) {
      expect(tab.emoji).toBeTruthy();
      expect(typeof tab.color).toBe("number");
      expect(tab.label.length).toBeGreaterThan(0);
      expect(tab.description.length).toBeGreaterThan(0);
      // Кириллица в описании.
      expect(/[А-Яа-я]/.test(tab.description)).toBe(true);
    }
  });

  it("старые V5/V6 идентификаторы вкладок убраны", () => {
    const legacy = ["main", "persona", "behavior", "memory", "llm", "system",
      "relationship", "recall", "sigils", "flash"];
    for (const old of legacy) {
      expect(getPanelTab(old)).toBeNull();
    }
  });

  it("user не видит owner-only вкладки", () => {
    const visibleForUser = PANEL_TABS.filter((tab) => panelTabAllowed(tab, user)).map((t) => t.id);
    expect(visibleForUser).toContain("home");
    expect(visibleForUser).not.toContain("runtime");
    expect(visibleForUser).not.toContain("cores");
  });

  it("moderator видит operational вкладки, но не owner-only runtime", () => {
    const visible = PANEL_TABS.filter((tab) => panelTabAllowed(tab, moderator)).map((t) => t.id);
    expect(visible).toContain("cores");
    expect(visible).toContain("channels");
    expect(visible).toContain("audit");
    expect(visible).not.toContain("runtime");
  });

  it("owner видит все вкладки", () => {
    const visible = PANEL_TABS.filter((tab) => panelTabAllowed(tab, owner)).map((t) => t.id);
    expect(visible).toEqual(PANEL_TAB_IDS);
  });

  it("каждая вкладка имеет хотя бы одно действие для owner", () => {
    for (const tab of PANEL_TABS) {
      const actions = resolveTabActions(tab, owner);
      expect(actions.length).toBeGreaterThan(0);
    }
  });

  it("owner-only действия скрыты для moderator", () => {
    const cores = PANEL_TABS.find((t) => t.id === "cores")!;
    const ownerActions = resolveTabActions(cores, owner).map((a) => a.id);
    const modActions = resolveTabActions(cores, moderator).map((a) => a.id);
    expect(ownerActions).toContain("cores_open_panel");
    expect(modActions).not.toContain("cores_open_panel");
  });

  it("action id используют префикс своей вкладки", () => {
    for (const tab of PANEL_TABS) {
      const actions = resolveTabActions(tab, owner);
      for (const action of actions) {
        expect(action.id.startsWith(`${tab.id}_`)).toBe(true);
      }
    }
  });
});
