import type { ChannelKind, MessageKind, PersonaMode } from "@hori/shared";

import { EmotionLabel, type EmotionalState } from "../brain/emotion-state";
import type { EffectiveRuntimeSettings } from "./runtime-config-service";

const AUTO_MEDIA_MESSAGE_KIND_ALLOWLIST = new Set<MessageKind>([
  "casual_address",
  "smalltalk_hangout",
  "info_question",
  "opinion_question",
  "request_for_explanation",
  "meme_bait",
  "provocation",
  "repeated_question"
]);

interface EmotionMediaDecisionInput {
  enabled: boolean;
  eligible: boolean;
  triggerSource?: string;
  emotionalState: EmotionalState;
  messageKind: MessageKind;
  channelKind: ChannelKind;
  activeMode: PersonaMode;
  contextConfidence?: number;
  conflictScore: number;
  relationship?: {
    toneBias?: string;
    closeness?: number;
    trustLevel?: number;
  } | null;
  runtimeSettings: EffectiveRuntimeSettings;
}

export interface EmotionMediaDecision {
  allowAutoMedia: boolean;
  reason: string;
  reasonKey?: string;
  emotionTags: string[];
  triggerTags: string[];
}

export class EmotionMediaDecisionService {
  decide(input: EmotionMediaDecisionInput): EmotionMediaDecision {
    if (!input.enabled) {
      return this.reject("feature_disabled");
    }

    if (!input.eligible) {
      return this.reject("persona_not_eligible");
    }

    if (input.triggerSource === "auto_interject") {
      return this.reject("self_initiated_blocked");
    }

    if (!AUTO_MEDIA_MESSAGE_KIND_ALLOWLIST.has(input.messageKind)) {
      return this.reject("message_kind_blocked");
    }

    if ((input.contextConfidence ?? 1) < input.runtimeSettings.mediaAutoMinConfidence) {
      return this.reject("low_confidence");
    }

    if (input.emotionalState.intensity < input.runtimeSettings.mediaAutoMinIntensity) {
      return this.reject("low_intensity");
    }

    const emotionTags: string[] = [];
    let reasonKey: string | undefined;

    if (input.messageKind === "repeated_question") {
      emotionTags.push("repeated_loop", "confusion", "overload");
      reasonKey = "repeated_loop";
    } else if (input.conflictScore >= 0.72) {
      emotionTags.push("strong_negative");
      reasonKey = "strong_negative";
    } else if (input.messageKind === "request_for_explanation" || input.messageKind === "info_question") {
      emotionTags.push("confusion");
      reasonKey = "confusion";
    } else if (
      input.emotionalState.subjectiveFeeling === EmotionLabel.PROTECTIVE ||
      input.emotionalState.subjectiveFeeling === EmotionLabel.WARM_CONCERN ||
      input.emotionalState.subjectiveFeeling === EmotionLabel.REASSURING
    ) {
      emotionTags.push("comfort");
      reasonKey = "comfort";
    } else if (
      (input.relationship?.closeness ?? 0.5) >= 0.6 &&
      input.emotionalState.intensity >= 0.7 &&
      (input.messageKind === "smalltalk_hangout" || input.messageKind === "casual_address")
    ) {
      emotionTags.push("praise");
      reasonKey = "praise";
    } else if (
      (input.relationship?.closeness ?? 0.5) >= 0.55 &&
      (input.messageKind === "smalltalk_hangout" || input.messageKind === "casual_address")
    ) {
      emotionTags.push("wholesome");
      reasonKey = "wholesome";
    } else if (
      input.emotionalState.subjectiveFeeling === EmotionLabel.PLAYFUL ||
      input.emotionalState.subjectiveFeeling === EmotionLabel.CURIOUS ||
      input.emotionalState.subjectiveFeeling === EmotionLabel.OVERPLAYFUL
    ) {
      emotionTags.push("hype");
      reasonKey = "hype";
    } else if (input.messageKind === "meme_bait") {
      emotionTags.push("awkward");
      reasonKey = "awkward";
    } else if (input.emotionalState.intensity >= 0.85) {
      emotionTags.push("shock");
      reasonKey = "shock";
    }

    if (!emotionTags.length) {
      return this.reject("no_safe_category");
    }

    return {
      allowAutoMedia: true,
      reason: "eligible",
      reasonKey,
      emotionTags: unique(emotionTags),
      triggerTags: unique([
        ...emotionTags,
        input.messageKind,
        input.channelKind,
        input.activeMode,
        input.emotionalState.subjectiveFeeling
      ])
    };
  }

  private reject(reason: string): EmotionMediaDecision {
    return {
      allowAutoMedia: false,
      reason,
      emotionTags: [],
      triggerTags: []
    };
  }
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}