import { describe, expect, it, vi } from "vitest";

import { EMPTY_REPLY_FALLBACK, prepareReplyForDelivery, resolveModerationReplyForDelivery } from "../apps/bot/src/router/message-router";

describe("prepareReplyForDelivery", () => {
  it("replaces blank string replies with a fallback", () => {
    expect(prepareReplyForDelivery("")).toBe(EMPTY_REPLY_FALLBACK);
    expect(prepareReplyForDelivery("   ")).toBe(EMPTY_REPLY_FALLBACK);
    expect(prepareReplyForDelivery(undefined)).toBe(EMPTY_REPLY_FALLBACK);
  });

  it("preserves media payloads even when their text is blank", () => {
    const reply = {
      text: "",
      media: {
        filePath: "assets/memes/test.png",
        mediaId: "media-1",
        type: "image"
      }
    };

    expect(prepareReplyForDelivery(reply)).toBe(reply);
  });

  it("replaces blank payload text when there is no media", () => {
    expect(prepareReplyForDelivery({ text: "   " })).toEqual({ text: EMPTY_REPLY_FALLBACK });
  });

  it("does not promise a timeout phrase when moderation could not be applied", async () => {
    const reply = await resolveModerationReplyForDelivery(
      {
        logger: { warn: vi.fn() }
      } as never,
      {
        inGuild: () => true,
        guild: {
          members: {
            me: {
              permissions: {
                has: () => false
              }
            }
          }
        }
      } as never,
      "ответ",
      {
        kind: "timeout",
        durationMinutes: 15,
        replacementText: "тайм-аут на 15 минут."
      }
    );

    expect(reply).toBe("ответ");
  });

  it("appends the timeout phrase only after Discord timeout succeeds", async () => {
    const timeout = vi.fn().mockResolvedValue(undefined);
    const reply = await resolveModerationReplyForDelivery(
      {
        logger: { warn: vi.fn() }
      } as never,
      {
        inGuild: () => true,
        guildId: "guild-1",
        channelId: "channel-1",
        author: { id: "user-1" },
        guild: {
          members: {
            me: {
              permissions: {
                has: () => true
              }
            }
          }
        },
        member: {
          moderatable: true,
          timeout
        }
      } as never,
      "ответ",
      {
        kind: "timeout",
        durationMinutes: 15,
        replacementText: "тайм-аут на 15 минут."
      }
    );

    expect(timeout).toHaveBeenCalledWith(15 * 60 * 1000, "Hori stage 4 aggression timeout");
    expect(reply).toBe("ответ тайм-аут на 15 минут.");
  });
});
