import type { AppPrismaClient } from "@hori/shared";

export interface RecordReflectionLessonInput {
  guildId: string;
  channelId: string;
  messageId: string;
  userId?: string | null;
  lessonType?: string;
  sentiment: "positive" | "negative" | "neutral";
  severity?: number;
  summary: string;
  metadataJson?: unknown;
}

export interface ReflectionLessonRecord {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string | null;
  userId: string | null;
  lessonType: string;
  sentiment: string;
  severity: number;
  summary: string;
  status: string;
  metadataJson: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export class ReflectionService {
  constructor(private readonly prisma: AppPrismaClient) {}

  async recordLesson(input: RecordReflectionLessonInput): Promise<ReflectionLessonRecord | null> {
    const summary = input.summary.trim();

    if (!summary) {
      return null;
    }

    return this.prisma.reflectionLesson.upsert({
      where: { messageId: input.messageId },
      update: {
        sentiment: input.sentiment,
        severity: input.severity ?? 1,
        summary,
        metadataJson: input.metadataJson as never,
        status: "open"
      },
      create: {
        guildId: input.guildId,
        channelId: input.channelId,
        messageId: input.messageId,
        userId: input.userId ?? null,
        lessonType: input.lessonType ?? "feedback",
        sentiment: input.sentiment,
        severity: input.severity ?? 1,
        summary,
        metadataJson: input.metadataJson as never
      }
    });
  }

  async listOpenLessons(guildId: string, limit = 8): Promise<ReflectionLessonRecord[]> {
    return this.prisma.reflectionLesson.findMany({
      where: { guildId, status: "open" },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limit, 1), 20)
    });
  }

  async status(guildId: string): Promise<{ open: number; positive: number; negative: number }> {
    const [open, positive, negative] = await Promise.all([
      this.prisma.reflectionLesson.count({ where: { guildId, status: "open" } }),
      this.prisma.reflectionLesson.count({ where: { guildId, sentiment: "positive" } }),
      this.prisma.reflectionLesson.count({ where: { guildId, sentiment: "negative" } })
    ]);

    return { open, positive, negative };
  }
}
