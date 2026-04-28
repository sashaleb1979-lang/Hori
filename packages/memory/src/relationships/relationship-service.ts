import type { AppPrismaClient, RelationshipOverlay, RelationshipState } from "@hori/shared";
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
  relationshipState?: RelationshipState | null;
  relationshipScore?: number | null;
  positiveMarks?: number | null;
  escalationStage?: number | null;
  escalationUpdatedAt?: Date | null;
  coldUntil?: Date | null;
  coldPermanent?: boolean | null;
  closeness?: number | null;
  trustLevel?: number | null;
  familiarity?: number | null;
  interactionCount?: number | null;
  proactivityPreference?: number | null;
  topicBoundaries?: unknown;
  characteristic?: string | null;
  lastChange?: string | null;
  characteristicUpdatedAt?: Date | null;
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
  relationshipState?: RelationshipState;
  relationshipScore?: number;
  positiveMarks?: number;
  escalationStage?: number;
  escalationUpdatedAt?: Date | null;
  coldUntil?: Date | null;
  coldPermanent?: boolean;
  closeness?: number;
  trustLevel?: number;
  familiarity?: number;
  interactionCount?: number;
  proactivityPreference?: number;
  topicBoundaries?: Record<string, boolean>;
  characteristic?: string | null;
  lastChange?: string | null;
  characteristicUpdatedAt?: Date | null;
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
        relationshipState: input.relationshipState ?? "base",
        relationshipScore: clampRelationshipScore(input.relationshipScore ?? 0),
        positiveMarks: Math.max(0, input.positiveMarks ?? 0),
        escalationStage: clampEscalationStage(input.escalationStage ?? 0),
        escalationUpdatedAt: input.escalationUpdatedAt ?? null,
        coldUntil: input.coldUntil ?? null,
        coldPermanent: input.coldPermanent ?? false,
        closeness: input.closeness ?? DEFAULT_SIGNALS.closeness,
        trustLevel: input.trustLevel ?? DEFAULT_SIGNALS.trustLevel,
        familiarity: input.familiarity ?? DEFAULT_SIGNALS.familiarity,
        interactionCount: input.interactionCount ?? DEFAULT_SIGNALS.interactionCount,
        proactivityPreference: input.proactivityPreference ?? DEFAULT_SIGNALS.proactivityPreference,
        topicBoundaries: input.topicBoundaries ?? DEFAULT_SIGNALS.topicBoundaries,
        characteristic: input.characteristic ?? null,
        lastChange: input.lastChange ?? null,
        characteristicUpdatedAt: input.characteristicUpdatedAt ?? null,
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
        relationshipState: input.relationshipState ?? "base",
        relationshipScore: clampRelationshipScore(input.relationshipScore ?? 0),
        positiveMarks: Math.max(0, input.positiveMarks ?? 0),
        escalationStage: clampEscalationStage(input.escalationStage ?? 0),
        escalationUpdatedAt: input.escalationUpdatedAt ?? null,
        coldUntil: input.coldUntil ?? null,
        coldPermanent: input.coldPermanent ?? false,
        closeness: input.closeness ?? DEFAULT_SIGNALS.closeness,
        trustLevel: input.trustLevel ?? DEFAULT_SIGNALS.trustLevel,
        familiarity: input.familiarity ?? DEFAULT_SIGNALS.familiarity,
        interactionCount: input.interactionCount ?? DEFAULT_SIGNALS.interactionCount,
        proactivityPreference: input.proactivityPreference ?? DEFAULT_SIGNALS.proactivityPreference,
        topicBoundaries: input.topicBoundaries ?? DEFAULT_SIGNALS.topicBoundaries,
        characteristic: input.characteristic ?? null,
        lastChange: input.lastChange ?? null,
        characteristicUpdatedAt: input.characteristicUpdatedAt ?? null,
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
    const vector = this.toVector(profile);
    // V6 Phase B: surface read-time escalation decay so panel/UI reflects live stage.
    const decayedStage = this.resolveEscalationStage(vector, new Date());
    return decayedStage === vector.escalationStage ? vector : { ...vector, escalationStage: decayedStage };
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
      relationshipState: vector.relationshipState,
      relationshipScore: vector.relationshipScore,
      positiveMarks: vector.positiveMarks,
      escalationStage: this.resolveEscalationStage(vector, new Date()),
      escalationUpdatedAt: vector.escalationUpdatedAt,
      coldUntil: vector.coldUntil,
      coldPermanent: vector.coldPermanent,
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

    // Grace period: don't punish users Hori barely knows yet
    if (vector.interactionCount < 10) {
      return this.upsertRelationship({
        ...vector,
        guildId,
        userId,
        interactionCount: vector.interactionCount + 1,
      });
    }

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
      relationshipState: "cold_lowest",
      relationshipScore: -1.5,
      positiveMarks: 0,
      escalationStage: 0,
      escalationUpdatedAt: new Date(),
      coldUntil: null,
      coldPermanent: true,
      closeness: newCloseness,
      trustLevel: newTrust,
      familiarity: vector.familiarity,
      interactionCount: vector.interactionCount + 1,
      proactivityPreference: vector.proactivityPreference,
      topicBoundaries: vector.topicBoundaries,
    });
  }

  async noteAggressionMarker(guildId: string, userId: string, now = new Date()) {
    const vector = await this.getVector(guildId, userId);
    const currentStage = this.resolveEscalationStage(vector, now);

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
      relationshipState: vector.relationshipState,
      relationshipScore: vector.relationshipScore,
      positiveMarks: vector.positiveMarks,
      escalationStage: Math.min(4, currentStage + 1),
      escalationUpdatedAt: now,
      coldUntil: vector.coldUntil,
      coldPermanent: vector.coldPermanent,
      closeness: vector.closeness,
      trustLevel: vector.trustLevel,
      familiarity: vector.familiarity,
      interactionCount: vector.interactionCount,
      proactivityPreference: vector.proactivityPreference,
      topicBoundaries: vector.topicBoundaries,
    });
  }

  async clearEscalation(guildId: string, userId: string, now = new Date()) {
    const vector = await this.getVector(guildId, userId);

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
      relationshipState: vector.relationshipState,
      relationshipScore: vector.relationshipScore,
      positiveMarks: vector.positiveMarks,
      escalationStage: 0,
      escalationUpdatedAt: now,
      coldUntil: vector.coldUntil,
      coldPermanent: vector.coldPermanent,
      closeness: vector.closeness,
      trustLevel: vector.trustLevel,
      familiarity: vector.familiarity,
      interactionCount: vector.interactionCount,
      proactivityPreference: vector.proactivityPreference,
      topicBoundaries: vector.topicBoundaries,
    });
  }

  async confirmAggression(guildId: string, userId: string, options: { timedOut?: boolean; now?: Date } = {}) {
    const now = options.now ?? new Date();
    const vector = await this.getVector(guildId, userId);

    // V5.1: AGGRESSIVE confirmed → score -1 (нижний уровень новой шкалы -1..4),
    // cold_lowest, escalationStage:
    //   - после Stage 4 + timeout → откат до 3 немедленно (не 0);
    //   - на Stage 2 confirm → как минимум 2.
    return this.upsertRelationship({
      guildId,
      userId,
      toneBias: "sharp",
      roastLevel: Math.max(vector.roastLevel, 1),
      praiseBias: vector.praiseBias,
      interruptPriority: vector.interruptPriority,
      doNotMock: vector.doNotMock,
      doNotInitiate: vector.doNotInitiate,
      protectedTopics: vector.protectedTopics,
      relationshipState: "cold_lowest",
      relationshipScore: -1,
      positiveMarks: 0,
      escalationStage: options.timedOut ? 3 : Math.max(2, this.resolveEscalationStage(vector, now)),
      escalationUpdatedAt: now,
      coldUntil: null,
      coldPermanent: true,
      closeness: Math.max(0, vector.closeness - 0.04),
      trustLevel: Math.max(0, vector.trustLevel - 0.08),
      familiarity: vector.familiarity,
      interactionCount: vector.interactionCount + 1,
      proactivityPreference: vector.proactivityPreference,
      topicBoundaries: vector.topicBoundaries,
    });
  }

  async resetColdState(guildId: string, userId: string, updatedBy?: string | null) {
    const vector = await this.getVector(guildId, userId);

    return this.upsertRelationship({
      guildId,
      userId,
      updatedBy,
      toneBias: vector.toneBias === "sharp" ? "neutral" : vector.toneBias,
      roastLevel: vector.roastLevel,
      praiseBias: vector.praiseBias,
      interruptPriority: vector.interruptPriority,
      doNotMock: vector.doNotMock,
      doNotInitiate: vector.doNotInitiate,
      protectedTopics: vector.protectedTopics,
      relationshipState: "base",
      relationshipScore: Math.max(0, vector.relationshipScore ?? 0),
      positiveMarks: vector.positiveMarks ?? 0,
      escalationStage: 0,
      escalationUpdatedAt: new Date(),
      coldUntil: null,
      coldPermanent: false,
      closeness: vector.closeness,
      trustLevel: vector.trustLevel,
      familiarity: vector.familiarity,
      interactionCount: vector.interactionCount,
      proactivityPreference: vector.proactivityPreference,
      topicBoundaries: vector.topicBoundaries,
    });
  }

  async setRelationshipState(guildId: string, userId: string, relationshipState: RelationshipState, updatedBy?: string | null) {
    const vector = await this.getVector(guildId, userId);
    // V5.1 mapping: cold_lowest=-1, base=0, warm=1, close=2, teasing=3, sweet=4. serious \u2014 mood-override.
    const nextScore =
      relationshipState === "cold_lowest" ? -1 :
      relationshipState === "sweet" ? 4 :
      relationshipState === "teasing" ? 3 :
      relationshipState === "close" ? 2 :
      relationshipState === "warm" ? 1 :
      relationshipState === "base" ? 0 :
      vector.relationshipScore ?? 0;

    return this.upsertRelationship({
      guildId,
      userId,
      updatedBy,
      toneBias: relationshipState === "cold_lowest" ? "sharp" : vector.toneBias,
      roastLevel: vector.roastLevel,
      praiseBias: vector.praiseBias,
      interruptPriority: vector.interruptPriority,
      doNotMock: vector.doNotMock,
      doNotInitiate: vector.doNotInitiate,
      protectedTopics: vector.protectedTopics,
      relationshipState,
      relationshipScore: nextScore,
      positiveMarks: relationshipState === "cold_lowest" ? 0 : vector.positiveMarks,
      escalationStage: relationshipState === "cold_lowest" ? Math.max(2, vector.escalationStage ?? 0) : vector.escalationStage,
      escalationUpdatedAt: new Date(),
      coldUntil: null,
      coldPermanent: relationshipState === "cold_lowest" ? true : vector.coldPermanent,
      closeness: vector.closeness,
      trustLevel: vector.trustLevel,
      familiarity: vector.familiarity,
      interactionCount: vector.interactionCount,
      proactivityPreference: vector.proactivityPreference,
      topicBoundaries: vector.topicBoundaries,
    });
  }

  /**
   * V6 integer level API (−1..4). Wraps `relationshipState`.
   *  −1 cold_lowest · 0 base · 1 warm · 2 close · 3 teasing · 4 sweet.
   * `serious` → returns null (out of level scale).
   */
  async getLevel(guildId: string, userId: string): Promise<number> {
    const vector = await this.getVector(guildId, userId);
    const state = vector.relationshipState;
    if (state === "cold_lowest") return -1;
    if (state === "sweet") return 4;
    if (state === "teasing") return 3;
    if (state === "close") return 2;
    if (state === "warm") return 1;
    return 0;
  }

  async setLevel(guildId: string, userId: string, level: number, updatedBy?: string | null) {
    // Below 0 round down; above 0 — only at integer thresholds (Math.floor for both as per spec).
    const clamped = Math.max(-1, Math.min(4, Math.floor(Number.isFinite(level) ? level : 0)));
    const state: RelationshipState =
      clamped === -1 ? "cold_lowest" :
      clamped === 4 ? "sweet" :
      clamped === 3 ? "teasing" :
      clamped === 2 ? "close" :
      clamped === 1 ? "warm" : "base";
    return this.setRelationshipState(guildId, userId, state, updatedBy);
  }

  async applySessionVerdict(
    guildId: string,
    userId: string,
    verdict: "A" | "B" | "V",
    options: {
      allowStatePromotion?: boolean;
      updatedBy?: string | null;
      /** V5.1: постоянная характеристика пользователя от evaluator (для обновления). */
      characteristic?: string | null;
      /** V5.1: короткое описание последнего изменения / настроения. */
      lastChange?: string | null;
    } = {}
  ) {
    const vector = await this.getVector(guildId, userId);
    const score = vector.relationshipScore ?? 0;
    const positiveMarks = vector.positiveMarks ?? 0;
    let nextScore = score;
    let nextPositiveMarks = positiveMarks;

    if (verdict === "A") {
      nextPositiveMarks += 1;
      if (nextPositiveMarks >= 2) {
        nextScore = clampRelationshipScore(score + 0.5);
        nextPositiveMarks = 0;
      }
    }

    if (verdict === "V") {
      nextScore = clampRelationshipScore(score - 0.5);
      nextPositiveMarks = 0;
    }

    // V5.1 Phase F: нейтральная сессия → микро-апдейт +ε к score (медленный рост доверия).
    if (verdict === "B") {
      nextScore = clampRelationshipScore(score + 0.05);
    }

    // V5.1 recovery: \u0435\u0441\u043b\u0438 score \u043f\u043e\u0434\u043d\u044f\u043b\u0441\u044f \u0438\u0437 \u043e\u0442\u0440\u0438\u0446\u0430\u0442\u0435\u043b\u044c\u043d\u043e\u0439 \u0437\u043e\u043d\u044b \u0434\u043e 0+ \u2014 \u043f\u043e\u043b\u043d\u044b\u0439 \u0441\u0431\u0440\u043e\u0441 escalation \u0438 cold_lowest.
    const recovered = score < 0 && nextScore >= 0;
    const nextEscalationStage = recovered ? 0 : this.resolveEscalationStage(vector, new Date());
    const nextColdPermanent = recovered ? false : vector.coldPermanent;
    const baseStateForResolve = recovered ? "base" : (vector.relationshipState ?? "base");
    const stateScore = options.allowStatePromotion ? nextScore : (vector.relationshipScore ?? 0);
    const nextRelationshipState = recovered
      ? resolveRelationshipStateFromScore(nextScore, "base")
      : resolveRelationshipStateFromScore(stateScore, baseStateForResolve as RelationshipState);

    return this.upsertRelationship({
      guildId,
      userId,
      updatedBy: options.updatedBy,
      toneBias: recovered && vector.toneBias === "sharp" ? "neutral" : vector.toneBias,
      roastLevel: vector.roastLevel,
      praiseBias: vector.praiseBias,
      interruptPriority: vector.interruptPriority,
      doNotMock: vector.doNotMock,
      doNotInitiate: vector.doNotInitiate,
      protectedTopics: vector.protectedTopics,
      relationshipState: nextRelationshipState,
      relationshipScore: nextScore,
      positiveMarks: nextPositiveMarks,
      escalationStage: nextEscalationStage,
      escalationUpdatedAt: recovered ? new Date() : vector.escalationUpdatedAt,
      coldUntil: vector.coldUntil,
      coldPermanent: nextColdPermanent,
      closeness: vector.closeness,
      trustLevel: vector.trustLevel,
      familiarity: vector.familiarity,
      interactionCount: vector.interactionCount,
      proactivityPreference: vector.proactivityPreference,
      topicBoundaries: vector.topicBoundaries,
      characteristic: options.characteristic !== undefined ? options.characteristic : vector.characteristic ?? null,
      lastChange: options.lastChange !== undefined ? options.lastChange : vector.lastChange ?? null,
      characteristicUpdatedAt: options.characteristic !== undefined && options.characteristic !== (vector.characteristic ?? null)
        ? new Date()
        : vector.characteristicUpdatedAt ?? null,
    });
  }

  private resolveEscalationStage(
    vector: Pick<RelationshipOverlay, "escalationStage" | "escalationUpdatedAt" | "coldPermanent" | "relationshipState">,
    now: Date
  ) {
    const stage = clampEscalationStage(vector.escalationStage ?? 0);
    if (stage <= 0) {
      return 0;
    }

    if (!vector.escalationUpdatedAt) {
      return stage;
    }

    const staleMs = now.getTime() - vector.escalationUpdatedAt.getTime();
    if (staleMs < 24 * 60 * 60 * 1000) {
      return stage;
    }

    // V5.1 правила сброса по 24 часам:
    //  - Stage 1 (только warning, без AGGRESSIVE confirm) → полный сброс до 0;
    //  - Stage 2/3/4 (был подтверждённый AGGRESSIVE или timeout) → понижается до 2,
    //    ниже автоматически НЕ опускается. Полный сброс до 0 только через recovery
    //    (поднятие score с отрицательного до 0).
    const isPostAggressive = vector.coldPermanent === true || vector.relationshipState === "cold_lowest" || stage >= 2;
    if (isPostAggressive) {
      return 2;
    }
    return 0;
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
      relationshipState: profile.relationshipState ?? "base",
      relationshipScore: clampRelationshipScore(profile.relationshipScore ?? 0),
      positiveMarks: Math.max(0, profile.positiveMarks ?? 0),
      escalationStage: clampEscalationStage(profile.escalationStage ?? 0),
      escalationUpdatedAt: profile.escalationUpdatedAt ?? null,
      coldUntil: profile.coldUntil ?? null,
      coldPermanent: profile.coldPermanent ?? false,
      characteristic: profile.characteristic ?? null,
      lastChange: profile.lastChange ?? null,
      characteristicUpdatedAt: profile.characteristicUpdatedAt ?? null,
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

function clampRelationshipScore(value: number) {
  // V5.1 шкала: -1..4 (было -1.5..3).
  // -1 — cold_lowest потолок снизу; 4 — sweet потолок сверху.
  return Math.max(-1, Math.min(4, value));
}

function clampEscalationStage(value: number) {
  return Math.max(0, Math.min(4, Math.trunc(value)));
}

function resolveRelationshipStateFromScore(score: number, current?: RelationshipState) {
  // V5.1 шкала -1..4. serious — это mood-override, не позиция на шкале.
  // Ниже 0 — всегда флор-округление (любой минус → cold_lowest).
  // Выше 0 — переключение только при достижении абсолютного целого.
  if (current === "serious") {
    return current;
  }
  if (score < 0) {
    return "cold_lowest" as const;
  }
  if (score >= 4) {
    return "sweet" as const;
  }
  if (score >= 3) {
    return "teasing" as const;
  }
  if (score >= 2) {
    return "close" as const;
  }
  if (score >= 1) {
    return "warm" as const;
  }
  return "base" as const;
}

