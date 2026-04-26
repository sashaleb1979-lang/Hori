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
  it("does not short-circuit direct toxicity addressed to Hori", () => {
    const service = new MicroReactionService();

    const result = service.detect({
      content: "Хори, тупой бот",
      message: { ...baseMessage, content: "Хори, тупой бот" },
      messageKind: "provocation"
    });

    expect(result).toBeNull();
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

  it("detects directed hostile meta feedback and keeps it on the dry fast path", () => {
    const service = new MicroReactionService();

    const result = service.detect({
      content: "ты галлюцинируешь",
      message: {
        ...baseMessage,
        content: "ты галлюцинируешь",
        explicitInvocation: false,
        triggerSource: "reply",
        mentionedBot: false,
        mentionsBotByName: false,
        mentionCount: 0
      },
      messageKind: "meta_feedback"
    });

    expect(result?.kind).toBe("meta_feedback");
    expect(result?.rule).toBe("direct_meta_feedback");
    expect(result?.reply.length).toBeGreaterThan(0);
  });

  it("detects rhetorical self-slur questions with a non-endorsement fast reply", () => {
    const service = new MicroReactionService();

    const result = service.detect({
      content: "я выблядок?",
      message: {
        ...baseMessage,
        content: "я выблядок?",
        explicitInvocation: false,
        triggerSource: "reply",
        mentionedBot: false,
        mentionsBotByName: false,
        mentionCount: 0
      },
      messageKind: "provocation"
    });

    expect(result?.kind).toBe("meta_feedback");
    expect(result?.rule).toBe("self_slur_question");
    expect(result?.reply).not.toMatch(/да|угу|конечно/i);
  });

  it("does not fast-path undirected meta accusations", () => {
    const service = new MicroReactionService();

    const result = service.detect({
      content: "ты галлюцинируешь",
      message: {
        ...baseMessage,
        content: "ты галлюцинируешь",
        mentionedBot: false,
        mentionsBotByName: false,
        mentionCount: 0,
        explicitInvocation: false,
        triggerSource: "name"
      },
      messageKind: "meta_feedback"
    });

    expect(result).toBeNull();
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
