import type { AppEnv } from "@hori/config";
import type { AppPrismaClient } from "@hori/shared";

export interface ProfileMessageSnapshot {
  content: string;
  createdAt: Date;
}

export class ProfileService {
  constructor(
    private readonly prisma: AppPrismaClient,
    private readonly env: AppEnv
  ) {}

  isEligible(totalMessages: number) {
    return totalMessages >= this.env.USER_PROFILE_MIN_MESSAGES;
  }

  shouldRefreshProfile(options: {
    totalMessages: number;
    lastProfiledAt?: Date | null;
    sourceWindowSize?: number | null;
  }) {
    if (!this.isEligible(options.totalMessages)) {
      return false;
    }

    if (!options.lastProfiledAt) {
      return true;
    }

    const hoursSinceLastProfile = (Date.now() - options.lastProfiledAt.getTime()) / (1000 * 60 * 60);
    return (
      hoursSinceLastProfile >= this.env.USER_PROFILE_REFRESH_HOURS ||
      options.totalMessages >= (options.sourceWindowSize ?? 0) + this.env.USER_PROFILE_REFRESH_MESSAGES
    );
  }

  async getProfile(guildId: string, userId: string) {
    return this.prisma.userProfile.findUnique({
      where: {
        guildId_userId: {
          guildId,
          userId
        }
      }
    });
  }

  async getRecentMessagesForProfile(guildId: string, userId: string, limit = 50): Promise<ProfileMessageSnapshot[]> {
    return this.prisma.message.findMany({
      where: { guildId, userId },
      select: {
        content: true,
        createdAt: true
      },
      orderBy: { createdAt: "desc" },
      take: limit
    });
  }

  async upsertProfile(input: {
    guildId: string;
    userId: string;
    summaryShort: string;
    styleTags: string[];
    topicTags: string[];
    confidenceScore: number;
    sourceWindowSize: number;
    isEligible: boolean;
  }) {
    return this.prisma.userProfile.upsert({
      where: {
        guildId_userId: {
          guildId: input.guildId,
          userId: input.userId
        }
      },
      update: {
        summaryShort: input.summaryShort,
        styleTags: input.styleTags,
        topicTags: input.topicTags,
        confidenceScore: input.confidenceScore,
        sourceWindowSize: input.sourceWindowSize,
        isEligible: input.isEligible,
        lastProfiledAt: new Date()
      },
      create: {
        guildId: input.guildId,
        userId: input.userId,
        summaryShort: input.summaryShort,
        styleTags: input.styleTags,
        topicTags: input.topicTags,
        confidenceScore: input.confidenceScore,
        sourceWindowSize: input.sourceWindowSize,
        isEligible: input.isEligible,
        lastProfiledAt: new Date()
      }
    });
  }
}
