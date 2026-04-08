import type { AppPrismaClient } from "@hori/shared";

export interface SummaryMessageSnapshot {
  id: string;
  userId: string;
  content: string;
  createdAt: Date;
  user: {
    username: string | null;
    globalName: string | null;
  };
}

export class SummaryService {
  constructor(private readonly prisma: AppPrismaClient) {}

  async getRecentSummaries(guildId: string, channelId: string, take = 3) {
    return this.prisma.channelSummary.findMany({
      where: { guildId, channelId },
      orderBy: { rangeEnd: "desc" },
      take
    });
  }

  async getMessagesForNextSummary(
    guildId: string,
    channelId: string,
    chunkSize: number
  ): Promise<SummaryMessageSnapshot[]> {
    const lastSummary = await this.prisma.channelSummary.findFirst({
      where: { guildId, channelId },
      orderBy: { rangeEnd: "desc" },
      select: { rangeEnd: true }
    });

    return this.prisma.message.findMany({
      where: {
        guildId,
        channelId,
        createdAt: lastSummary ? { gt: lastSummary.rangeEnd } : undefined
      },
      select: {
        id: true,
        userId: true,
        content: true,
        createdAt: true,
        user: {
          select: {
            username: true,
            globalName: true
          }
        }
      },
      orderBy: { createdAt: "asc" },
      take: chunkSize
    });
  }

  async storeSummary(input: {
    guildId: string;
    channelId: string;
    rangeStart: Date;
    rangeEnd: Date;
    summaryShort: string;
    summaryLong: string;
    topicTags: string[];
    notableUsers: string[];
  }) {
    return this.prisma.channelSummary.create({
      data: input
    });
  }
}
