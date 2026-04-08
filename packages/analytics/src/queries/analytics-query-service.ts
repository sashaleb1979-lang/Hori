import type { AppPrismaClient } from "@hori/shared";
import type { AnalyticsOverview, AnalyticsTopItem } from "@hori/shared";

export interface UserStatsSnapshot {
  totalMessages: number;
  totalReplies: number;
  totalMentions: number;
  avgMessageLength: number;
  activeHoursHistogram: unknown;
  topChannelsSnapshot: unknown;
  conversationStarterCount: number;
  updatedAt: Date;
}

export interface ChannelStatsSnapshot {
  totalMessages: number;
  totalMentions: number;
  avgMessageLength: number;
  activeHoursHistogram: unknown;
  topUsersSnapshot: unknown;
  conversationStarterCount: number;
  updatedAt: Date;
}

function startForWindow(window: AnalyticsOverview["window"]) {
  const now = new Date();

  if (window === "day") {
    return new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }

  if (window === "week") {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }

  if (window === "month") {
    return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  return new Date(0);
}

function topFromHistogram(values: Array<Record<string, number>>, limit = 5): AnalyticsTopItem[] {
  const merged = new Map<string, number>();

  for (const histogram of values) {
    for (const [hour, count] of Object.entries(histogram)) {
      merged.set(hour, (merged.get(hour) ?? 0) + count);
    }
  }

  return [...merged.entries()]
    .map(([id, value]) => ({
      id,
      label: `${id.padStart(2, "0")}:00`,
      value
    }))
    .sort((left, right) => right.value - left.value)
    .slice(0, limit);
}

export class AnalyticsQueryService {
  constructor(private readonly prisma: AppPrismaClient) {}

  async getOverview(guildId: string, window: AnalyticsOverview["window"] = "week"): Promise<AnalyticsOverview> {
    const start = startForWindow(window);

    const [topUserMessages, topChannelMessages, replyTotals, mentionTotals, messageTotals, histograms] =
      await Promise.all([
        this.prisma.message.groupBy({
          by: ["userId"],
          where: { guildId, createdAt: { gte: start } },
          _count: { _all: true },
          orderBy: { _count: { userId: "desc" } },
          take: 5
        }),
        this.prisma.message.groupBy({
          by: ["channelId"],
          where: { guildId, createdAt: { gte: start } },
          _count: { _all: true },
          orderBy: { _count: { channelId: "desc" } },
          take: 5
        }),
        this.prisma.message.count({
          where: { guildId, createdAt: { gte: start }, replyToMessageId: { not: null } }
        }),
        this.prisma.message.aggregate({
          where: { guildId, createdAt: { gte: start } },
          _sum: { mentionCount: true },
          _count: { _all: true }
        }),
        this.prisma.message.count({ where: { guildId, createdAt: { gte: start } } }),
        this.prisma.channelStats.findMany({
          where: { guildId },
          select: { activeHoursHistogram: true }
        })
      ]);

    const users = await this.prisma.user.findMany({
      where: { id: { in: topUserMessages.map((entry) => entry.userId) } }
    });

    const channelConfigs = await this.prisma.channelConfig.findMany({
      where: {
        guildId,
        channelId: { in: topChannelMessages.map((entry) => entry.channelId) }
      }
    });

    const userLabels = new Map(users.map((user) => [user.id, user.globalName || user.username || user.id]));
    const channelLabels = new Map(
      channelConfigs.map((config) => [config.channelId, config.channelName || config.channelId])
    );

    return {
      window,
      topUsers: topUserMessages.map((entry) => ({
        id: entry.userId,
        label: userLabels.get(entry.userId) ?? entry.userId,
        value: entry._count._all
      })),
      topChannels: topChannelMessages.map((entry) => ({
        id: entry.channelId,
        label: channelLabels.get(entry.channelId) ?? entry.channelId,
        value: entry._count._all
      })),
      peakHours: topFromHistogram(
        histograms.map((entry) => (entry.activeHoursHistogram as Record<string, number> | null) ?? {})
      ),
      totals: {
        messages: messageTotals,
        replies: replyTotals,
        mentions: mentionTotals._sum.mentionCount ?? 0
      }
    };
  }

  async getUserStats(guildId: string, userId: string): Promise<UserStatsSnapshot | null> {
    return this.prisma.userStats.findUnique({
      where: {
        guildId_userId: {
          guildId,
          userId
        }
      },
      select: {
        totalMessages: true,
        totalReplies: true,
        totalMentions: true,
        avgMessageLength: true,
        activeHoursHistogram: true,
        topChannelsSnapshot: true,
        conversationStarterCount: true,
        updatedAt: true
      }
    });
  }

  async getChannelStats(guildId: string, channelId: string): Promise<ChannelStatsSnapshot | null> {
    return this.prisma.channelStats.findUnique({
      where: {
        guildId_channelId: {
          guildId,
          channelId
        }
      },
      select: {
        totalMessages: true,
        totalMentions: true,
        avgMessageLength: true,
        activeHoursHistogram: true,
        topUsersSnapshot: true,
        conversationStarterCount: true,
        updatedAt: true
      }
    });
  }
}
