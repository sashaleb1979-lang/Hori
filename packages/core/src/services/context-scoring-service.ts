import type { ContextBundle, ContextBundleV2, ContextScores, MessageEnvelope, MessageKind, RelationshipOverlay } from "@hori/shared";

export class ContextScoringService {
  score(options: {
    bundle: ContextBundle;
    message: MessageEnvelope;
    messageKind: MessageKind;
    relationship?: RelationshipOverlay | null;
  }): ContextScores {
    const bundle = options.bundle as Partial<ContextBundleV2>;
    const reasons: string[] = [];
    let contextConfidence = 0.35;

    if (bundle.replyChain?.length) {
      contextConfidence += Math.min(0.35, 0.18 + bundle.replyChain.length * 0.04);
      reasons.push("reply_chain");
    }

    if (options.message.triggerSource === "reply") {
      contextConfidence += 0.2;
      reasons.push("reply_to_bot");
    }

    if (bundle.activeTopic?.confidence && bundle.activeTopic.confidence >= 0.7) {
      contextConfidence += 0.2;
      reasons.push("active_topic");
    }

    if (bundle.entities?.some((entity) => entity.score >= 0.8)) {
      contextConfidence += 0.1;
      reasons.push("entity_trigger");
    }

    if (options.messageKind === "low_signal_noise") {
      contextConfidence -= 0.25;
      reasons.push("low_signal");
    }

    if (!options.bundle.recentMessages.length && !bundle.replyChain?.length) {
      contextConfidence -= 0.2;
      reasons.push("empty_context");
    }

    contextConfidence = clamp01(contextConfidence);

    let mockeryConfidence = contextConfidence;

    if (options.relationship?.doNotMock) {
      mockeryConfidence -= 0.5;
      reasons.push("do_not_mock");
    } else if (options.relationship?.roastLevel) {
      mockeryConfidence += Math.min(0.15, options.relationship.roastLevel * 0.03);
      reasons.push("relationship_roast");
    }

    if (options.messageKind === "provocation" || options.messageKind === "meme_bait" || options.messageKind === "repeated_question") {
      mockeryConfidence += 0.12;
      reasons.push(`mockery_kind:${options.messageKind}`);
    }

    if (options.messageKind === "info_question" || options.messageKind === "request_for_explanation" || options.messageKind === "command_like_request") {
      mockeryConfidence -= 0.12;
      reasons.push("utility_kind");
    }

    return {
      contextConfidence,
      mockeryConfidence: clamp01(mockeryConfidence),
      reasons
    };
  }
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}
