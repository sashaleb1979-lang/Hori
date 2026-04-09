import { describe, expect, it } from "vitest";

import { IntentRouter } from "../packages/core/src/intents/intent-router";
import type { MessageEnvelope } from "@hori/shared";

const baseMessage: MessageEnvelope = {
  messageId: "1",
  guildId: "guild",
  channelId: "channel",
  userId: "user",
  username: "tester",
  content: "",
  createdAt: new Date(),
  replyToMessageId: null,
  mentionCount: 0,
  mentionedBot: false,
  mentionsBotByName: false,
  mentionedUserIds: [],
  isModerator: false,
  explicitInvocation: true
};

describe("IntentRouter", () => {
  const router = new IntentRouter();

  it("routes help when only bot name is used", () => {
    const result = router.route({ ...baseMessage, content: "Хори" }, "Хори");
    expect(result.intent).toBe("help");
  });

  it("routes analytics by natural language", () => {
    const result = router.route({ ...baseMessage, content: "Хори кто больше всех писал" }, "Хори");
    expect(result.intent).toBe("analytics");
  });

  it("routes search by natural language", () => {
    const result = router.route({ ...baseMessage, content: "Хори найди свежую инфу" }, "Хори");
    expect(result.intent).toBe("search");
    expect(result.requiresSearch).toBe(true);
  });
});

