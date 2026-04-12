import type { BotIntent, MessageKind, PersonaMode, RelationshipOverlay } from "@hori/shared";

import type { BlockResult } from "./types";

export type ReplyMode =
  | "dry"
  | "mocking"
  | "lazy"
  | "sharp"
  | "semi_meme"
  | "weird_but_relevant"
  | "surprisingly_helpful"
  | "brief_warm";

const chatModes: ReplyMode[] = ["dry", "mocking", "lazy", "sharp", "semi_meme", "weird_but_relevant", "brief_warm"];
const utilityModes: ReplyMode[] = ["dry", "surprisingly_helpful", "sharp"];

function isUtilityIntent(intent: BotIntent) {
  return intent === "help" || intent === "summary" || intent === "search" || intent === "rewrite" || intent === "analytics" || intent === "profile";
}

function isEmotionallyRisky(messageKind: MessageKind) {
  return messageKind === "provocation" || messageKind === "repeated_question";
}

function weightedPick(modes: ReplyMode[], weights: number[]): ReplyMode {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = Math.random() * total;

  for (let i = 0; i < modes.length; i++) {
    roll -= weights[i];
    if (roll <= 0) {
      return modes[i];
    }
  }

  return modes[modes.length - 1];
}

export function resolveReplyMode(options: {
  intent: BotIntent;
  mode: PersonaMode;
  messageKind: MessageKind;
  relationship?: RelationshipOverlay | null;
  isSelfInitiated: boolean;
}): ReplyMode {
  if (options.isSelfInitiated) {
    return "dry";
  }

  if (isUtilityIntent(options.intent)) {
    return weightedPick(utilityModes, [3, 5, 2]);
  }

  if (isEmotionallyRisky(options.messageKind)) {
    return weightedPick(["sharp", "dry", "mocking"], [4, 4, 2]);
  }

  if (options.mode === "playful") {
    return weightedPick(["semi_meme", "mocking", "weird_but_relevant", "brief_warm", "lazy"], [3, 3, 2, 1, 1]);
  }

  if (options.mode === "irritated") {
    return weightedPick(["sharp", "mocking", "dry"], [5, 3, 2]);
  }

  if (options.mode === "sleepy" || options.mode === "detached") {
    return weightedPick(["lazy", "dry", "brief_warm"], [5, 3, 2]);
  }

  if (options.mode === "focused") {
    return weightedPick(["surprisingly_helpful", "dry", "sharp"], [5, 3, 2]);
  }

  const warmRelationship = options.relationship && options.relationship.toneBias !== "neutral" && options.relationship.praiseBias > 0;

  if (warmRelationship) {
    return weightedPick(chatModes, [2, 2, 2, 1, 1, 1, 3]);
  }

  if (options.messageKind === "meme_bait") {
    return weightedPick(["semi_meme", "mocking", "weird_but_relevant", "dry"], [4, 3, 2, 1]);
  }

  if (options.messageKind === "smalltalk_hangout") {
    return weightedPick(["dry", "lazy", "brief_warm", "weird_but_relevant"], [4, 3, 2, 1]);
  }

  return weightedPick(chatModes, [3, 2, 2, 2, 1, 1, 1]);
}

const replyModeDescriptions: Record<ReplyMode, string> = {
  dry: "коротко, ровно, без эмоций, без украшений",
  mocking: "лёгкий подкол, но не злой и не бессмысленный",
  lazy: "вяло, коротко, с лёгким пренебрежением, как будто лень отвечать",
  sharp: "резко, точно, без лишних слов, прямо в суть",
  semi_meme: "полу-мем, полу-живая реплика, коротко и чуть абсурдно",
  weird_but_relevant: "чуть странно, но по теме, неожиданный угол",
  surprisingly_helpful: "неожиданно полезно, кратко и по делу, без показухи",
  brief_warm: "коротко и чуть мягче обычного, без сюсюканья"
};

export function buildReplyModeBlock(mode: ReplyMode): BlockResult {
  return {
    name: "REPLY MODE",
    content: [
      "[REPLY MODE]",
      `current_reply_mode: ${mode}`,
      `hint: ${replyModeDescriptions[mode]}`,
      "Слегка наклони ответ в сторону этого режима. Не ломай базовый характер и не игнорируй контекст."
    ].join("\n")
  };
}
