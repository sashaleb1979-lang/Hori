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

describe("model routing slots", () => {
  it("registers the 7 active routing slots", () => {
    expect(MODEL_ROUTING_SLOTS).toContain("classifier");
    expect(MODEL_ROUTING_SLOTS).toContain("chat");
    expect(MODEL_ROUTING_SLOTS).toContain("summary");
    expect(MODEL_ROUTING_SLOTS).toContain("search");
    expect(MODEL_ROUTING_SLOTS).toContain("analytics");
    expect(MODEL_ROUTING_SLOTS).toContain("profile");
    expect(MODEL_ROUTING_SLOTS).toContain("memory");
    expect(MODEL_ROUTING_SLOTS).toHaveLength(7);
  });

  it("does not register deleted slots", () => {
    expect(isModelRoutingSlot("relationship_eval")).toBe(false);
    expect(isModelRoutingSlot("code_analysis")).toBe(false);
    expect(isModelRoutingSlot("rewrite")).toBe(false);
  });

  it("slotForIntent maps active intents correctly", () => {
    expect(slotForIntent("analytics")).toBe("analytics");
    expect(slotForIntent("summary")).toBe("summary");
    expect(slotForIntent("search")).toBe("search");
    expect(slotForIntent("profile")).toBe("profile");
    expect(slotForIntent("memory_write")).toBe("memory");
    expect(slotForIntent("memory_forget")).toBe("memory");
    expect(slotForIntent("chat")).toBe("chat");
    expect(slotForIntent("rewrite")).toBe("chat"); // falls through to default
  });

  it("balanced_openai preset resolves all 7 slots", () => {
    const env = openaiEnv();
    const resolved = resolveModelRouting(env, null);
    expect(resolved.slots.classifier).toBe("gpt-5-nano");
    expect(resolved.slots.chat).toBe("gpt-5.4-nano");
    expect(resolved.slots.memory).toBe("gpt-5.4-nano");
  });

  it("override applied to memory slot persists through resolve", () => {
    const env = openaiEnv();
    const stored = serializeModelRouting("balanced_openai", { memory: "gpt-5-nano" });
    const resolved = resolveModelRouting(env, stored);
    expect(resolved.slots.memory).toBe("gpt-5-nano");
    expect(resolved.overrides.memory).toBe("gpt-5-nano");
  });
});
