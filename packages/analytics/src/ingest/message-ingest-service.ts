import type { AppPrismaClient, AppLogger, MessageEnvelope } from "@hori/shared";
import {
  HALF_HOUR_MS,
  estimateTokenCount,
  floorUtcDay,
  incrementHourHistogram,
  updateTopSnapshot
} from "@hori/shared";

export interface MessageIngestInput extends MessageEnvelope {
  guildName?: string | null;
  channelName?: string | null;
  isBotUser?: boolean;
}

export class MessageIngestService {
  constructor(
    private readonly prisma: AppPrismaClient,
    private readonly logger: AppLogger
  ) {}

  async ingestMessage(input: MessageIngestInput) {
    const existing = await this.prisma.message.findUnique({
      where: { id: input.messageId },
      select: { id: true }
    });

    if (existing) {
      this.logger.debug({ messageId: input.messageId }, "message already ingested, skipping counters");
      return {
        isConversationStarter: false,
        tokenEstimate: estimateTokenCount(input.content),
        deduplicated: true
      };
    }

    const previousMessage = await this.prisma.message.findFirst({
      where: {
        guildId: input.guildId,
        channelId: input.channelId,
        createdAt: { lt: input.createdAt }
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, userId: true }
    });

    const isConversationStarter =
      !previousMessage || input.createdAt.getTime() - previousMessage.createdAt.getTime() > HALF_HOUR_MS;
    const day = floorUtcDay(input.createdAt);
    const hour = input.createdAt.getUTCHours();
    const charCount = input.content.length;
    const tokenEstimate = estimateTokenCount(input.content);

    await this.prisma.$transaction(async (tx) => {
      await tx.guild.upsert({
        where: { id: input.guildId },
        update: {
          name: input.guildName ?? undefined
        },
        create: {
          id: input.guildId,
          name: input.guildName ?? undefined
        }
      });

      await tx.channelConfig.upsert({
        where: {
          guildId_channelId: {
            guildId: input.guildId,
            channelId: input.channelId
          }
        },
        update: {
          channelName: input.channelName ?? undefined
        },
        create: {
          guildId: input.guildId,
          channelId: input.channelId,
          channelName: input.channelName ?? undefined
        }
      });

      await tx.user.upsert({
        where: { id: input.userId },
        update: {
          username: input.username,
          globalName: input.displayName ?? undefined,
          isBot: input.isBotUser ?? false
        },
        create: {
          id: input.userId,
          username: input.username,
          globalName: input.displayName ?? undefined,
          isBot: input.isBotUser ?? false
        }
      });

      await tx.message.upsert({
        where: { id: input.messageId },
        update: {
          content: input.content,
          mentionCount: input.mentionCount,
          charCount,
          tokenEstimate,
          flags: {
            explicitInvocation: input.explicitInvocation,
            triggerSource: input.triggerSource ?? null
          }
        },
        create: {
          id: input.messageId,
          guildId: input.guildId,
          channelId: input.channelId,
          userId: input.userId,
          content: input.content,
          createdAt: input.createdAt,
          replyToMessageId: input.replyToMessageId ?? undefined,
          mentionCount: input.mentionCount,
          charCount,
          tokenEstimate,
          flags: {
            explicitInvocation: input.explicitInvocation,
            triggerSource: input.triggerSource ?? null
          }
        }
      });

      const existingUserStats = await tx.userStats.findUnique({
        where: {
          guildId_userId: {
            guildId: input.guildId,
            userId: input.userId
          }
        }
      });

      const nextUserTotal = (existingUserStats?.totalMessages ?? 0) + 1;
      const nextUserReplies = (existingUserStats?.totalReplies ?? 0) + (input.replyToMessageId ? 1 : 0);
      const nextUserMentions = (existingUserStats?.totalMentions ?? 0) + input.mentionCount;
      const nextUserAvg =
        ((existingUserStats?.avgMessageLength ?? 0) * (existingUserStats?.totalMessages ?? 0) + charCount) /
        nextUserTotal;

      await tx.userStats.upsert({
        where: {
          guildId_userId: {
            guildId: input.guildId,
            userId: input.userId
          }
        },
        update: {
          totalMessages: nextUserTotal,
          totalReplies: nextUserReplies,
          totalMentions: nextUserMentions,
          avgMessageLength: nextUserAvg,
          activeHoursHistogram: incrementHourHistogram(existingUserStats?.activeHoursHistogram, hour),
          topChannelsSnapshot: updateTopSnapshot(existingUserStats?.topChannelsSnapshot, input.channelId),
          conversationStarterCount:
            (existingUserStats?.conversationStarterCount ?? 0) + (isConversationStarter ? 1 : 0),
          updatedAt: new Date()
        },
        create: {
          guildId: input.guildId,
          userId: input.userId,
          totalMessages: nextUserTotal,
          totalReplies: nextUserReplies,
          totalMentions: nextUserMentions,
          avgMessageLength: nextUserAvg,
          activeHoursHistogram: incrementHourHistogram(undefined, hour),
          topChannelsSnapshot: [{ key: input.channelId, count: 1 }],
          conversationStarterCount: isConversationStarter ? 1 : 0
        }
      });

      const existingChannelStats = await tx.channelStats.findUnique({
        where: {
          guildId_channelId: {
            guildId: input.guildId,
            channelId: input.channelId
          }
        }
      });

      const nextChannelTotal = (existingChannelStats?.totalMessages ?? 0) + 1;
      const nextChannelMentions = (existingChannelStats?.totalMentions ?? 0) + input.mentionCount;
      const nextChannelAvg =
        ((existingChannelStats?.avgMessageLength ?? 0) * (existingChannelStats?.totalMessages ?? 0) + charCount) /
        nextChannelTotal;

      await tx.channelStats.upsert({
        where: {
          guildId_channelId: {
            guildId: input.guildId,
            channelId: input.channelId
          }
        },
        update: {
          totalMessages: nextChannelTotal,
          totalMentions: nextChannelMentions,
          avgMessageLength: nextChannelAvg,
          activeHoursHistogram: incrementHourHistogram(existingChannelStats?.activeHoursHistogram, hour),
          topUsersSnapshot: updateTopSnapshot(existingChannelStats?.topUsersSnapshot, input.userId),
          conversationStarterCount:
            (existingChannelStats?.conversationStarterCount ?? 0) + (isConversationStarter ? 1 : 0),
          updatedAt: new Date()
        },
        create: {
          guildId: input.guildId,
          channelId: input.channelId,
          totalMessages: nextChannelTotal,
          totalMentions: nextChannelMentions,
          avgMessageLength: nextChannelAvg,
          activeHoursHistogram: incrementHourHistogram(undefined, hour),
          topUsersSnapshot: [{ key: input.userId, count: 1 }],
          conversationStarterCount: isConversationStarter ? 1 : 0
        }
      });

      await tx.userDailyAggregate.upsert({
        where: {
          guildId_userId_day: {
            guildId: input.guildId,
            userId: input.userId,
            day
          }
        },
        update: {
          messageCount: { increment: 1 },
          replyCount: { increment: input.replyToMessageId ? 1 : 0 },
          mentionCount: { increment: input.mentionCount },
          charCount: { increment: charCount },
          conversationStarterCount: { increment: isConversationStarter ? 1 : 0 }
        },
        create: {
          guildId: input.guildId,
          userId: input.userId,
          day,
          messageCount: 1,
          replyCount: input.replyToMessageId ? 1 : 0,
          mentionCount: input.mentionCount,
          charCount,
          conversationStarterCount: isConversationStarter ? 1 : 0
        }
      });

      await tx.channelDailyAggregate.upsert({
        where: {
          guildId_channelId_day: {
            guildId: input.guildId,
            channelId: input.channelId,
            day
          }
        },
        update: {
          messageCount: { increment: 1 },
          mentionCount: { increment: input.mentionCount },
          charCount: { increment: charCount },
          conversationStarterCount: { increment: isConversationStarter ? 1 : 0 }
        },
        create: {
          guildId: input.guildId,
          channelId: input.channelId,
          day,
          messageCount: 1,
          mentionCount: input.mentionCount,
          charCount,
          conversationStarterCount: isConversationStarter ? 1 : 0
        }
      });
    });

    this.logger.debug(
      {
        messageId: input.messageId,
        guildId: input.guildId,
        channelId: input.channelId,
        userId: input.userId,
        conversationStarter: isConversationStarter
      },
      "message ingested"
    );

    return {
      isConversationStarter,
      tokenEstimate,
      deduplicated: false
    };
  }
}
