import { describe, expect, it } from "vitest";

import { EmotionMediaDecisionService } from "@hori/core";
import { EmotionLabel, createNeutralState } from "@hori/core";
import { loadEnv, POWER_PROFILE_PRESETS } from "@hori/config";
import { resolveModelRouting } from "@hori/llm";

describe("emotion media decision", () => {
  it("routes repeated questions to repeated-loop media category", () => {
    const service = new EmotionMediaDecisionService();
    const emotionalState = {
      ...createNeutralState(),
      subjectiveFeeling: EmotionLabel.CURIOUS,
      intensity: 0.8
    };

    const result = service.decide({
      enabled: true,
      eligible: true,
      triggerSource: "reply",
      emotionalState,
      messageKind: "repeated_question",
      channelKind: "general",
      activeMode: "focused",
      contextConfidence: 0.9,
      conflictScore: 0.1,
      relationship: { closeness: 0.5, trustLevel: 0.5 },
      runtimeSettings: {
        powerProfile: "balanced",
        modelRouting: resolveModelRouting(loadEnv({
          DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/hori",
          REDIS_URL: "redis://localhost:6379"
        })),
        ...POWER_PROFILE_PRESETS.balanced,
        mediaAutoGlobalCooldownSec: 7200,
        mediaAutoMinConfidence: 0.82,
        mediaAutoMinIntensity: 0.62
      }
    });

    expect(result.allowAutoMedia).toBe(true);
    expect(result.reasonKey).toBe("repeated_loop");
    expect(result.emotionTags).toContain("confusion");
  });
});
