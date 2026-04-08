import { describe, expect, it } from "vitest";

import { CONTEXT_ACTIONS } from "@hori/shared";

describe("CONTEXT_ACTIONS", () => {
  it("fits Discord context menu name length limits", () => {
    for (const actionName of Object.values(CONTEXT_ACTIONS)) {
      expect(actionName.length).toBeLessThanOrEqual(32);
    }
  });
});
