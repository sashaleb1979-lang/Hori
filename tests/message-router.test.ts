import { describe, expect, it } from "vitest";

import { EMPTY_REPLY_FALLBACK, prepareReplyForDelivery } from "../apps/bot/src/router/message-router";

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
});