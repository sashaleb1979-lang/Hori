import type { AppPrismaClient, PersonaMode } from "@hori/shared";

const allowedMoods = new Set<PersonaMode>(["normal", "playful", "dry", "irritated", "focused", "sleepy", "detached"]);

interface MoodStateSnapshot {
  id: string;
  scope: string;
  scopeId: string;
  mood: string;
  intensity: number;
  isRareMode: boolean;
  startedAt: Date;
  endsAt: Date;
  cooldownEnds: Date | null;
  reasonJson: unknown;
  updatedAt: Date;
}

export class MoodService {
  constructor(private readonly prisma: AppPrismaClient) {}

  async getActiveMode(guildId: string): Promise<PersonaMode | null> {
    const mood = await this.prisma.moodState.findFirst({
      where: {
        scope: "guild",
        scopeId: guildId,
        endsAt: { gt: new Date() }
      },
      orderBy: { startedAt: "desc" }
    });

    if (!mood || !allowedMoods.has(mood.mood as PersonaMode)) {
      return null;
    }

    return mood.mood as PersonaMode;
  }

  async setMood(guildId: string, mood: PersonaMode, minutes: number, reason?: string | null): Promise<MoodStateSnapshot> {
    await this.clearMood(guildId);

    return this.prisma.moodState.create({
      data: {
        scope: "guild",
        scopeId: guildId,
        mood,
        intensity: mood === "normal" ? 0.4 : 0.65,
        endsAt: new Date(Date.now() + minutes * 60 * 1000),
        reasonJson: reason ? { reason } : undefined
      }
    });
  }

  async clearMood(guildId: string): Promise<{ count: number }> {
    return this.prisma.moodState.updateMany({
      where: {
        scope: "guild",
        scopeId: guildId,
        endsAt: { gt: new Date() }
      },
      data: {
        endsAt: new Date()
      }
    });
  }

  async status(guildId: string): Promise<MoodStateSnapshot | null> {
    return this.prisma.moodState.findFirst({
      where: {
        scope: "guild",
        scopeId: guildId,
        endsAt: { gt: new Date() }
      },
      orderBy: { startedAt: "desc" }
    });
  }
}
