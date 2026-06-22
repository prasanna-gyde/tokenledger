import { ComputedView } from "./compute";
import { formatCost, formatDuration, formatTokens, isCacheHeavy, pct } from "./format";
import { Insight } from "./types";

const DEBUG_RE = /\b(test|tests|debug|debugging|fix|fixes|fixing|bug|bugs|failing)\b/i;

/**
 * Generate the deterministic insight layer (no LLM). Token volume and cost are
 * kept as SEPARATE concepts: with prompt caching a segment can dominate token
 * volume while being one of the cheapest (cache reads are ~10x cheaper than
 * fresh input), so "most tokens" must never be conflated with "most expensive".
 * Rules:
 *  - token-volume leader + its share of session tokens (cache note when cache-heavy)
 *  - cost leader by estimated USD (separate insight, only when it adds signal)
 *  - unsegmented percentage
 *  - highest token burn-rate segment (when duration data exists)
 *  - debug/test note when the top-volume segment is debugging/test work
 */
export function generateInsights(view: ComputedView): Insight[] {
  const insights: Insight[] = [];
  const total = view.total.totalTokens;
  if (!view.trackingAvailable || total <= 0 || view.segments.length === 0) {
    return insights;
  }

  const ranked = [...view.segments].sort((a, b) => b.usage.totalTokens - a.usage.totalTokens);
  const top = ranked[0];
  const topPct = pct(top.usage.totalTokens, total);

  // Token-volume leader — comparative, so only meaningful with >1 labeled segment.
  // With a single segment it would always read "100%", which is noise.
  const realSegments = view.segments.filter((s) => !s.isUnsegmented);
  if (realSegments.length > 1) {
    const cacheClause = isCacheHeavy(top.usage) ? ", mostly from cache read." : ".";
    insights.push({
      type: "token_volume",
      message:
        topPct >= 40
          ? `“${top.name}” accounted for ${topPct}% of token volume${cacheClause}`
          : `Highest token volume: “${top.name}” at ${topPct}% of session volume${cacheClause}`,
    });

    // Cost leader — a distinct concept. Only emit when pricing is known. When the
    // cost leader differs from the volume leader, this is the key teaching moment.
    const costRanked = realSegments
      .filter((s) => typeof s.usage.estimatedCostUsd === "number")
      .sort((a, b) => (b.usage.estimatedCostUsd ?? 0) - (a.usage.estimatedCostUsd ?? 0));
    const costTop = costRanked[0];
    if (costTop) {
      insights.push({
        type: "cost",
        message: `“${costTop.name}” was the most expensive segment at ${formatCost(costTop.usage.estimatedCostUsd)}.`,
      });
    }
  }

  // Unsegmented percentage.
  const unseg = view.segments.find((s) => s.isUnsegmented);
  if (unseg) {
    const unsegPct = pct(unseg.usage.totalTokens, total);
    if (unsegPct > 25) {
      insights.push({
        type: "unsegmented_high",
        message: `${unsegPct}% of tokens were unsegmented. Use /tl start <task> before each major task to get a cleaner trail.`,
      });
    } else if (unsegPct > 0) {
      insights.push({
        type: "unsegmented",
        message: `${unsegPct}% of this session was unsegmented.`,
      });
    }
  }

  // Burn-rate / segment character note. Comparative language ("highest") is only
  // honest with 2+ labeled segments; with a single segment we describe it instead.
  const withBurn = view.segments
    .filter((s) => s.durationMs && s.durationMs > 0)
    .map((s) => ({ s, burn: s.usage.totalTokens / (s.durationMs! / 60000) }))
    .sort((a, b) => b.burn - a.burn);
  if (realSegments.length >= 2 && withBurn.length > 0) {
    const { s, burn } = withBurn[0];
    const cacheClause = isCacheHeavy(s.usage) ? ", mostly from cache reads." : ".";
    insights.push({
      type: "highest_burn_rate_note",
      message: `“${s.name}” had the highest token burn rate at ${formatTokens(Math.round(burn))} tokens/min${cacheClause}`,
    });
  } else if (realSegments.length === 1) {
    const only = realSegments[0];
    const durTxt = only.durationMs && only.durationMs > 0 ? ` in ${formatDuration(only.durationMs)}` : "";
    const cacheTxt = isCacheHeavy(only.usage)
      ? `, mostly from cache reads (${formatTokens(only.usage.cacheReadTokens)} of ${formatTokens(only.usage.totalTokens)})`
      : "";
    insights.push({
      type: "segment_note",
      message: `“${only.name}” processed ${formatTokens(only.usage.totalTokens)} token volume${durTxt}${cacheTxt}.`,
    });
  }

  // Debug/test note — comparative ("more than implementation"), so 2+ segments only.
  if (realSegments.length >= 2 && !top.isUnsegmented && DEBUG_RE.test(top.name)) {
    insights.push({
      type: "debug_note",
      message: "Debugging/test-fixing consumed more tokens than implementation.",
    });
  }

  return insights;
}
