import { describe, expect, it } from "vitest";
import { ComputedView, SegmentView } from "../src/core/compute";
import { generateInsights } from "../src/core/insights";
import { TokenUsage } from "../src/core/types";

function usage(total: number): TokenUsage {
  return {
    inputTokens: total,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: total,
    estimatedCostUsd: total / 1000,
    model: "claude-opus-4-8",
    isEstimated: false,
  };
}

function segView(id: string, name: string, total: number, durationMs: number | null, isUnsegmented = false): SegmentView {
  return { id, name, usage: usage(total), durationMs, status: isUnsegmented ? "synthetic" : "completed", isUnsegmented };
}

/** Build a segment with explicit per-type tokens and cost (for volume-vs-cost tests). */
function customSeg(
  id: string,
  name: string,
  u: Partial<TokenUsage> & { totalTokens: number },
  durationMs: number | null,
): SegmentView {
  const full: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    estimatedCostUsd: 0,
    model: "claude-opus-4-8",
    isEstimated: false,
    ...u,
  };
  return { id, name, usage: full, durationMs, status: "completed" };
}

function viewOf(total: TokenUsage, segments: SegmentView[]): ComputedView {
  return { total, segments, model: "claude-opus-4-8", trackingAvailable: true, burnRatePerMin: null };
}

function view(segments: SegmentView[]): ComputedView {
  const total = segments.reduce((n, s) => n + s.usage.totalTokens, 0);
  return {
    total: usage(total),
    segments,
    model: "claude-opus-4-8",
    trackingAvailable: true,
    burnRatePerMin: null,
  };
}

describe("generateInsights", () => {
  it("flags the token-volume leader using >40% of session tokens", () => {
    const v = view([segView("seg_001", "remove GPT-4o", 100, 60_000), segView("seg_002", "implement feature", 600, 120_000)]);
    const insights = generateInsights(v);
    const top = insights.find((i) => i.type === "token_volume");
    expect(top?.message).toContain("implement feature");
    expect(top?.message).toContain("token volume");
    expect(top?.message).toContain("86%"); // 600/700 ≈ 85.7% -> 86%
  });

  it("splits token volume from cost when they diverge (cache-heavy segment)", () => {
    // "npm package" has the most tokens but is almost all cache read (cheap).
    // "learn arbr" has fewer tokens but a higher real cost.
    const npmSeg = customSeg("seg_002", "npm package", { totalTokens: 123_000, inputTokens: 10, outputTokens: 637, cacheReadTokens: 122_000, estimatedCostUsd: 0.08 }, 43_000);
    const learnSeg = customSeg("seg_001", "learn arbr", { totalTokens: 70_000, inputTokens: 4_000, outputTokens: 579, cacheReadTokens: 57_000, cacheWriteTokens: 9_000, estimatedCostUsd: 0.12 }, 66_000);
    const total = customSeg("t", "t", { totalTokens: 193_000, estimatedCostUsd: 0.2 }, null).usage;
    const insights = generateInsights(viewOf(total, [npmSeg, learnSeg]));

    const tokenIns = insights.find((i) => i.type === "token_volume");
    const costIns = insights.find((i) => i.type === "cost");
    expect(tokenIns?.message).toContain("npm package");
    expect(tokenIns?.message).toContain("mostly from cache read");
    expect(costIns?.message).toContain("learn arbr");
    expect(costIns?.message).toContain("$0.12");
    // Burn-rate note flags the cache-heavy leader rather than implying expensive waste.
    const burn = insights.find((i) => i.type === "highest_burn_rate_note");
    expect(burn?.message).toContain("token burn rate");
    expect(burn?.message).toContain("mostly from cache reads");
  });

  it("emits the unsegmented nudge above 25%", () => {
    const v = view([
      segView("unsegmented", "Unsegmented", 300, null, true),
      segView("seg_001", "build", 700, 60_000),
    ]);
    const insights = generateInsights(v);
    expect(insights.find((i) => i.type === "unsegmented_high")?.message).toContain("30%");
  });

  it("adds a debug/test note when the top segment is test-fixing", () => {
    const v = view([segView("seg_001", "implement", 200, 60_000), segView("seg_002", "fix tests", 800, 60_000)]);
    const insights = generateInsights(v);
    expect(insights.some((i) => i.type === "debug_note")).toBe(true);
  });

  it("reports a comparative burn-rate note with 2+ segments", () => {
    const v = view([segView("seg_001", "plan", 200, 30_000), segView("seg_002", "explore codebase", 880, 20_000)]);
    const insights = generateInsights(v);
    expect(insights.some((i) => i.type === "highest_burn_rate_note")).toBe(true);
  });

  it("uses descriptive, non-comparative wording for a single-segment session", () => {
    const v = view([segView("seg_001", "learn arbr", 257_000, 69_000)]);
    const insights = generateInsights(v);
    // No comparative insights at all.
    expect(insights.some((i) => i.type === "token_volume")).toBe(false);
    expect(insights.some((i) => i.type === "cost")).toBe(false);
    expect(insights.some((i) => i.type === "highest_burn_rate_note")).toBe(false);
    // A descriptive segment note replaces them.
    const note = insights.find((i) => i.type === "segment_note");
    expect(note?.message).toContain("learn arbr");
    expect(note?.message).not.toMatch(/highest|most expensive|% of/i);
  });

  it("notes the cache-heavy character of a single segment", () => {
    const seg = customSeg("seg_001", "learn arbr", { totalTokens: 94_000, inputTokens: 6_000, outputTokens: 1_000, cacheReadTokens: 75_000, cacheWriteTokens: 12_000, estimatedCostUsd: 0.17 }, 27_000);
    const total = customSeg("t", "t", { totalTokens: 94_000, estimatedCostUsd: 0.17 }, null).usage;
    const note = generateInsights(viewOf(total, [seg])).find((i) => i.type === "segment_note");
    expect(note?.message).toContain("mostly from cache reads");
    expect(note?.message).toContain("75K of 94K");
    expect(note?.message).toContain("in 27s");
  });

  it("emits volume and cost insights when a second labeled segment exists, even with unsegmented", () => {
    const v = view([
      segView("unsegmented", "Unsegmented", 50, null, true),
      segView("seg_001", "explore", 100, 60_000),
      segView("seg_002", "implement", 600, 120_000),
    ]);
    const insights = generateInsights(v);
    expect(insights.some((i) => i.type === "token_volume")).toBe(true);
    expect(insights.some((i) => i.type === "cost")).toBe(true);
  });

  it("returns nothing when there is no usage", () => {
    expect(generateInsights(view([]))).toEqual([]);
  });
});
