import { describe, expect, it } from "vitest";
import { estimateCost, pricingForModel } from "../src/core/cost";

describe("cost", () => {
  it("prices a known model exactly", () => {
    const { costUsd } = estimateCost({
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      model: "claude-opus-4-8",
    });
    expect(costUsd).toBeCloseTo(5, 6);
  });

  it("sums all token classes", () => {
    const { costUsd } = estimateCost({
      inputTokens: 1_000_000, // $5
      outputTokens: 1_000_000, // $25
      cacheReadTokens: 1_000_000, // $0.50
      cacheWriteTokens: 1_000_000, // $6.25
      model: "claude-opus-4-8",
    });
    expect(costUsd).toBeCloseTo(36.75, 6);
  });

  it("resolves dated model ids by prefix", () => {
    expect(pricingForModel("claude-haiku-4-5-20251001")).not.toBeNull();
  });

  it("returns null with a reason for unknown models", () => {
    const res = estimateCost({
      inputTokens: 100,
      outputTokens: 100,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      model: "some-future-model",
    });
    expect(res.costUsd).toBeNull();
    expect(res.unavailableReason).toMatch(/pricing/);
  });
});
