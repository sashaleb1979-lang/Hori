import type { AppPrismaClient, RelationshipOverlay } from "@hori/shared";
import {
  DEFAULT_SIGNALS,
  type RelationshipVector,
  createDefaultVector,
  nudgeCloseness,
  incrementFamiliarity,
  nudgeTrustLevel,
} from "./relationship-vector";

type RelationshipProfileRecord = RelationshipOverlay & {
  userId: string;
  guildId: string;
  closeness?: number | null;
  trustLevel?: number | null;
  familiarity?: number | null;
  interactionCount?: number | null;
  proactivityPreference?: number | null;
  topicBoundaries?: unknown;
};

type RelationshipProfileDelegate = {
  findUnique(args: unknown): Promise<RelationshipProfileRecord | null>;
  upsert(args: unknown): Promise<RelationshipProfileRecord>;
};

export interface UpsertRelationshipInput {
  guildId: string;
  userId: string;
  updatedBy?: string | null;
  toneBias: string;
  roastLevel: number;
  praiseBias: number;
  interruptPriority: number;
  doNotMock: boolean;
  doNotInitiate: boolean;
  protectedTopics: string[];
  closeness?: number;
  trustLevel?: number;
  familiarity?: number;
  interactionCount?: number;
  proactivityPreference?: number;
  topicBoundaries?: Record<string, boolean>;
}

export class RelationshipService {
  constructor(private readonly prisma: AppPrismaClient) {}

  private get profiles(): RelationshipProfileDelegate {
    return this.prisma.relationshipProfile as unknown as RelationshipProfileDelegate;
  }

  async getRelationship(guildId: string, userId: string): Promise<RelationshipOverlay | null> {
    const profile = await this.findProfile(guildId, userId);

    if (!profile) {
      return null;
    }

    return this.toOverlay(profile);
  }

  async upsertRelationship(input: UpsertRelationshipInput): Promise<RelationshipVector> {
    const profile = await this.profiles.upsert({
      where: {
        guildId_userId: {
          guildId: input.guildId,
          userId: input.userId
        }
      },
      update: {
        toneBias: input.toneBias,
        roastLevel: input.roastLevel,
        praiseBias: input.praiseBias,
        interruptPriority: input.interruptPriority,
        doNotMock: input.doNotMock,
        doNotInitiate: input.doNotInitiate,
        protectedTopics: input.protectedTopics,
        closeness: input.closeness ?? DEFAULT_SIGNALS.closeness,
        trustLevel: input.trustLevel ?? DEFAULT_SIGNALS.trustLevel,
        familiarity: input.familiarity ?? DEFAULT_SIGNALS.familiarity,
        interactionCount: input.interactionCount ?? DEFAULT_SIGNALS.interactionCount,
        proactivityPreference: input.proactivityPreference ?? DEFAULT_SIGNALS.proactivityPreference,
        topicBoundaries: input.topicBoundaries ?? DEFAULT_SIGNALS.topicBoundaries,
        updatedBy: input.updatedBy ?? undefined,
        updatedAt: new Date()
      },
      create: {
        guildId: input.guildId,
        userId: input.userId,
        toneBias: input.toneBias,
        roastLevel: input.roastLevel,
        praiseBias: input.praiseBias,
        interruptPriority: input.interruptPriority,
        doNotMock: input.doNotMock,
        doNotInitiate: input.doNotInitiate,
        protectedTopics: input.protectedTopics,
        closeness: input.closeness ?? DEFAULT_SIGNALS.closeness,
        trustLevel: input.trustLevel ?? DEFAULT_SIGNALS.trustLevel,
        familiarity: input.familiarity ?? DEFAULT_SIGNALS.familiarity,
        interactionCount: input.interactionCount ?? DEFAULT_SIGNALS.interactionCount,
        proactivityPreference: input.proactivityPreference ?? DEFAULT_SIGNALS.proactivityPreference,
        topicBoundaries: input.topicBoundaries ?? DEFAULT_SIGNALS.topicBoundaries,
        updatedBy: input.updatedBy ?? undefined
      }
    });

    return this.toVector(profile);
  }

  /* ---------------------------------------------------------------- */
  /*  AICO-derived: full relationship vector                          */
  /* ---------------------------------------------------------------- */

  /**
   * Build full RelationshipVector from DB overlay + defaults.
   * If no profile exists, returns default vector.
   */
  async getVector(guildId: string, userId: string): Promise<RelationshipVector> {
    const profile = await this.findProfile(guildId, userId);
    if (!profile) {
      return createDefaultVector(userId, guildId);
    }
    return this.toVector(profile);
  }

  /**
   * Record an interaction — nudge closeness & familiarity.
   * @param sentiment -1..1 (negative = hostile, positive = friendly)
   */
  async recordInteraction(
    guildId: string,
    userId: string,
    sentiment: number,
  ): Promise<RelationshipVector> {
    const vector = await this.getVector(guildId, userId);
    const interactionCount = vector.interactionCount + 1;

    return this.upsertRelationship({
      guildId,
      userId,
      toneBias: vector.toneBias,
      roastLevel: vector.roastLevel,
      praiseBias: vector.praiseBias,
      interruptPriority: vector.interruptPriority,
      doNotMock: vector.doNotMock,
      doNotInitiate: vector.doNotInitiate,
      protectedTopics: vector.protectedTopics,
      closeness: nudgeCloseness(vector.closeness, sentiment),
      trustLevel: nudgeTrustLevel(vector.trustLevel, sentiment),
      familiarity: incrementFamiliarity(vector.familiarity, interactionCount),
      interactionCount,
      proactivityPreference: vector.proactivityPreference,
      topicBoundaries: vector.topicBoundaries,
    });
  }

  /**
   * Record explicitly toxic behavior — aggressive trust penalty.
   * If trust drops below 0.28, toneBias auto-switches to "sharp".
   */
  async recordToxicBehavior(
    guildId: string,
    userId: string,
  ): Promise<RelationshipVector> {
    const vector = await this.getVector(guildId, userId);
    const newTrust = Math.max(0, vector.trustLevel - 0.04);
    const newCloseness = Math.max(0, vector.closeness - 0.02);
    const autoSharp = newTrust <= 0.28 || newCloseness <= 0.22;

    return this.upsertRelationship({
      guildId,
      userId,
      toneBias: autoSharp ? "sharp" : vector.toneBias,
      roastLevel: vector.roastLevel,
      praiseBias: vector.praiseBias,
      interruptPriority: Math.max(0, vector.interruptPriority - (autoSharp ? 1 : 0)),
      doNotMock: vector.doNotMock,
      doNotInitiate: vector.doNotInitiate,
      protectedTopics: vector.protectedTopics,
      closeness: newCloseness,
      trustLevel: newTrust,
      familiarity: vector.familiarity,
      interactionCount: vector.interactionCount + 1,
      proactivityPreference: vector.proactivityPreference,
      topicBoundaries: vector.topicBoundaries,
    });
  }

  private async findProfile(guildId: string, userId: string): Promise<RelationshipProfileRecord | null> {
    return this.profiles.findUnique({
      where: {
        guildId_userId: {
          guildId,
          userId,
        },
      },
    });
  }

  /**
   * Seed initial relationship profiles for users discovered during chat import.
   * @param userMessageCounts map of userId -> number of imported messages
   */
  async seedFromImportedHistory(
    guildId: string,
    userMessageCounts: Map<string, number>,
  ): Promise<number> {
    let seeded = 0;

    for (const [userId, msgCount] of userMessageCounts) {
      const existing = await this.findProfile(guildId, userId);
      if (existing) continue;

      const familiarity = Math.min(1, msgCount / 200);
      const closeness = Math.min(0.5, msgCount / 400);

      await this.upsertRelationship({
        guildId,
        userId,
        toneBias: "neutral",
        roastLevel: 0,
        praiseBias: 0,
        interruptPriority: 0,
        doNotMock: false,
        doNotInitiate: false,
        protectedTopics: [],
        closeness,
        trustLevel: DEFAULT_SIGNALS.trustLevel,
        familiarity,
        interactionCount: msgCount,
        proactivityPreference: DEFAULT_SIGNALS.proactivityPreference,
        topicBoundaries: DEFAULT_SIGNALS.topicBoundaries,
      });

      seeded++;
    }

    return seeded;
  }

  private toOverlay(profile: RelationshipProfileRecord): RelationshipOverlay {
    const toneBias = deriveSignalToneBias(
      profile.toneBias,
      profile.closeness ?? DEFAULT_SIGNALS.closeness,
      profile.trustLevel ?? DEFAULT_SIGNALS.trustLevel,
    );

    return {
      toneBias,
      roastLevel: deriveSignalRoastLevel(
        profile.roastLevel,
        profile.closeness ?? DEFAULT_SIGNALS.closeness,
        profile.trustLevel ?? DEFAULT_SIGNALS.trustLevel,
        profile.doNotMock,
      ),
      praiseBias: deriveSignalPraiseBias(
        profile.praiseBias,
        profile.closeness ?? DEFAULT_SIGNALS.closeness,
        profile.familiarity ?? DEFAULT_SIGNALS.familiarity,
      ),
      interruptPriority: deriveSignalInterruptPriority(
        profile.interruptPriority,
        profile.proactivityPreference ?? DEFAULT_SIGNALS.proactivityPreference,
        profile.familiarity ?? DEFAULT_SIGNALS.familiarity,
      ),
      doNotMock: profile.doNotMock,
      doNotInitiate: profile.doNotInitiate,
      protectedTopics: profile.protectedTopics,
    };
  }

  private toVector(profile: RelationshipProfileRecord): RelationshipVector {
    return createDefaultVector(profile.userId, profile.guildId, this.toOverlay(profile), {
      closeness: profile.closeness ?? DEFAULT_SIGNALS.closeness,
      trustLevel: profile.trustLevel ?? DEFAULT_SIGNALS.trustLevel,
      familiarity: profile.familiarity ?? DEFAULT_SIGNALS.familiarity,
      interactionCount: profile.interactionCount ?? DEFAULT_SIGNALS.interactionCount,
      proactivityPreference: profile.proactivityPreference ?? DEFAULT_SIGNALS.proactivityPreference,
      topicBoundaries: normalizeTopicBoundaries(profile.topicBoundaries),
    });
  }
}

function deriveSignalToneBias(baseToneBias: string, closeness: number, trustLevel: number) {
  if (baseToneBias && baseToneBias !== "neutral") {
    return baseToneBias;
  }

  if (trustLevel <= 0.28 || closeness <= 0.22) {
    return "sharp";
  }

  if (trustLevel >= 0.72 || closeness >= 0.72) {
    return "friendly";
  }

  return baseToneBias;
}

function deriveSignalRoastLevel(baseRoastLevel: number, closeness: number, trustLevel: number, doNotMock: boolean) {
  if (doNotMock) {
    return 0;
  }

  if (trustLevel <= 0.3) {
    return Math.min(5, Math.max(baseRoastLevel, 3));
  }

  if (closeness >= 0.78 && trustLevel >= 0.72) {
    return Math.max(0, baseRoastLevel - 1);
  }

  return baseRoastLevel;
}

function deriveSignalPraiseBias(basePraiseBias: number, closeness: number, familiarity: number) {
  const boost = closeness >= 0.7 ? 1 : familiarity >= 0.78 ? 1 : 0;
  return Math.max(0, Math.min(5, basePraiseBias + boost));
}

function deriveSignalInterruptPriority(baseInterruptPriority: number, proactivityPreference: number, familiarity: number) {
  const boost = proactivityPreference >= 0.72 && familiarity >= 0.65 ? 1 : 0;
  return Math.max(0, Math.min(5, baseInterruptPriority + boost));
}

function normalizeTopicBoundaries(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const normalized: Record<string, boolean> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === "boolean") {
      normalized[key] = entry;
    }
  }
  return normalized;
}

