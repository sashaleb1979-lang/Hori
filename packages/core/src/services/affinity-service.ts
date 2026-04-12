import type { AppPrismaClient, MessageKind, RelationshipOverlay } from "@hori/shared";

export class AffinityService {
  constructor(private readonly prisma: AppPrismaClient) {}

  async recordMessageSignal(input: {
    guildId: string;
    userId: string;
    messageId: string;
    messageKind: MessageKind;
  }) {
    const valueByKind: Partial<Record<MessageKind, number>> = {
      provocation: -0.35,
      repeated_question: -0.25,
      low_signal_noise: -0.1,
      request_for_explanation: 0.08,
      info_question: 0.05,
      casual_address: 0.03,
      meme_bait: 0.02
    };
    const value = valueByKind[input.messageKind] ?? 0;

    if (value === 0) {
      return null;
    }

    return this.prisma.affinitySignal.create({
      data: {
        guildId: input.guildId,
        userId: input.userId,
        messageId: input.messageId,
        signalType: input.messageKind,
        value
      }
    });
  }

  async applyRecentOverlay(guildId: string, userId: string, relationship?: RelationshipOverlay | null): Promise<RelationshipOverlay | null> {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const signals = await this.prisma.affinitySignal.findMany({
      where: {
        guildId,
        userId,
        createdAt: { gte: since }
      },
      orderBy: { createdAt: "desc" },
      take: 80
    });

    if (!signals.length) {
      return relationship ?? null;
    }

    const score = signals.reduce((sum, signal) => sum + signal.value, 0);
    const base: RelationshipOverlay =
      relationship ?? {
        toneBias: "neutral",
        roastLevel: 0,
        praiseBias: 0,
        interruptPriority: 0,
        doNotMock: false,
        doNotInitiate: false,
        protectedTopics: []
      };

    if (score <= -2) {
      return {
        ...base,
        toneBias: base.toneBias === "friendly" ? "neutral" : "sharp",
        roastLevel: Math.min(5, base.roastLevel + 1)
      };
    }

    if (score >= 2) {
      return {
        ...base,
        toneBias: base.toneBias === "sharp" ? "neutral" : base.toneBias,
        praiseBias: Math.min(5, base.praiseBias + 1)
      };
    }

    return base;
  }
}
