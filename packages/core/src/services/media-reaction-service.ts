import { existsSync } from "node:fs";

import type { AppPrismaClient, BotReplyPayload, ChannelKind, MediaReactionTrace, PersonaMode, StylePresetName } from "@hori/shared";

export class MediaReactionService {
  constructor(private readonly prisma: AppPrismaClient) {}

  async maybeAttachMedia(input: {
    enabled: boolean;
    replyText: string;
    channelKind?: ChannelKind;
    mode?: PersonaMode;
    stylePreset?: StylePresetName;
    triggerTags: string[];
    allowNsfw?: boolean;
  }): Promise<{ payload: BotReplyPayload; trace: MediaReactionTrace }> {
    const payload: BotReplyPayload = { text: input.replyText };

    if (!input.enabled) {
      return { payload, trace: { enabled: false, selected: false, reason: "feature_disabled" } };
    }

    const candidates = await this.prisma.mediaMetadata.findMany({
      where: {
        enabled: true,
        nsfw: input.allowNsfw ? undefined : false
      },
      orderBy: [{ weight: "desc" }, { lastUsedAt: "asc" }],
      take: 25
    });

    if (!candidates.length) {
      return { payload, trace: { enabled: true, selected: false, reason: "no_registered_media" } };
    }

    let lastReject: MediaReactionTrace = { enabled: true, selected: false, reason: "no_matching_media" };

    for (const media of candidates) {
      if (media.allowedChannels.length && (!input.channelKind || !media.allowedChannels.includes(input.channelKind))) {
        lastReject = { enabled: true, selected: false, mediaId: media.mediaId, reason: "channel_not_allowed" };
        continue;
      }

      if (media.allowedMoods.length && (!input.mode || !media.allowedMoods.includes(input.mode))) {
        lastReject = { enabled: true, selected: false, mediaId: media.mediaId, reason: "mood_not_allowed" };
        continue;
      }

      const matchScore =
        overlapScore(media.triggerTags, input.triggerTags, 3) +
        overlapScore(media.toneTags, input.triggerTags, 2) +
        (input.stylePreset && (media.toneTags.includes(input.stylePreset) || media.triggerTags.includes(input.stylePreset)) ? 1 : 0) +
        (input.channelKind && media.allowedChannels.includes(input.channelKind) ? 1 : 0) +
        (input.mode && media.allowedMoods.includes(input.mode) ? 1 : 0);

      if (matchScore <= 0) {
        lastReject = { enabled: true, selected: false, mediaId: media.mediaId, reason: "no_tag_match" };
        continue;
      }

      if (media.lastUsedAt && Date.now() - media.lastUsedAt.getTime() < media.cooldownSec * 1000) {
        lastReject = { enabled: true, selected: false, mediaId: media.mediaId, reason: "cooldown" };
        continue;
      }

      if (!existsSync(media.filePath)) {
        lastReject = { enabled: true, selected: false, mediaId: media.mediaId, reason: "file_missing" };
        continue;
      }

      await this.prisma.mediaMetadata.update({
        where: { id: media.id },
        data: { lastUsedAt: new Date() }
      });

      return {
        payload: {
          text: input.replyText,
          media: {
            mediaId: media.mediaId,
            filePath: media.filePath,
            type: media.type
          }
        },
        trace: { enabled: true, selected: true, mediaId: media.mediaId }
      };
    }

    return { payload, trace: lastReject };
  }
}

function overlapScore(left: readonly string[], right: readonly string[], weight: number) {
  if (!left.length || !right.length) {
    return 0;
  }

  const rightSet = new Set(right);
  return left.reduce((score, value) => score + (rightSet.has(value) ? weight : 0), 0);
}
