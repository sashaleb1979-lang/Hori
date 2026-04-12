import { describe, expect, it } from "vitest";

import { MicroReactionService } from "@hori/core";
import type { MessageEnvelope } from "@hori/shared";

const baseMessage: MessageEnvelope = {
  messageId: "message-1",
  guildId: "guild-1",
  channelId: "channel-1",
  userId: "user-1",
  username: "tester",
  displayName: "Tester",
  channelName: "general",
  content: "",
  createdAt: new Date("2026-04-13T00:00:00Z"),
  replyToMessageId: null,
  mentionCount: 1,
  mentionedBot: true,
  mentionsBotByName: true,
  mentionedUserIds: [],
  triggerSource: "mention",
  isModerator: false,
  explicitInvocation: true
};

describe("micro reaction service", () => {
  it("detects direct toxicity addressed to Hori", () => {
    const service = new MicroReactionService();

    const result = service.detect({
      content: "Хори, тупой бот",
      message: { ...baseMessage, content: "Хори, тупой бот" },
      messageKind: "provocation"
    });

    expect(result?.kind).toBe("toxicity");
    expect(result?.rule).toBe("direct_toxicity");
    expect(result?.reply.length).toBeGreaterThan(0);
  });

  it("detects direct praise addressed to Hori", () => {
    const service = new MicroReactionService();

    const result = service.detect({
      content: "Хори, ты топ, спасибо",
      message: { ...baseMessage, content: "Хори, ты топ, спасибо" },
      messageKind: "smalltalk_hangout"
    });

    expect(result?.kind).toBe("praise");
    expect(result?.rule).toBe("direct_praise");
    expect(result?.reply.length).toBeGreaterThan(0);
  });

  it("ignores undirected noise", () => {
    const service = new MicroReactionService();

    const result = service.detect({
      content: "спасибо, ты топ",
      message: {
        ...baseMessage,
        content: "спасибо, ты топ",
        mentionedBot: false,
        mentionsBotByName: false,
        mentionCount: 0,
        explicitInvocation: false,
        triggerSource: "name"
      },
      messageKind: "smalltalk_hangout"
    });

    expect(result).toBeNull();
  });
});