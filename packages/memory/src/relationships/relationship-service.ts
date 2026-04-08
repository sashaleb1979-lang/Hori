import type { AppPrismaClient, RelationshipOverlay } from "@hori/shared";

export class RelationshipService {
  constructor(private readonly prisma: AppPrismaClient) {}

  async getRelationship(guildId: string, userId: string): Promise<RelationshipOverlay | null> {
    const profile = await this.prisma.relationshipProfile.findUnique({
      where: {
        guildId_userId: {
          guildId,
          userId
        }
      }
    });

    if (!profile) {
      return null;
    }

    return {
      toneBias: profile.toneBias,
      roastLevel: profile.roastLevel,
      praiseBias: profile.praiseBias,
      interruptPriority: profile.interruptPriority,
      doNotMock: profile.doNotMock,
      doNotInitiate: profile.doNotInitiate,
      protectedTopics: profile.protectedTopics
    };
  }

  async upsertRelationship(input: {
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
  }) {
    return this.prisma.relationshipProfile.upsert({
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
        updatedBy: input.updatedBy ?? undefined
      }
    });
  }
}

