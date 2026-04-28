import { describe, expect, it } from "vitest";

import {
  isModelRoutingSlot,
  MODEL_ROUTING_SLOTS,
  resolveModelRouting,
  serializeModelRouting,
  slotForIntent
} from "@hori/llm";
import { loadEnv } from "@hori/config";

function openaiEnv() {
  return loadEnv({
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/hori",
    REDIS_URL: "redis://localhost:6379",
    LLM_PROVIDER: "openai"
  });
}

describe("V6 Phase J: model routing extra slots", () => {
  it("registers relationship_eval and code_analysis as routing slots", () => {
    expect(MODEL_ROUTING_SLOTS).toContain("relationship_eval");
    expect(MODEL_ROUTING_SLOTS).toContain("code_analysis");
    expect(isModelRoutingSlot("relationship_eval")).toBe(true);
    expect(isModelRoutingSlot("code_analysis")).toBe(true);
  });

  it("slotForIntent maps the new intents", () => {
    expect(slotForIntent("relationship_eval")).toBe("relationship_eval");
    expect(slotForIntent("code_analysis")).toBe("code_analysis");
  });

  it("balanced_openai routes relationship_eval to gpt-5-nano by default", () => {
    const env = openaiEnv();
    const resolved = resolveModelRouting(env, null);
    expect(resolved.slots.relationship_eval).toBe("gpt-5-nano");
    expect(resolved.slots.code_analysis).toBe("gpt-5.4-mini");
  });

  it("override applied to relationship_eval persists through resolve", () => {
    const env = openaiEnv();
    const stored = serializeModelRouting("balanced_openai", { relationship_eval: "gpt-5-nano", code_analysis: "gpt-5.4-mini" });
    const resolved = resolveModelRouting(env, stored);
    expect(resolved.slots.relationship_eval).toBe("gpt-5-nano");
    expect(resolved.slots.code_analysis).toBe("gpt-5.4-mini");
    expect(resolved.overrides.relationship_eval).toBe("gpt-5-nano");
  });
});
