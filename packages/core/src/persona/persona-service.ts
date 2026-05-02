import type { FeatureFlags, MessageEnvelope, PersonaSettings, RelationshipOverlay } from "@hori/shared";

import { composeBehaviorPrompt } from "./compose";
import type { ComposeBehaviorPromptInput } from "./types";

const defaultBehaviorFeatureFlags: FeatureFlags = {
  webSearch: true,
  autoInterject: false,
  contextActions: true,
  roast: true,
  replyQueueEnabled: true,
  runtimeConfigCacheEnabled: true,
  embeddingCacheEnabled: true,
  messageKindAwareMode: true,
  memoryAlbumEnabled: true,
  interactionRequestsEnabled: true,
  linkUnderstandingEnabled: true,
  naturalMessageSplittingEnabled: true,
  selectiveEngagementEnabled: true,
  selfReflectionLessonsEnabled: true,
  mediaReactionsEnabled: true
};

const fallbackMessage: MessageEnvelope = {
  messageId: "persona-preview",
  guildId: "guild",
  channelId: "channel",
  userId: "user",
  username: "preview",
  channelName: null,
  content: "",
  createdAt: new Date(0),
  replyToMessageId: null,
  mentionCount: 0,
  mentionedBot: false,
  mentionsBotByName: false,
  mentionedUserIds: [],
  isModerator: false,
  explicitInvocation: true
};

export class PersonaService {
  composeBehavior(options: ComposeBehaviorPromptInput) {
    return composeBehaviorPrompt(options);
  }

  composePrompt(options: {
    guildSettings: PersonaSettings;
    moderatorOverlay?: { preferredStyle?: string | null; forbiddenTopics?: string[]; forbiddenWords?: string[] } | null;
    relationship?: RelationshipOverlay | null;
  }) {
    return composeBehaviorPrompt({
      guildSettings: options.guildSettings,
      moderatorOverlay: options.moderatorOverlay,
      relationship: options.relationship,
      featureFlags: defaultBehaviorFeatureFlags,
      message: fallbackMessage,
      intent: "chat",
      cleanedContent: ""
    }).prompt;
  }
}
