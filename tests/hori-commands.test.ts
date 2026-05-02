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

  it("marks /hori panel as owner-only and exposes channel response-length override", () => {
    const definitions = getSlashCommandDefinitions();
    const horiCommand = definitions[0];
    const panel = horiCommand?.options?.find((option) => option.name === "panel");
    const channel = horiCommand?.options?.find((option) => option.name === "channel");
    const profile = horiCommand?.options?.find((option) => option.name === "profile");
    const dossierOption = profile && "options" in profile
      ? profile.options?.find((option) => option.name === "dossier")
      : null;
    const responseLength = channel && "options" in channel
      ? channel.options?.find((option) => option.name === "response-length")
      : null;

    expect(panel?.description).toContain("Owner");
    expect(dossierOption?.description).toContain("Owner");
    expect(responseLength && "choices" in responseLength ? responseLength.choices?.map((choice) => choice.value) : []).toEqual([
      "short",
      "medium",
      "long",
      "inherit"
    ]);
  });

  it("registers the V5 admin subcommands and manual relationship state control", () => {
    const definitions = getSlashCommandDefinitions();
    const horiCommand = definitions[0];
    const importCommand = horiCommand?.options?.find((option) => option.name === "import");
    const runtime = horiCommand?.options?.find((option) => option.name === "runtime");
    const aggression = horiCommand?.options?.find((option) => option.name === "aggression");
    const memoryCards = horiCommand?.options?.find((option) => option.name === "memory-cards");
    const relationship = horiCommand?.options?.find((option) => option.name === "relationship");
    const relationshipState = relationship && "options" in relationship
      ? relationship.options?.find((option) => option.name === "relationship-state")
      : null;
    const importMode = importCommand && "options" in importCommand
      ? importCommand.options?.find((option) => option.name === "mode")
      : null;

    expect(runtime?.description).toContain("V5");
    expect(aggression?.description).toContain("aggression");
    expect(memoryCards?.description).toContain("memory cards");
    expect(relationshipState && "choices" in relationshipState ? relationshipState.choices?.map((choice) => choice.value) : []).toContain("sweet");
    expect(importMode && "choices" in importMode ? importMode.choices?.map((choice) => choice.value) : []).toEqual(["history", "knowledge"]);
  });
});
