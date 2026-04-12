import type { AppPrismaClient } from "@hori/shared";

export interface SaveMemoryMomentInput {
  guildId: string;
  channelId: string;
  messageId: string;
  savedByUserId: string;
  authorUserId?: string | null;
  content: string;
  note?: string | null;
  tags?: string[];
  category?: string;
  sourceUrl?: string | null;
}

export interface MemoryAlbumEntryRecord {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string | null;
  savedByUserId: string;
  authorUserId: string | null;
  content: string;
  note: string | null;
  category: string;
  tags: string[];
  sourceUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class MemoryAlbumService {
  constructor(private readonly prisma: AppPrismaClient) {}

  async saveMoment(input: SaveMemoryMomentInput): Promise<MemoryAlbumEntryRecord> {
    const trimmedContent = input.content.trim();
    const trimmedNote = input.note?.trim() || null;
    const tags = [...new Set((input.tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean))].slice(0, 8);

    return this.prisma.memoryAlbumEntry.upsert({
      where: {
        guildId_savedByUserId_messageId: {
          guildId: input.guildId,
          savedByUserId: input.savedByUserId,
          messageId: input.messageId
        }
      },
      update: {
        content: trimmedContent,
        note: trimmedNote,
        tags,
        category: input.category ?? "moment",
        authorUserId: input.authorUserId ?? undefined,
        sourceUrl: input.sourceUrl ?? undefined
      },
      create: {
        guildId: input.guildId,
        channelId: input.channelId,
        messageId: input.messageId,
        savedByUserId: input.savedByUserId,
        authorUserId: input.authorUserId ?? null,
        content: trimmedContent,
        note: trimmedNote,
        tags,
        category: input.category ?? "moment",
        sourceUrl: input.sourceUrl ?? null
      }
    });
  }

  async listMoments(guildId: string, savedByUserId: string, limit = 8): Promise<MemoryAlbumEntryRecord[]> {
    return this.prisma.memoryAlbumEntry.findMany({
      where: { guildId, savedByUserId },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limit, 1), 20)
    });
  }

  async removeMoment(guildId: string, savedByUserId: string, id: string): Promise<{ count: number }> {
    return this.prisma.memoryAlbumEntry.deleteMany({
      where: { guildId, savedByUserId, id }
    });
  }
}
