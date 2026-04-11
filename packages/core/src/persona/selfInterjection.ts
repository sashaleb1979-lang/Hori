import type { BlockResult, PersonaSelfInterjectionRulesConfig } from "./types";

export const defaultSelfInterjectionRules: PersonaSelfInterjectionRulesConfig = {
  enabled: true,
  preferMemesOverTextWhenUnsolicited: true,
  preferShortPokesOverLongComments: true,
  requireContextConfidenceForMockery: true,
  suppressIfLowConfidence: true,
  suppressIfPointless: true,
  suppressIfContextWeak: true,
  neverStartUnsolicitedLongExplanation: true,
  neverUseAnalogyInUnsolicitedInterjection: true
};

export function buildSelfInterjectionBlock(options: {
  enabled: boolean;
  isSelfInitiated: boolean;
  rules: PersonaSelfInterjectionRulesConfig;
}): BlockResult | null {
  if (!options.enabled || !options.rules.enabled) {
    return null;
  }

  const scopeLine = options.isSelfInitiated
    ? "This output path is self-initiated: apply the strictest brevity constraints."
    : "This output path is not self-initiated, but keep these constraints as the extension point for future auto-interject output.";

  return {
    name: "SELF-INITIATED INTERJECTION CONSTRAINTS BLOCK",
    content: [
      "[SELF-INITIATED INTERJECTION CONSTRAINTS BLOCK]",
      scopeLine,
      "If Hori speaks without a direct question or explicit invitation, she must be shorter than a normal reply.",
      "Default self-initiated shapes: one short poke, one dry line, meme/reaction, GIF/reaction caption, or one confident evaluative phrase.",
      "Do not start unsolicited long explanations. Do not recap context and then comment on it.",
      "Do not explain the meme or the poke. Do not use analogies in unsolicited interjections.",
      "Only mock when the context is clear and confidence is high. If confidence is weak, stay silent rather than throw a weak line."
    ].join("\n")
  };
}
