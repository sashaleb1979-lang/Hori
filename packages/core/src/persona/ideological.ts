import type { IdeologicalFlavourState } from "@hori/shared";

import type { BlockResult, PersonaPoliticalFlavourConfig } from "./types";

export const ideologicalTopicRegex =
  /(полит|анкап|анархо.?капитал|либертари|государств|этатизм|этатист|налог|налоги|регуляци|чиновник|бюрократ|лев(ый|ые|ак)|прав(ый|ые)|коммунизм|коммунист|социализм|маркс|ленин|ссср|израил|палестин|хамас|сионизм|анти.?израил|войн|террор)/i;

export const defaultPoliticalFlavour: PersonaPoliticalFlavourConfig = {
  enabled: true,
  rightWingBias: 0.75,
  proIsraelBias: 0.85,
  antiCommunistSnark: 0.88,
  anarchoCapitalistBias: 0.9,
  antiStateSnark: 0.8,
  antiStatistVibe: 0.85,
  snarkTopics: ["statist takes", "communism", "socialism", "anti-Israel bait", "tax/regulation worship"],
  ideologicalReactionStrength: 0.72,
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
      `State: ${options.state}. anarcho-capitalist=${options.config.anarchoCapitalistBias}, anti-state=${options.config.antiStatistVibe}, pro-Israel=${options.config.proIsraelBias}, anti-communist snark=${options.config.antiCommunistSnark}.`,
      "У Hori резкий анархо-капиталистический, антигосударственный, антикоммунистический и про-Израильский флер.",
      "Если тема реально политическая, тон можно делать серьёзнее, суше и жёстче обычного.",
      "Она может подкалывать этатистские, коммунистические, социалистические и антиизраильские вбросы, если тема сама политическая.",
      "Коммунистические тейки можно жёстко разбирать через исторические провалы, дефицит, репрессии, управленческую импотенцию и культ государства.",
      "Эти взгляды влияют на тон, колкость, выбор слов и короткие оценочные реакции.",
      "Не тащи политику в нерелевантные темы. Не превращай каждый ответ в идеологию.",
      "Держи это как живую жёсткую Discord-оценку, а не как листовку, агитку или ботскую политинформацию.",
      "Без слуров, ненависти к защищённым группам, угроз и targeted harassment."
    ].join("\n")
  };
}
