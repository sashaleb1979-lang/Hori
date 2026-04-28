import { describe, expect, it } from "vitest";

import {
  HORI_PANEL_TABS,
  TAB_COLOR,
  TAB_EMOJI,
  type HoriPanelTab
} from "../apps/bot/src/panel/constants";

describe("V6 Phase K: /hori panel tab matrix", () => {
  it("includes all V6 tabs", () => {
    const required: HoriPanelTab[] = [
      "main",
      "persona",
      "behavior",
      "memory",
      "channels",
      "llm",
      "system",
      "relationship",
      "recall",
      "sigils",
      "queue",
      "flash",
      "audit"
    ];
    for (const tab of required) {
      expect(HORI_PANEL_TABS).toContain(tab);
    }
  });

  it("every tab has emoji and color", () => {
    for (const tab of HORI_PANEL_TABS) {
      expect(TAB_EMOJI[tab]).toBeTruthy();
      expect(typeof TAB_COLOR[tab]).toBe("number");
    }
  });

  it("V6 tabs use distinct colors from main", () => {
    expect(TAB_COLOR.relationship).not.toBe(TAB_COLOR.main);
    expect(TAB_COLOR.audit).not.toBe(TAB_COLOR.main);
    expect(TAB_COLOR.queue).not.toBe(TAB_COLOR.main);
  });
});
