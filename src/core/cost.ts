import { ModelPricing, TokenUsage } from "./types";

/**
 * Model pricing in USD per million tokens.
 *
 * SOURCE: Anthropic published rates (input/output). Cache rates follow the
 * documented multipliers: cache reads ≈ 0.1x input, cache writes ≈ 1.25x input
 * (5-minute TTL — Claude Code's default). These are the rates TokenLedger uses
 * to ESTIMATE cost; token counts themselves are exact (read from the transcript).
 *
 * Keep this table the single source of truth for pricing. Unknown models yield
 * "Cost unavailable" rather than a silent guess.
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  "claude-opus-4-8": { inputPerMillion: 5, outputPerMillion: 25, cacheReadPerMillion: 0.5, cacheWritePerMillion: 6.25 },
  "claude-opus-4-7": { inputPerMillion: 5, outputPerMillion: 25, cacheReadPerMillion: 0.5, cacheWritePerMillion: 6.25 },
  "claude-opus-4-6": { inputPerMillion: 5, outputPerMillion: 25, cacheReadPerMillion: 0.5, cacheWritePerMillion: 6.25 },
  "claude-opus-4-5": { inputPerMillion: 5, outputPerMillion: 25, cacheReadPerMillion: 0.5, cacheWritePerMillion: 6.25 },
  "claude-opus-4-1": { inputPerMillion: 15, outputPerMillion: 75, cacheReadPerMillion: 1.5, cacheWritePerMillion: 18.75 },
  "claude-opus-4-0": { inputPerMillion: 15, outputPerMillion: 75, cacheReadPerMillion: 1.5, cacheWritePerMillion: 18.75 },
  "claude-sonnet-4-6": { inputPerMillion: 3, outputPerMillion: 15, cacheReadPerMillion: 0.3, cacheWritePerMillion: 3.75 },
  "claude-sonnet-4-5": { inputPerMillion: 3, outputPerMillion: 15, cacheReadPerMillion: 0.3, cacheWritePerMillion: 3.75 },
  "claude-haiku-4-5": { inputPerMillion: 1, outputPerMillion: 5, cacheReadPerMillion: 0.1, cacheWritePerMillion: 1.25 },
};

export interface CostResult {
  costUsd: number | null;
  /** Reason cost could not be computed, if costUsd is null. */
  unavailableReason?: string;
}

/** Look up pricing for a model id. Returns null if the model is unknown. */
export function pricingForModel(model: string | undefined): ModelPricing | null {
  if (!model) return null;
  if (MODEL_PRICING[model]) return MODEL_PRICING[model];
  // Tolerate dated/suffixed ids by prefix match (e.g. claude-haiku-4-5-20251001).
  for (const key of Object.keys(MODEL_PRICING)) {
    if (model.startsWith(key)) return MODEL_PRICING[key];
  }
  return null;
}

/**
 * Estimate USD cost for a usage record. Returns null cost (with a reason) when
 * the model is unknown — never a silent guess.
 */
export function estimateCost(
  usage: Pick<TokenUsage, "inputTokens" | "outputTokens" | "cacheReadTokens" | "cacheWriteTokens" | "model">,
): CostResult {
  const pricing = pricingForModel(usage.model);
  if (!pricing) {
    return { costUsd: null, unavailableReason: "model pricing not found" };
  }
  const cost =
    (usage.inputTokens / 1_000_000) * pricing.inputPerMillion +
    (usage.outputTokens / 1_000_000) * pricing.outputPerMillion +
    (usage.cacheReadTokens / 1_000_000) * (pricing.cacheReadPerMillion ?? 0) +
    (usage.cacheWriteTokens / 1_000_000) * (pricing.cacheWritePerMillion ?? 0);
  return { costUsd: cost };
}
