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

  private toOverlay(profile: RelationshipProfileRecord): RelationshipOverlay {
    return {
      toneBias: profile.toneBias,
      roastLevel: profile.roastLevel,
      praiseBias: profile.praiseBias,
      interruptPriority: profile.interruptPriority,
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

