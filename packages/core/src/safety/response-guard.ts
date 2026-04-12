import { normalizeWhitespace } from "@hori/shared";

const assistantCliches = [
  /если хочешь,? могу\b[^.!?]*/gi,
  /надеюсь,? помог(ла)?\b[^.!?]*/gi,
  /обращайся ещё\b[^.!?]*/gi,
  /с удовольствием\b[^.!?]*/gi,
  /давай разберёмся\b[^.!?]*/gi,
  /рад(а)? помочь\b[^.!?]*/gi,
  /если что,? пиши\b[^.!?]*/gi,
  /не стесняйся спрашивать\b[^.!?]*/gi,
  /чем ещё могу помочь\b[^.!?]*/gi,
  /буду рад(а)? ответить\b[^.!?]*/gi,
  /если надо,? могу\b[^.!?]*/gi,
  /хочешь,? расскажу подробнее\b[^.!?]*/gi,
  /могу подробнее\b[^.!?]*/gi
];

const reasoningLeadIns = [
  /(^|[.!?]\s+)(дело в том, что)\s+/giu,
  /(^|[.!?]\s+)(на самом деле)\s+/giu,
  /(^|[.!?]\s+)(вообще(?:-то)?)\s+/giu,
  /(^|[.!?]\s+)(по сути)\s+/giu,
  /(^|[.!?]\s+)(если честно|честно говоря)\s+/giu,
  /(^|[.!?]\s+)(короче говоря|в целом)\s+/giu
];

function removeRepeatedSentences(text: string) {
  return text.replace(/([^.!?\n]{6,}[.!?])\s+\1/giu, "$1");
}

function stripShortFinalPeriod(text: string) {
  if (text.length > 180 || text.includes("\n") || /\bhttps?:\/\//i.test(text)) {
    return text;
  }

  if (!/[.!?…]$/.test(text) || !text.endsWith(".")) {
    return text;
  }

  if (/\d\.$/.test(text) || /\.\.\.$/.test(text)) {
    return text;
  }

  return text.slice(0, -1).trimEnd();
}

export function normalizeOutput(text: string): string {
  let result = text;

  result = result.replace(/\u2014/g, " — ");
  result = result.replace(/\u2013/g, "-");
  result = result.replace(/ — /g, " - ");

  for (const cliche of assistantCliches) {
    result = result.replace(cliche, "");
  }

  for (const leadIn of reasoningLeadIns) {
    result = result.replace(leadIn, "$1");
  }

  result = removeRepeatedSentences(result);

  result = result.replace(/ +([.!?,;:)])/g, "$1");
  result = result.replace(/([.!?])\1{2,}/g, "$1$1");
  result = result.replace(/  +/g, " ");
  result = result.replace(/\n{3,}/g, "\n\n");
  result = result.trim();

  return result;
}

export class ResponseGuard {
  enforce(text: string, options: { maxChars: number; forbiddenWords: string[] }) {
    let guarded = normalizeWhitespace(text);
    guarded = normalizeOutput(guarded);

    for (const forbiddenWord of options.forbiddenWords) {
      if (!forbiddenWord) {
        continue;
      }

      const escaped = forbiddenWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      guarded = guarded.replace(new RegExp(escaped, "gi"), "[скрыто]");
    }

  if (guarded.length > options.maxChars) {
      guarded = `${guarded.slice(0, options.maxChars - 3).trim()}...`;
    }

    return stripShortFinalPeriod(guarded);
  }
}

