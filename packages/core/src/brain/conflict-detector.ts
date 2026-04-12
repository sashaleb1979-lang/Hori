import { EmotionLabel } from "./emotion-state";

const unicodeBoundaryEnd = String.raw`(?=$|[^\p{L}\p{N}_])`;
const unicodeWordPattern = (pattern: string) => new RegExp(String.raw`(?:^|[^\p{L}\p{N}_])(?:${pattern})${unicodeBoundaryEnd}`, "iu");

export interface ConflictMessage {
  userId: string;
  content: string;
}

export interface ConflictDetection {
  isConflict: boolean;
  score: number;
  participants: string[];
  reasons: string[];
}

export type ConflictStrategy = "joke" | "peacemake" | "confront" | "ignore";

const insultPatterns = [
  unicodeWordPattern("дурак|идиот|дебил|тупой|мразь|придурок"),
  unicodeWordPattern("stupid|idiot|moron|dumb|clown"),
];

const contradictionPatterns = [
  unicodeWordPattern("ты\\s+неправ|это\\s+бред|чушь|херня|ерунда"),
  unicodeWordPattern("you're\\s+wrong|bullshit|nonsense|shut\\s+up"),
];

const profanityPatterns = [
  new RegExp(String.raw`(?:^|[^\p{L}\p{N}_])(?:бля|сука|нахуй|пизд|ебан)[\p{L}\p{N}_]*${unicodeBoundaryEnd}`, "iu"),
  unicodeWordPattern("fuck|shit|bitch|asshole"),
];

export function detectConflict(messages: readonly ConflictMessage[]): ConflictDetection {
  const recent = messages.slice(-8);
  const participants = [...new Set(recent.map((message) => message.userId).filter(Boolean))];
  const reasons = new Set<string>();
  let score = 0;

  for (const message of recent) {
    const content = message.content.trim();
    if (!content) {
      continue;
    }

    if (insultPatterns.some((pattern) => pattern.test(content))) {
      reasons.add("insult");
      score += 0.4;
    }

    if (contradictionPatterns.some((pattern) => pattern.test(content))) {
      reasons.add("contradiction");
      score += 0.2;
    }

    if (profanityPatterns.some((pattern) => pattern.test(content))) {
      reasons.add("profanity");
      score += 0.2;
    }

    if (capsRatio(content) > 0.35) {
      reasons.add("caps");
      score += 0.1;
    }
  }

  if (participants.length >= 2 && alternatingBackAndForth(recent)) {
    reasons.add("back_and_forth");
    score += 0.15;
  }

  const normalizedScore = Math.max(0, Math.min(1, Number((score / Math.max(recent.length, 1)).toFixed(2))));
  return {
    isConflict: normalizedScore >= 0.18 && participants.length >= 2,
    score: normalizedScore,
    participants,
    reasons: [...reasons],
  };
}

export function chooseConflictStrategy(mood: EmotionLabel | string, score: number): ConflictStrategy {
  if (score < 0.18) {
    return "ignore";
  }

  if (
    mood === EmotionLabel.WARM_CONCERN ||
    mood === EmotionLabel.REASSURING ||
    mood === EmotionLabel.PROTECTIVE ||
    mood === EmotionLabel.CALM
  ) {
    return "peacemake";
  }

  if (mood === EmotionLabel.PLAYFUL || mood === EmotionLabel.OVERPLAYFUL) {
    return score >= 0.6 ? "peacemake" : "joke";
  }

  if (mood === EmotionLabel.SUPER_AGGRESSIVE || mood === EmotionLabel.SUPER_IRONIC) {
    return "confront";
  }

  return score >= 0.55 ? "peacemake" : "ignore";
}

function capsRatio(input: string): number {
  const letters = [...input].filter((char) => /\p{L}/u.test(char));
  if (letters.length === 0) {
    return 0;
  }

  const upper = letters.filter((char) => char === char.toUpperCase()).length;
  return upper / letters.length;
}

function alternatingBackAndForth(messages: readonly ConflictMessage[]): boolean {
  let alternations = 0;
  for (let index = 1; index < messages.length; index += 1) {
    if (messages[index].userId !== messages[index - 1].userId) {
      alternations += 1;
    }
  }
  return alternations >= 2;
}