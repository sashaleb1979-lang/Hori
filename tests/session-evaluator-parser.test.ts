import { describe, expect, it } from "vitest";

import { parseEvaluatorOutput } from "../apps/worker/src/jobs/session-evaluator";

describe("V6 session evaluator — parseEvaluatorOutput", () => {
  it("parses strict JSON with verdict A + characteristic + lastChange", () => {
    const raw = JSON.stringify({
      verdict: "A",
      characteristic: "технарь, прямой, спокойный",
      lastChange: "обычная дружелюбная сессия"
    });
    const result = parseEvaluatorOutput(raw);
    expect(result.verdict).toBe("A");
    expect(result.characteristic).toBe("технарь, прямой, спокойный");
    expect(result.lastChange).toBe("обычная дружелюбная сессия");
  });

  it("extracts JSON wrapped in markdown / surrounding noise", () => {
    const raw = "Sure! ```json\n{\"verdict\":\"V\",\"characteristic\":\"грубит\",\"lastChange\":\"ругал Хори\"}\n```";
    const result = parseEvaluatorOutput(raw);
    expect(result.verdict).toBe("V");
    expect(result.characteristic).toBe("грубит");
  });

  it("defaults verdict to B for unknown letter", () => {
    const result = parseEvaluatorOutput(JSON.stringify({ verdict: "Z", characteristic: "x", lastChange: "y" }));
    expect(result.verdict).toBe("B");
  });

  it("clips overlong characteristic / lastChange", () => {
    const longChar = "x".repeat(800);
    const longChange = "y".repeat(500);
    const result = parseEvaluatorOutput(JSON.stringify({
      verdict: "B",
      characteristic: longChar,
      lastChange: longChange
    }));
    expect(result.characteristic!.length).toBeLessThanOrEqual(400);
    expect(result.lastChange!.length).toBeLessThanOrEqual(240);
  });

  it("handles non-string characteristic/lastChange as null", () => {
    const result = parseEvaluatorOutput(JSON.stringify({
      verdict: "A",
      characteristic: 42,
      lastChange: null
    }));
    expect(result.verdict).toBe("A");
    expect(result.characteristic).toBeNull();
    expect(result.lastChange).toBeNull();
  });

  it("falls back to letter parser when no JSON present", () => {
    expect(parseEvaluatorOutput("просто A").verdict).toBe("A");
    expect(parseEvaluatorOutput("итог: V").verdict).toBe("V");
    expect(parseEvaluatorOutput("hello world").verdict).toBe("B");
  });

  it("falls back gracefully on malformed JSON", () => {
    const result = parseEvaluatorOutput("{ verdict: A, oops }");
    // matched a {…} block but failed JSON.parse → letter parser fallback. Contains 'A'.
    expect(["A", "B"]).toContain(result.verdict);
    expect(result.characteristic).toBeNull();
    expect(result.lastChange).toBeNull();
  });
});
