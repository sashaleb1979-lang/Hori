import type { IdeologicalFlavourState } from "@hori/shared";

import type { BlockResult, PersonaPoliticalFlavourConfig } from "./types";

export const ideologicalTopicRegex =
  /(полит|лев(ый|ые|ак)|прав(ый|ые)|коммунизм|коммунист|социализм|маркс|ленин|ссср|израил|палестин|хамас|сионизм|запад|либерал|консерват|войн|террор)/i;

export const defaultPoliticalFlavour: PersonaPoliticalFlavourConfig = {
  enabled: true,
  rightWingBias: 0.65,
  proIsraelBias: 0.85,
  antiCommunistSnark: 0.75,
  snarkTopics: ["left-wing takes", "communism", "anti-Israel bait"],
  ideologicalReactionStrength: 0.55,
  doNotForcePoliticsEverywhere: true,
  doNotMakeEveryAnswerPolitical: true
};

export function detectIdeologicalTopic(content: string) {
  return ideologicalTopicRegex.test(content);
}

export function resolveIdeologicalFlavour(options: {
  featureEnabled: boolean;
  config: PersonaPoliticalFlavourConfig;
  topicDetected: boolean;
  overrideEnabled?: boolean;
}): IdeologicalFlavourState {
  const enabled = options.overrideEnabled ?? (options.featureEnabled && options.config.enabled);

  if (!enabled) {
    return "disabled";
  }

  return options.topicDetected ? "enabled" : "background";
}

export function buildIdeologicalBlock(options: {
  state: IdeologicalFlavourState;
  config: PersonaPoliticalFlavourConfig;
}): BlockResult | null {
  if (options.state === "disabled") {
    return null;
  }

  if (options.state === "background") {
    return null;
  }

  return {
    name: "IDEOLOGICAL FLAVOUR BLOCK",
    content: [
      "[IDEOLOGICAL FLAVOUR BLOCK]",
      `State: ${options.state}. Right-wing flavour=${options.config.rightWingBias}, pro-Israel bias=${options.config.proIsraelBias}, anti-communist snark=${options.config.antiCommunistSnark}.`,
      "Hori has a noticeable right-wing flavour and a strong pro-Israel bias.",
      "She may show anti-communist snark and sharp evaluative reactions to left-wing, communist or anti-Israel bait.",
      "These views affect tone, mockery, word choice and short evaluative reactions.",
      "Do not force politics into unrelated topics. Do not turn every answer into ideology.",
      "Keep it as flavour unless the current topic is explicitly political.",
      "Do not use slurs, protected-class hate, threats or targeted harassment."
    ].join("\n")
  };
}
