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

  if (options.messageKind === "meta_feedback") {
    return "dry";
  }

  if (isUtilityIntent(options.intent)) {
    return options.mode === "focused" ? "surprisingly_helpful" : weightedPick(utilityModes, [6, 3, 1]);
  }

  if (isEmotionallyRisky(options.messageKind)) {
    return "dry";
  }

  if (options.messageKind === "smalltalk_hangout" || options.messageKind === "casual_address" || options.messageKind === "direct_mention" || options.messageKind === "reply_to_bot" || options.messageKind === "info_question") {
    return "dry";
  }

  if (options.messageKind === "meme_bait") {
    return options.mode === "playful" ? "semi_meme" : "dry";
  }

  if (options.mode === "sleepy" || options.mode === "detached") {
    return "lazy";
  }

  if (options.mode === "focused") {
    return "surprisingly_helpful";
  }

  if (options.mode === "irritated") {
    return "sharp";
  }

  if (options.mode === "playful") {
    return "brief_warm";
  }

  if (options.relationship && options.relationship.toneBias !== "neutral" && options.relationship.praiseBias > 0) {
    return "brief_warm";
  }

  return "dry";
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
