import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import type { AppPrismaClient, BotReplyPayload, ChannelKind, MediaReactionTrace, MessageKind, PersonaMode, StylePresetName } from "@hori/shared";

export class MediaReactionService {
  constructor(private readonly prisma: AppPrismaClient) {}

  async maybeAttachMedia(input: {
    enabled: boolean;
    replyText: string;
    guildId?: string;
    channelId?: string;
    messageId?: string;
    channelKind?: ChannelKind;
    mode?: PersonaMode;
    stylePreset?: StylePresetName;
    triggerTags: string[];
    emotionTags?: string[];
    messageKind?: MessageKind;
    confidence?: number;
    intensity?: number;
    autoTriggered?: boolean;
    reasonKey?: string;
    globalCooldownSec?: number;
    allowNsfw?: boolean;
  }): Promise<{ payload: BotReplyPayload; trace: MediaReactionTrace }> {
    const payload: BotReplyPayload = { text: input.replyText };

    if (!input.enabled) {
      return { payload, trace: { enabled: false, selected: false, reason: "feature_disabled" } };
    }

    if (input.autoTriggered && input.guildId && input.globalCooldownSec) {
      const latestAutoUse = await this.prisma.mediaUsageLog.findFirst({
        where: {
          guildId: input.guildId,
          autoTriggered: true
        },
        orderBy: { usedAt: "desc" }
      });

      if (latestAutoUse && Date.now() - latestAutoUse.usedAt.getTime() < input.globalCooldownSec * 1000) {
        return {
          payload,
          trace: {
            enabled: true,
            selected: false,
            reason: "global_auto_cooldown",
            autoTriggered: true,
            reasonKey: input.reasonKey ?? null
          }
        };
      }
    }

    const candidates = await this.prisma.mediaMetadata.findMany({
      where: {
        enabled: true,
        nsfw: input.allowNsfw ? undefined : false,
        ...(input.autoTriggered ? { autoUseEnabled: true, manualOnly: false } : {})
      },
      orderBy: [{ weight: "desc" }, { lastUsedAt: "asc" }],
      take: 40
    });

    if (!candidates.length) {
      return { payload, trace: { enabled: true, selected: false, reason: "no_registered_media" } };
    }

    let lastReject: MediaReactionTrace = { enabled: true, selected: false, reason: "no_matching_media" };

    for (const media of candidates) {
      if (input.autoTriggered && media.manualOnly) {
        lastReject = {
          enabled: true,
          selected: false,
          mediaId: media.mediaId,
          reason: "manual_only",
          autoTriggered: true,
          reasonKey: input.reasonKey ?? null
        };
        continue;
      }

      if ((media.allowedChannels ?? []).length && (!input.channelKind || !(media.allowedChannels ?? []).includes(input.channelKind))) {
        lastReject = { enabled: true, selected: false, mediaId: media.mediaId, reason: "channel_not_allowed" };
        continue;
      }

      if ((media.allowedMoods ?? []).length && (!input.mode || !(media.allowedMoods ?? []).includes(input.mode))) {
        lastReject = { enabled: true, selected: false, mediaId: media.mediaId, reason: "mood_not_allowed" };
        continue;
      }

      const matchScore =
        overlapScore(media.triggerTags, input.triggerTags, 3) +
        overlapScore(media.toneTags, input.triggerTags, 2) +
        overlapScore(media.emotionTags, input.emotionTags ?? [], 4) +
        (input.messageKind && (media.messageKindTags ?? []).includes(input.messageKind) ? 3 : 0) +
        (input.stylePreset && ((media.toneTags ?? []).includes(input.stylePreset) || (media.triggerTags ?? []).includes(input.stylePreset)) ? 1 : 0) +
        (input.channelKind && (media.allowedChannels ?? []).includes(input.channelKind) ? 1 : 0) +
        (input.mode && (media.allowedMoods ?? []).includes(input.mode) ? 1 : 0);

      if (matchScore <= 0) {
        lastReject = { enabled: true, selected: false, mediaId: media.mediaId, reason: "no_tag_match" };
        continue;
      }

      if (media.lastUsedAt && Date.now() - media.lastUsedAt.getTime() < media.cooldownSec * 1000) {
        lastReject = { enabled: true, selected: false, mediaId: media.mediaId, reason: "cooldown" };
        continue;
      }

      if (input.autoTriggered) {
        if ((input.confidence ?? 0) < media.minConfidence) {
          lastReject = { enabled: true, selected: false, mediaId: media.mediaId, reason: "confidence_too_low", autoTriggered: true, reasonKey: input.reasonKey ?? null };
          continue;
        }

        if ((input.intensity ?? 0) < media.minIntensity) {
          lastReject = { enabled: true, selected: false, mediaId: media.mediaId, reason: "intensity_too_low", autoTriggered: true, reasonKey: input.reasonKey ?? null };
          continue;
        }

        if (input.guildId && (await this.wasUsedAutomaticallyToday(media.mediaId, input.guildId))) {
          lastReject = { enabled: true, selected: false, mediaId: media.mediaId, reason: "daily_auto_reuse_blocked", autoTriggered: true, reasonKey: input.reasonKey ?? null };
          continue;
        }
      }

      const resolvedFilePath = resolveMediaPath(media.filePath);

      if (!existsSync(resolvedFilePath)) {
        lastReject = { enabled: true, selected: false, mediaId: media.mediaId, reason: "file_missing" };
        continue;
      }

      await this.prisma.mediaMetadata.update({
        where: { id: media.id },
        data: { lastUsedAt: new Date() }
      });

      if (input.guildId && input.channelId) {
        await this.prisma.mediaUsageLog.create({
          data: {
            mediaId: media.mediaId,
            guildId: input.guildId,
            channelId: input.channelId,
            messageId: input.messageId ?? null,
            reasonKey: input.reasonKey ?? null,
            autoTriggered: input.autoTriggered ?? false
          }
        });
      }

      return {
        payload: {
          text: input.replyText,
          media: {
            mediaId: media.mediaId,
            filePath: resolvedFilePath,
            type: media.type
          }
        },
        trace: { enabled: true, selected: true, mediaId: media.mediaId, autoTriggered: input.autoTriggered ?? false, reasonKey: input.reasonKey ?? null }
      };
    }

    return { payload, trace: lastReject };
  }

  private async wasUsedAutomaticallyToday(mediaId: string, guildId: string) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const entry = await this.prisma.mediaUsageLog.findFirst({
      where: {
        mediaId,
        guildId,
        autoTriggered: true,
        usedAt: { gte: startOfDay }
      },
      select: { id: true }
    });

    return Boolean(entry);
  }
}

function overlapScore(left: readonly string[] | null | undefined, right: readonly string[] | null | undefined, weight: number) {
  if (!left?.length || !right?.length) {
    return 0;
  }

  const rightSet = new Set(right);
  return left.reduce((score, value) => score + (rightSet.has(value) ? weight : 0), 0);
}

function resolveMediaPath(filePath: string) {
  return isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);
}
