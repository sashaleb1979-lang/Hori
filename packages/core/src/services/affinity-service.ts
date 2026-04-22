import type { AppPrismaClient, MessageKind, RelationshipOverlay } from "@hori/shared";

const RECENT_NEGATIVE_THRESHOLD = -0.9;
const STRONG_NEGATIVE_THRESHOLD = -1.4;
const RECENT_POSITIVE_THRESHOLD = 0.9;
const STRONG_POSITIVE_THRESHOLD = 1.4;

export class AffinityService {
  constructor(private readonly prisma: AppPrismaClient) {}

  async recordMessageSignal(input: {
    guildId: string;
    userId: string;
    messageId: string;
    messageKind: MessageKind;
    content?: string;
    targetedToBot?: boolean;
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
    const value = (valueByKind[input.messageKind] ?? 0) + detectDirectedToneSignal(input.content, input.targetedToBot);

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

    if (score <= STRONG_NEGATIVE_THRESHOLD) {
      return {
        ...base,
        toneBias: "sharp",
        roastLevel: Math.min(5, base.roastLevel + 1)
      };
    }

    if (score <= RECENT_NEGATIVE_THRESHOLD) {
      return {
        ...base,
        toneBias: base.toneBias === "friendly" ? "neutral" : base.toneBias,
        roastLevel: Math.min(5, base.roastLevel + 1)
      };
    }

    if (score >= STRONG_POSITIVE_THRESHOLD) {
      return {
        ...base,
        toneBias: base.toneBias === "sharp" ? "neutral" : "friendly",
        praiseBias: Math.min(5, base.praiseBias + 1)
      };
    }

    if (score >= RECENT_POSITIVE_THRESHOLD) {
      return {
        ...base,
        toneBias: base.toneBias === "sharp" ? "neutral" : base.toneBias,
        praiseBias: Math.min(5, base.praiseBias + 1)
      };
    }

    return base;
  }
}

function detectDirectedToneSignal(content?: string, targetedToBot?: boolean) {
  if (!targetedToBot || !content) {
    return 0;
  }

  const normalized = content.toLowerCase().replace(/ё/g, "е");

  if (/(ты\s+(?:норм|нормальная|нормальный|права|прав|хороша|хороший|умная|умный|топ)|спасибо\s*,?\s*хори|люблю\s+тебя|обожаю\s+тебя|ты\s+сегодня\s+норм|ты\s+база)/iu.test(normalized)) {
    return 0.24;
  }

  if (/(ты\s+(?:меня\s+)?бесишь|ты\s+достала|ты\s+достал|ты\s+раздражаешь|ненавижу\s+тебя|тупая\s+ты|тупой\s+ты|заебала\s+ты|заебал\s+ты)/iu.test(normalized)) {
    return -0.3;
  }

  return 0;
}
