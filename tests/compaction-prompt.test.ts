import { describe, expect, it } from "vitest";

import { buildCompactionUserPrompt } from "@hori/memory";

describe("compaction-prompt", () => {
  it("wraps prior context separately from the current segment", () => {
    const prompt = buildCompactionUserPrompt(
      ["старый summary 1", "старый summary 2"],
      [
        { role: "user", content: "я ненавижу спам" },
        { role: "assistant", content: "ок, не буду лишний раз пинговать" },
      ],
    );

    expect(prompt).toContain("<prior_context>");
    expect(prompt).toContain("старый summary 1");
    expect(prompt).toContain("Теперь суммируй только новый сегмент разговора:");
    expect(prompt).toContain("user: я ненавижу спам");
    expect(prompt).toContain("assistant: ок, не буду лишний раз пинговать");
  });
});