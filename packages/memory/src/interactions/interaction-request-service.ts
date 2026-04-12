import type { AppPrismaClient } from "@hori/shared";

export type InteractionRequestStatus =
  | "pending"
  | "answered"
  | "approved"
  | "rejected"
  | "dismissed"
  | "expired"
  | "cancelled";

export interface CreateInteractionRequestInput {
  guildId: string;
  channelId: string;
  messageId?: string | null;
  userId: string;
  requestType: "question" | "choice" | "dialogue" | "approval" | "ack";
  title: string;
  prompt: string;
  category?: string | null;
  expectedAnswerType?: string | null;
  allowedOptions?: string[];
  metadataJson?: unknown;
  expiresAt?: Date | null;
}

export interface InteractionRequestRecord {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string | null;
  userId: string;
  requestType: string;
  status: string;
  title: string;
  prompt: string;
  category: string | null;
  expectedAnswerType: string | null;
  allowedOptions: string[];
  answerText: string | null;
  answerJson: unknown;
  metadataJson: unknown;
  expiresAt: Date | null;
  answeredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class InteractionRequestService {
  constructor(private readonly prisma: AppPrismaClient) {}

  async create(input: CreateInteractionRequestInput): Promise<InteractionRequestRecord> {
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.interactionRequest.create({
        data: {
          guildId: input.guildId,
          channelId: input.channelId,
          messageId: input.messageId ?? null,
          userId: input.userId,
          requestType: input.requestType,
          title: input.title,
          prompt: input.prompt,
          category: input.category ?? null,
          expectedAnswerType: input.expectedAnswerType ?? null,
          allowedOptions: input.allowedOptions ?? [],
          metadataJson: input.metadataJson as never,
          expiresAt: input.expiresAt ?? null
        }
      });

      await tx.interactionRequestEvent.create({
        data: {
          requestId: request.id,
          actorUserId: input.userId,
          eventType: "created",
          toStatus: "pending",
          payloadJson: { category: input.category ?? null } as never
        }
      });

      return request;
    });
  }

  async answer(id: string, actorUserId: string, answerText?: string | null, answerJson?: unknown): Promise<InteractionRequestRecord | null> {
    return this.transition(id, actorUserId, "answered", {
      answerText: answerText?.trim() || null,
      answerJson,
      answeredAt: new Date()
    });
  }

  async cancel(id: string, actorUserId: string, reason?: string): Promise<InteractionRequestRecord | null> {
    return this.transition(id, actorUserId, "cancelled", {
      answerText: reason ?? null
    });
  }

  async getPending(id: string): Promise<InteractionRequestRecord | null> {
    const request = await this.prisma.interactionRequest.findUnique({
      where: { id }
    });

    if (!request || request.status !== "pending") {
      return null;
    }

    if (request.expiresAt && request.expiresAt.getTime() < Date.now()) {
      await this.transition(id, request.userId, "expired", {});
      return null;
    }

    return request;
  }

  private async transition(
    id: string,
    actorUserId: string,
    nextStatus: InteractionRequestStatus,
    data: { answerText?: string | null; answerJson?: unknown; answeredAt?: Date | null }
  ): Promise<InteractionRequestRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.interactionRequest.findUnique({
        where: { id }
      });

      if (!existing) {
        return null;
      }

      const request = await tx.interactionRequest.update({
        where: { id },
        data: {
          status: nextStatus,
          answerText: data.answerText ?? undefined,
          answerJson: data.answerJson as never,
          answeredAt: data.answeredAt ?? undefined
        }
      });

      await tx.interactionRequestEvent.create({
        data: {
          requestId: id,
          actorUserId,
          eventType: nextStatus,
          fromStatus: existing.status,
          toStatus: nextStatus,
          payloadJson: {
            hasAnswerText: Boolean(data.answerText),
            hasAnswerJson: data.answerJson !== undefined
          } as never
        }
      });

      return request;
    });
  }
}
