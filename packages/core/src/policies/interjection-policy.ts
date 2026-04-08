import type { AppEnv } from "@hori/config";
import type { MessageEnvelope, RelationshipOverlay } from "@hori/shared";

export class InterjectionPolicy {
  shouldInterject(options: {
    env: AppEnv;
    message: MessageEnvelope;
    relationship?: RelationshipOverlay | null;
    channelAllowed: boolean;
    confidence: number;
    recentlyInterjected: boolean;
  }) {
    if (!options.env.FEATURE_AUTOINTERJECT) {
      return false;
    }

    if (!options.channelAllowed || options.recentlyInterjected) {
      return false;
    }

    if (options.relationship?.doNotInitiate) {
      return false;
    }

    if (options.confidence < options.env.AUTOINTERJECT_MIN_CONFIDENCE) {
      return false;
    }

    return /кто прав|что думаешь|бот|хори/i.test(options.message.content);
  }
}

