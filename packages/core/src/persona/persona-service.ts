import type { FeatureFlags, MessageEnvelope, PersonaSettings, RelationshipOverlay } from "@hori/shared";

import type { CorePromptTemplates } from "./prompt-spec-stubs";
import { composeBehaviorPrompt } from "./compose";
import type { ComposeBehaviorPromptInput } from "./types";

const defaultBehaviorFeatureFlags: FeatureFlags = {
  webSearch: true,
  autoInterject: false,
  userProfiles: true,
  contextActions: true,
  roast: true,
  replyQueueEnabled: true,
  runtimeConfigCacheEnabled: true,
  embeddingCacheEnabled: true,
  channelAwareMode: true,
  messageKindAwareMode: true,
  antiSlopStrictMode: true,
  playfulModeEnabled: true,
  irritatedModeEnabled: true,
  ideologicalFlavourEnabled: true,
  analogyBanEnabled: true,
  slangLayerEnabled: true,
  selfInterjectionConstraintsEnabled: true,
  emotionalAdviceAnchorsEnabled: true,
  memoryAlbumEnabled: true,
  interactionRequestsEnabled: true,
  linkUnderstandingEnabled: true,
  naturalMessageSplittingEnabled: true,
  selectiveEngagementEnabled: true,
  selfReflectionLessonsEnabled: true
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
    corePromptTemplates?: CorePromptTemplates;
  }) {
    return composeBehaviorPrompt({
      guildSettings: options.guildSettings,
      moderatorOverlay: options.moderatorOverlay,
      relationship: options.relationship,
      corePromptTemplates: options.corePromptTemplates,
      featureFlags: defaultBehaviorFeatureFlags,
      message: fallbackMessage,
      intent: "chat",
      cleanedContent: ""
    }).prompt;
  }
}
