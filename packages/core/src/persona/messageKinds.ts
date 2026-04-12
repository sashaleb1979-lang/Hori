import type { BotIntent, ContextBundle, MessageEnvelope, MessageKind } from "@hori/shared";

import type { BlockResult } from "./types";

export const messageKinds = [
  "direct_mention",
  "reply_to_bot",
  "casual_address",
  "smalltalk_hangout",
  "info_question",
  "opinion_question",
  "request_for_explanation",
  "meme_bait",
  "provocation",
  "repeated_question",
  "low_signal_noise",
  "command_like_request"
] as const;

const messageKindNotes: Record<MessageKind, string[]> = {
  direct_mention: ["answer directly", "higher priority", "do not mumble"],
  reply_to_bot: ["preserve continuity", "do not restart the topic from scratch"],
  casual_address: ["shorter", "alive", "human-like Discord flow"],
  smalltalk_hangout: ["low-pressure hangout chat", "short and natural", "do not treat it like a task"],
  info_question: ["less riffing if the question is real", "increase clarity when needed"],
  opinion_question: ["evaluation is allowed", "ideological flavour can show up if the topic fits"],
  request_for_explanation: ["can be longer", "higher density", "no article tone and no analogies"],
  meme_bait: ["short and sharp is fine", "do not turn into a lecturer"],
  provocation: ["do not always give a long serious answer", "dry or sharp replies are allowed"],
  repeated_question: ["lower patience", "shorter", "can show mild irritation"],
  low_signal_noise: ["very short reply is enough", "do not expand weak input"],
  command_like_request: ["more functional", "less extra character noise", "more utility"]
};

function normalizeForRepeat(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

const unicodeWordBoundaryEnd = String.raw`(?=$|[^\p{L}\p{N}_])`;
const unicodeWordBoundaryAround = (pattern: string) => new RegExp(String.raw`(?:^|[^\p{L}\p{N}_])(?:${pattern})${unicodeWordBoundaryEnd}`, "iu");
const unicodeStartsWithWord = (pattern: string) => new RegExp(String.raw`^(?:${pattern})${unicodeWordBoundaryEnd}`, "iu");

const questionLikePattern = unicodeStartsWithWord(
  "как|что|кто|где|когда|зачем|почему|сколько|какой|какая|какие|можно|надо ли|правда ли"
);

const commandLikePattern = unicodeStartsWithWord("найди|сделай|перепиши|запомни|забудь|покажи|дай|скинь");

const smalltalkHangoutPatterns = [
  unicodeStartsWithWord("(?:хори[,.!\\s-]*)?(?:привет|хай|хелло|здарова|здрасьте|доброе\\s+утро|добрый\\s+день|добрый\\s+вечер|ку|йо)"),
  unicodeStartsWithWord("(?:ну\\s+)?(?:как\\s+дела|как\\s+ты|че\\s+как|ч[её]\\s+как|что\\s+делаешь|чем\\s+занимаешься)"),
  unicodeWordBoundaryAround(
    "просто\\s+поболтать(?:\\s+хочу)?|поболтать(?:\\s+хочу)?|просто\\s+поговорить(?:\\s+хочу)?|скучно|мне\\s+скучно|да\\s+так|пока\\s+ничего\\s+не\\s+делаю|ничего\\s+не\\s+делаю"
  )
];

function isQuestionLike(content: string) {
  const normalized = content.trim();
  return normalized.includes("?") || questionLikePattern.test(normalized);
}

function isLowSignal(content: string) {
  const normalized = content.trim();
  return normalized.length <= 3 || /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s!?.,]+$/u.test(normalized);
}

function isSmalltalkHangout(content: string, intent: BotIntent) {
  if (intent !== "chat") {
    return false;
  }

  const normalized = content.trim();

  if (!normalized || normalized.length > 160) {
    return false;
  }

  return smalltalkHangoutPatterns.some((pattern) => pattern.test(normalized));
}

function repeatedInContext(content: string, context?: ContextBundle | null) {
  const normalized = normalizeForRepeat(content);

  if (normalized.length < 8 || !context?.recentMessages.length) {
    return false;
  }

  const matches = context.recentMessages.filter((message) => normalizeForRepeat(message.content) === normalized);
  return matches.length >= 2;
}

export function isMessageKind(value: unknown): value is MessageKind {
  return typeof value === "string" && (messageKinds as readonly string[]).includes(value);
}

export function detectMessageKind(options: {
  override?: MessageKind;
  content: string;
  intent: BotIntent;
  message: MessageEnvelope;
  context?: ContextBundle | null;
}) {
  if (isMessageKind(options.override)) {
    return options.override;
  }

  const content = options.content.trim();

  if (repeatedInContext(content, options.context)) {
    return "repeated_question";
  }

  if (isLowSignal(content)) {
    return "low_signal_noise";
  }

  if (/(объясни|поясни|разбери|почему так|как работает|в ч[её]м смысл|подробно|разверн[уё]то)/i.test(content)) {
    return "request_for_explanation";
  }

  if (
    options.intent === "summary" ||
    options.intent === "analytics" ||
    options.intent === "search" ||
    options.intent === "memory_write" ||
    options.intent === "memory_forget" ||
    options.intent === "rewrite" ||
    commandLikePattern.test(content)
  ) {
    return "command_like_request";
  }

  if (/(кто прав|что думаешь|мнение|как считаешь|твой тейк|оцени|правда ли|левый|коммунизм|израил|палестин|полит)/i.test(content)) {
    return "opinion_question";
  }

  if (/(ахах|лол|рофл|мем|кринж|байт|bait|шутк|угар|смешн|база\?|based)/i.test(content)) {
    return "meme_bait";
  }

  if (/(заткнись|тупая|ботяра|провокац|слабый бот|ты вообще|чушь нес[её]шь|идиот|дура)/i.test(content)) {
    return "provocation";
  }

  if (isSmalltalkHangout(content, options.intent)) {
    return "smalltalk_hangout";
  }

  if (isQuestionLike(content)) {
    return "info_question";
  }

  if (options.message.triggerSource === "reply") {
    return "reply_to_bot";
  }

  if (options.message.triggerSource === "mention" || options.message.mentionedBot) {
    return "direct_mention";
  }

  return "casual_address";
}

export function buildMessageKindBlock(kind: MessageKind): BlockResult {
  return {
    name: "MESSAGE KIND BLOCK",
    content: [
      "[MESSAGE KIND BLOCK]",
      `Message kind: ${kind}.`,
      `Behavior: ${messageKindNotes[kind].join("; ")}.`,
      "Do not repeat the user's wording unless it is necessary for disambiguation."
    ].join("\n")
  };
}
