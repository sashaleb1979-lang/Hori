import type { ChannelKind, PersonaMode, RequestedDepth } from "@hori/shared";

import type { BlockResult, PersonaChannelStyleConfig } from "./types";

export const channelKinds = ["general", "memes", "serious", "help", "bot", "offtopic", "late_night"] as const;

export const defaultChannelOverrides: Record<ChannelKind, PersonaChannelStyleConfig> = {
  general: {
    modeBias: "normal",
    depthBias: "short",
    slangDelta: 0,
    memeDelta: 0,
    clarityDelta: 0,
    sharpnessDelta: 0,
    notes: ["ordinary server chat", "moderate irony", "short and alive"]
  },
  memes: {
    modeBias: "playful",
    depthBias: "tiny",
    slangDelta: 0.25,
    memeDelta: 0.35,
    clarityDelta: -0.1,
    sharpnessDelta: 0.2,
    notes: ["more riffing and pokes", "avoid lecturer mode", "one-liners are fine"]
  },
  serious: {
    modeBias: "focused",
    depthBias: "normal",
    slangDelta: -0.25,
    memeDelta: -0.25,
    clarityDelta: 0.35,
    sharpnessDelta: -0.15,
    notes: ["lower meme density", "clearer factual phrasing", "no pointless harshness"]
  },
  help: {
    modeBias: "focused",
    depthBias: "normal",
    slangDelta: -0.2,
    memeDelta: -0.2,
    clarityDelta: 0.3,
    sharpnessDelta: -0.2,
    notes: ["useful and clear", "do not become support-robot polite", "no lecture unless needed"]
  },
  bot: {
    modeBias: "dry",
    depthBias: "short",
    slangDelta: -0.35,
    memeDelta: -0.35,
    clarityDelta: 0.35,
    sharpnessDelta: -0.1,
    notes: ["functional answers", "less character noise", "compact utility"]
  },
  offtopic: {
    modeBias: "normal",
    depthBias: "short",
    slangDelta: 0.15,
    memeDelta: 0.1,
    clarityDelta: 0,
    sharpnessDelta: 0.1,
    notes: ["freer chat tone", "slightly sharper and looser if context fits"]
  },
  late_night: {
    modeBias: "sleepy",
    depthBias: "tiny",
    slangDelta: -0.05,
    memeDelta: 0,
    clarityDelta: -0.05,
    sharpnessDelta: 0,
    notes: ["lower energy", "shorter", "lazy Discord tone is allowed"]
  }
};

const channelNameMatchers: Array<{ kind: ChannelKind; regex: RegExp }> = [
  { kind: "memes", regex: /(мем|meme|shitpost|рофл|лол|funny)/i },
  { kind: "serious", regex: /(serious|серь[её]з|важн|полит|news|новост)/i },
  { kind: "help", regex: /(help|support|помощ|вопрос|ask|faq)/i },
  { kind: "bot", regex: /(bot|бот|команд|admin|debug|dev)/i },
  { kind: "offtopic", regex: /(offtopic|оффтоп|флуд|random|chat)/i },
  { kind: "late_night", regex: /(night|ноч|late)/i }
];

export function isChannelKind(value: unknown): value is ChannelKind {
  return typeof value === "string" && (channelKinds as readonly string[]).includes(value);
}

export function modeTagValue(tags: readonly string[] | undefined): PersonaMode | undefined {
  const tag = tags?.find((entry) => /^mode:/i.test(entry.trim()));
  const value = tag?.split(":", 2)[1]?.trim();

  if (value && ["normal", "playful", "dry", "irritated", "focused", "sleepy", "detached"].includes(value)) {
    return value as PersonaMode;
  }

  return undefined;
}

export function depthTagValue(tags: readonly string[] | undefined): RequestedDepth | undefined {
  const tag = tags?.find((entry) => /^depth:/i.test(entry.trim()));
  const value = tag?.split(":", 2)[1]?.trim();

  if (value && ["tiny", "short", "normal", "long", "deep"].includes(value)) {
    return value as RequestedDepth;
  }

  return undefined;
}

export function resolveChannelKind(options: {
  override?: ChannelKind;
  topicInterestTags?: readonly string[];
  channelName?: string | null;
}) {
  if (isChannelKind(options.override)) {
    return options.override;
  }

  const taggedKind = options.topicInterestTags
    ?.map((tag) => tag.trim().toLowerCase())
    .find((tag) => tag.startsWith("kind:"))
    ?.split(":", 2)[1];

  if (isChannelKind(taggedKind)) {
    return taggedKind;
  }

  const channelName = options.channelName?.trim();
  if (channelName) {
    const match = channelNameMatchers.find((entry) => entry.regex.test(channelName));
    if (match) {
      return match.kind;
    }
  }

  return "general";
}

export function buildChannelStyleBlock(kind: ChannelKind, config: PersonaChannelStyleConfig): BlockResult {
  return {
    name: "CHANNEL CONTEXT BLOCK",
    content: [
      "[CHANNEL CONTEXT BLOCK]",
      `Channel kind: ${kind}. Mode bias: ${config.modeBias ?? "none"}. Depth bias: ${config.depthBias ?? "none"}.`,
      `Style deltas: slang=${config.slangDelta}, meme=${config.memeDelta}, clarity=${config.clarityDelta}, sharpness=${config.sharpnessDelta}.`,
      `Channel guidance: ${config.notes.join("; ")}.`
    ].join("\n")
  };
}
