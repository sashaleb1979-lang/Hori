import { normalizeWhitespace } from "@hori/shared";
import type { MessageEnvelope, MessageKind } from "@hori/shared";

export interface MicroReactionResult {
  kind: "toxicity" | "praise";
  reply: string;
  rule: string;
  confidence: number;
  splitChunks?: string[];
}

const toxicityPatterns = [
  /(?:^|[^\p{L}\p{N}_])(?:тупая|дура|дурак|идиотка?|дебилка?|ботяра|заткнись|мразь|придурок|тупой\s+бот)(?=$|[^\p{L}\p{N}_])/iu,
  /(?:^|[^\p{L}\p{N}_])(?:stupid|idiot|moron|dumb|shut\s+up|bad\s+bot)(?=$|[^\p{L}\p{N}_])/iu
];

const praisePatterns = [
  /(?:^|[^\p{L}\p{N}_])(?:умница|молодец|хорошая|милая|классная|лучшая|спасибо|пасиб|красиво|годно|люблю\s+тебя|ты\s+топ)(?=$|[^\p{L}\p{N}_])/iu,
  /(?:^|[^\p{L}\p{N}_])(?:good\s+bot|thanks|thank\s+you|nice|cute|great)(?=$|[^\p{L}\p{N}_])/iu
];

const toxicityReplies = [
  { reply: "сам такой", chunks: ["сам такой", "я запомню"] },
  { reply: "ну зачем обзываться", chunks: ["ну зачем", "обзываться-то"] },
  { reply: "ах ты", chunks: ["ах ты", "ладно, записала"] },
  { reply: "я это запомню", chunks: ["я это", "запомню"] }
] as const;

const praiseReplies = [
  { reply: "хех, приятно", chunks: ["хех", "приятно"] },
  { reply: "ладно, это мило", chunks: ["ладно", "это мило"] },
  { reply: "вот так уже лучше", chunks: ["вот так", "уже лучше"] },
  { reply: "спасибо, пушисто вышло", chunks: ["спасибо", "пушисто вышло"] }
] as const;

export class MicroReactionService {
  detect(input: {
    content: string;
    message: MessageEnvelope;
    messageKind: MessageKind;
  }): MicroReactionResult | null {
    const content = normalizeWhitespace(input.content).toLowerCase();

    if (!content || content.length > 180 || !isDirectedAtHori(input.message)) {
      return null;
    }

    if (input.messageKind === "command_like_request" || input.messageKind === "info_question" || input.messageKind === "request_for_explanation") {
      return null;
    }

    const toxicityHit = toxicityPatterns.some((pattern) => pattern.test(content));
    if (toxicityHit) {
      return this.pick("toxicity", content, toxicityReplies, "direct_toxicity");
    }

    const praiseHit = praisePatterns.some((pattern) => pattern.test(content));
    if (praiseHit) {
      return this.pick("praise", content, praiseReplies, "direct_praise");
    }

    return null;
  }

  private pick(
    kind: MicroReactionResult["kind"],
    content: string,
    variants: readonly { reply: string; chunks: readonly [string, string] }[],
    rule: string
  ): MicroReactionResult {
    const hash = stableHash(content);
    const variant = variants[hash % variants.length];
    const shouldSplit = hash % 100 < 45;

    return {
      kind,
      reply: variant.reply,
      rule,
      confidence: 0.92,
      ...(shouldSplit ? { splitChunks: [...variant.chunks] } : {})
    };
  }
}

function isDirectedAtHori(message: MessageEnvelope) {
  return message.explicitInvocation || message.triggerSource === "reply" || message.mentionedBot || message.mentionsBotByName;
}

function stableHash(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return Math.abs(hash);
}
