import { clamp, normalizeWhitespace } from "@hori/shared";

export interface SelectiveEngagementInput {
  content: string;
  enabled: boolean;
  autoInterjectEnabled: boolean;
  channelAllowsInterjections: boolean;
  channelMuted: boolean;
  hasAttachments: boolean;
  interjectTendency: number;
  relationshipDoNotInitiate?: boolean;
  relationshipProactivityPreference?: number | null;
  relationshipInterruptPriority?: number | null;
  minScore: number;
}

export interface SelectiveEngagementDecision {
  shouldInterject: boolean;
  score: number;
  reason: string;
  triggers: string[];
}

const IGNORE_PATTERNS = [
  /^[/!?.][\w-]+/u,
  /^```/u,
  /\bhttps?:\/\/\S+\s*$/iu
];

function deny(reason: string, score = 0, triggers: string[] = []): SelectiveEngagementDecision {
  return { shouldInterject: false, score, reason, triggers };
}

export function evaluateSelectiveEngagement(input: SelectiveEngagementInput): SelectiveEngagementDecision {
  const content = normalizeWhitespace(input.content);

  if (!input.enabled || !input.autoInterjectEnabled) {
    return deny("feature_disabled");
  }

  if (input.channelMuted || !input.channelAllowsInterjections) {
    return deny("channel_policy");
  }

  if (input.relationshipDoNotInitiate) {
    return deny("relationship_do_not_initiate");
  }

  if (content.length < 12 || IGNORE_PATTERNS.some((pattern) => pattern.test(content))) {
    return deny("low_signal");
  }

  const lower = content.toLowerCase();
  const triggers: string[] = [];
  let score = 0.05 + clamp(input.interjectTendency, 0, 5) * 0.025;

  if (/(что думаете|как считаете|как думаете|есть мнения)/iu.test(lower)) {
    score += 0.46;
    triggers.push("group_opinion");
  }

  if (/(кто прав|я прав|она права|он прав|они правы)/iu.test(lower)) {
    score += 0.7;
    triggers.push("conflict_opinion");
  }

  if (/(может кто знает|кто знает|помогите|что делать|как лучше)/iu.test(lower)) {
    score += 0.38;
    triggers.push("help_open_question");
  }

  if (/(хори|hori)/iu.test(lower)) {
    score += 0.3;
    triggers.push("name_nearby");
  }

  if (/[?？]/u.test(content)) {
    score += 0.12;
    triggers.push("question_mark");
  }

  if (input.hasAttachments) {
    score -= 0.08;
  }

  score += clamp(input.relationshipProactivityPreference ?? 0.5, 0, 1) * 0.08;
  score += clamp(input.relationshipInterruptPriority ?? 0, 0, 5) * 0.025;
  score = clamp(score, 0, 1);

  if (score < input.minScore) {
    return deny("score_below_threshold", score, triggers);
  }

  return {
    shouldInterject: true,
    score,
    reason: triggers.join("+") || "ambient_salience",
    triggers
  };
}
