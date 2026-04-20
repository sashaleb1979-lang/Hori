/**
 * Per-model pricing in USD per 1M tokens.
 * Source: https://platform.openai.com/docs/pricing (as of 2025-07)
 */

export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

const PRICING_TABLE: Record<string, ModelPricing> = {
  "gpt-4o-mini":          { inputPerMillion: 0.15,  outputPerMillion: 0.60 },
  "gpt-5-nano":           { inputPerMillion: 0.10,  outputPerMillion: 0.40 },
  "gpt-5-mini":           { inputPerMillion: 0.30,  outputPerMillion: 1.20 },
  "gpt-5.4-nano":         { inputPerMillion: 0.10,  outputPerMillion: 0.40 },
  "gpt-5.4-mini":         { inputPerMillion: 0.40,  outputPerMillion: 1.60 },
  "text-embedding-3-small": { inputPerMillion: 0.02, outputPerMillion: 0 },
};

const UNKNOWN_MODEL_PRICING: ModelPricing = { inputPerMillion: 1.0, outputPerMillion: 2.0 };

export function getModelPricing(model: string): ModelPricing {
  return PRICING_TABLE[model] ?? UNKNOWN_MODEL_PRICING;
}

export function calculateCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number,
  /** Tokens served from prompt cache; billed at 50% of input rate by OpenAI. */
  cachedTokens = 0,
): number {
  const pricing = getModelPricing(model);
  const nonCachedPrompt = promptTokens - cachedTokens;
  return (
    nonCachedPrompt * pricing.inputPerMillion +
    cachedTokens   * pricing.inputPerMillion * 0.5 +
    completionTokens * pricing.outputPerMillion
  ) / 1_000_000;
}

export interface LlmCostSummary {
  totalCostUsd: number;
  breakdown: Array<{ model: string; promptTokens: number; completionTokens: number; costUsd: number }>;
}

export function summarizeLlmCosts(
  calls: Array<{ model: string; promptTokens: number; completionTokens: number }>,
): LlmCostSummary {
  let totalCostUsd = 0;
  const breakdown: LlmCostSummary["breakdown"] = [];

  for (const call of calls) {
    const costUsd = calculateCostUsd(call.model, call.promptTokens, call.completionTokens);
    totalCostUsd += costUsd;
    breakdown.push({
      model: call.model,
      promptTokens: call.promptTokens,
      completionTokens: call.completionTokens,
      costUsd,
    });
  }

  return { totalCostUsd, breakdown };
}
