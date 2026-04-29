import { describe, it, expect } from "vitest";
import {
  buildSigilOverlayBlock,
  corePromptKeyForSigil,
  CORE_PROMPT_DEFINITIONS,
  type CorePromptTemplates
} from "@hori/core";

const EMPTY_TEMPLATES: CorePromptTemplates = {
  commonCore: "",
  relationshipTails: { base: "", warm: "", close: "", teasing: "", sweet: "", serious: "" },
  coldTail: "",
  aggressionCheckerPrompt: "",
  memorySummarizerPrompt: "",
  relationshipEvaluatorPrompt: ""
};

describe("V6 Item 12: sigil overlay core prompts", () => {
  it("maps `?` to sigil_question", () => {
    expect(corePromptKeyForSigil("?")).toBe("sigil_question");
  });

  it("maps `!` to sigil_force_rewrite", () => {
    expect(corePromptKeyForSigil("!")).toBe("sigil_force_rewrite");
  });

  it("maps `*` to sigil_summary", () => {
    expect(corePromptKeyForSigil("*")).toBe("sigil_summary");
  });

  it("returns null for unknown sigil", () => {
    expect(corePromptKeyForSigil(">")).toBeNull();
    expect(corePromptKeyForSigil("")).toBeNull();
  });

  it("buildSigilOverlayBlock returns default content for `?`", () => {
    const block = buildSigilOverlayBlock(EMPTY_TEMPLATES, "?");
    expect(block).toContain("web-search");
    expect(block).toBe(CORE_PROMPT_DEFINITIONS.sigil_question.defaultContent.trim());
  });

  it("buildSigilOverlayBlock honors override over default", () => {
    const override = { sigil_question: "ОВЕРРАЙД-БЛОК" };
    expect(buildSigilOverlayBlock(EMPTY_TEMPLATES, "?", override)).toBe("ОВЕРРАЙД-БЛОК");
  });

  it("buildSigilOverlayBlock returns empty string for null/unknown sigil", () => {
    expect(buildSigilOverlayBlock(EMPTY_TEMPLATES, null)).toBe("");
    expect(buildSigilOverlayBlock(EMPTY_TEMPLATES, ">")).toBe("");
  });

  it("CORE_PROMPT_DEFINITIONS has all three sigil keys", () => {
    expect(CORE_PROMPT_DEFINITIONS).toHaveProperty("sigil_question");
    expect(CORE_PROMPT_DEFINITIONS).toHaveProperty("sigil_force_rewrite");
    expect(CORE_PROMPT_DEFINITIONS).toHaveProperty("sigil_summary");
  });
});
