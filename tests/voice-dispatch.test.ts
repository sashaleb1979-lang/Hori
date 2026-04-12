import { describe, expect, it } from "vitest";

import { buildVoiceEnvelope } from "../apps/bot/src/voice/voice-dispatch";

describe("voice-dispatch", () => {
  it("builds a synthetic explicit envelope for voice input", () => {
    const createdAt = new Date("2026-04-12T12:00:00.000Z");
    const envelope = buildVoiceEnvelope({
      guildId: "guild-1",
      guildName: "Guild",
      textChannelId: "channel-1",
      textChannelName: "general",
      userId: "user-1",
      username: "speaker",
      displayName: "Speaker",
      transcription: "хори, объясни это",
      createdAt,
      isModerator: false,
    });

    expect(envelope.messageId).toBe(`voice:guild-1:user-1:${createdAt.getTime()}`);
    expect(envelope.explicitInvocation).toBe(true);
    expect(envelope.mentionedBot).toBe(true);
    expect(envelope.triggerSource).toBe("mention");
  });
});