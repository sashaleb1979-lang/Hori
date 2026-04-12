import type { BotIntent, MessageKind, TriggerSource } from "@hori/shared";

export interface NaturalSplitPlan {
  chunks: string[];
  delayMs: number;
  reason: string;
}

export interface NaturalSplitInput {
  text: string;
  enabled: boolean;
  intent: BotIntent;
  explicitInvocation: boolean;
  triggerSource?: TriggerSource;
  messageKind?: MessageKind;
  nowMs: number;
  lastSplitAtMs?: number;
  cooldownMs: number;
  chance: number;
  random: number;
}

function hasStructuredContent(text: string) {
  return (
    text.includes("```") ||
    /\n/.test(text) ||
    /^\s*[-*]\s+/m.test(text) ||
    /\bhttps?:\/\//i.test(text)
  );
}

function splitOnSentenceBoundary(text: string) {
  const matches = [...text.matchAll(/[.!?…]\s+/gu)];

  for (const match of matches) {
    const index = match.index ?? -1;
    const boundary = index + match[0].trimEnd().length;
    const first = text.slice(0, boundary).trim();
    const second = text.slice(boundary).trim();

    if (first.length >= 24 && first.length <= 140 && second.length >= 24 && second.length <= 180) {
      return [first, second];
    }
  }

  return null;
}

export function planNaturalMessageSplit(input: NaturalSplitInput): NaturalSplitPlan | null {
  const text = input.text.trim();

  if (!input.enabled || input.intent !== "chat" || !input.explicitInvocation) {
    return null;
  }

  if (input.triggerSource === "auto_interject") {
    return null;
  }

  if (input.lastSplitAtMs && input.nowMs - input.lastSplitAtMs < input.cooldownMs) {
    return null;
  }

  if (text.length < 80 || text.length > 380 || hasStructuredContent(text)) {
    return null;
  }

  if (input.messageKind === "info_question" || input.messageKind === "request_for_explanation" || input.messageKind === "command_like_request") {
    return null;
  }

  const adjustedChance = input.messageKind === "meme_bait" || input.messageKind === "smalltalk_hangout"
    ? Math.min(input.chance + 0.04, 0.2)
    : input.chance;

  if (input.random > adjustedChance) {
    return null;
  }

  const chunks = splitOnSentenceBoundary(text);

  if (!chunks) {
    return null;
  }

  return {
    chunks,
    delayMs: 850 + Math.floor(input.random * 600),
    reason: "sentence_boundary"
  };
}
