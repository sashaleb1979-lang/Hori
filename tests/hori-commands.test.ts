import { describe, expect, it } from "vitest";

import { getSlashCommandDefinitions } from "../apps/bot/src/commands/definitions";

describe("hori command registration", () => {
  it("registers only /hori by default", () => {
    const definitions = getSlashCommandDefinitions();

    expect(definitions).toHaveLength(1);
    expect(definitions[0]?.name).toBe("hori");
  });

  it("can include legacy bot commands behind the flag", () => {
    const definitions = getSlashCommandDefinitions({ includeLegacy: true });
    const names = definitions.map((definition) => definition.name);

    expect(names).toContain("hori");
    expect(names).toContain("bot-help");
    expect(names).toContain("bot-power");
    expect(names.length).toBeGreaterThan(1);
  });
});