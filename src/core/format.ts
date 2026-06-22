import chalk from "chalk";
import { ComputedView, SegmentView } from "./compute";
import { Session, TokenUsage } from "./types";

/** Format a token count compactly: 88000 -> "88K", 1240000 -> "1.24M". */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return `${n}`;
}

/** Format USD cost, or a placeholder when pricing is unavailable. */
export function formatCost(costUsd: number | undefined): string {
  if (costUsd === undefined) return "n/a";
  return `$${costUsd.toFixed(2)}`;
}

/** Format a duration in ms as "6m 12s" / "45s". */
export function formatDuration(ms: number | null): string {
  if (ms === null || ms < 0) return "";
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

export function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

/** Per-type token breakdown, e.g. "Input: 41K | Output: 3K | Cache read: 210K | Cache write: 3K". */
export function formatBreakdown(u: TokenUsage): string {
  return (
    `Input: ${formatTokens(u.inputTokens)} | ` +
    `Output: ${formatTokens(u.outputTokens)} | ` +
    `Cache read: ${formatTokens(u.cacheReadTokens)} | ` +
    `Cache write: ${formatTokens(u.cacheWriteTokens)}`
  );
}

/** One-line command reference, shown dimmed as a footer. */
export const COMMAND_HELP = "Commands: tl start <name> · tl end · tl usage · tl summary";

/** Share of a usage record's tokens that are cache reads (0..1). */
export function cacheReadShare(u: TokenUsage): number {
  return u.totalTokens > 0 ? u.cacheReadTokens / u.totalTokens : 0;
}

/**
 * A segment is "cache-heavy" when most of its token volume is reused cached
 * context rather than fresh input/output — high token count, low real cost.
 */
export function isCacheHeavy(u: TokenUsage): boolean {
  return cacheReadShare(u) > 0.7;
}

/**
 * "Fresh" tokens = everything except cache reads (input + output + cache write).
 * Cache reads are reused context, so they inflate total volume without being
 * freshly generated; separating fresh tokens gives a truer cost mental model.
 */
export function freshTokens(u: TokenUsage): number {
  return u.inputTokens + u.outputTokens + u.cacheWriteTokens;
}

/** Headline metric line, e.g. "188K volume | 18K fresh | $0.21". */
export function volumeFreshCost(u: TokenUsage): string {
  return `${formatTokens(u.totalTokens)} volume | ${formatTokens(freshTokens(u))} fresh | ${formatCost(u.estimatedCostUsd)}`;
}

function costLabel(view: ComputedView): string {
  return view.model ? "" : chalk.yellow(" (cost unavailable: model pricing not found)");
}

/** Render the `/tl usage` / `tokenledger usage` view. */
export function renderUsage(view: ComputedView, activeName: string | null): string {
  const lines: string[] = [];
  lines.push(chalk.bold("TokenLedger usage"));
  if (!view.trackingAvailable) {
    lines.push(chalk.yellow("Token usage unavailable for this session."));
    return lines.join("\n");
  }
  lines.push("");
  const active = activeName ? view.segments.find((s) => s.name === activeName) : undefined;
  if (active) {
    const tag = isCacheHeavy(active.usage) ? chalk.cyan(" | cache-heavy") : "";
    lines.push(`Current segment: ${active.name}`);
    lines.push(`${volumeFreshCost(active.usage)}${tag}`);
    lines.push("");
  } else {
    lines.push(chalk.dim("No active segment."));
    lines.push("");
  }
  lines.push(`Session: ${volumeFreshCost(view.total)}${costLabel(view)}`);
  lines.push(chalk.dim(formatBreakdown(view.total)));
  if (view.burnRatePerMin !== null) {
    lines.push(`Burn rate: ${formatTokens(Math.round(view.burnRatePerMin))} tokens/min`);
    lines.push(chalk.dim("(counts input + output + cache read + cache write)"));
  }
  return lines.join("\n");
}

/** Heading shown above each insight, keyed by insight type. */
const INSIGHT_LABELS: Record<string, string> = {
  token_volume: "Token insight:",
  cost: "Cost insight:",
  highest_burn_rate_note: "Trail note:",
  segment_note: "Trail note:",
  debug_note: "Trail note:",
};

/** Render the numbered segment list shared by summary outputs. */
function renderSegmentList(segments: SegmentView[]): string {
  const lines: string[] = [];
  segments.forEach((seg, i) => {
    const dur = formatDuration(seg.durationMs);
    const tag = isCacheHeavy(seg.usage) ? chalk.cyan(" | cache-heavy") : "";
    lines.push(`${i + 1}. ${seg.name}`);
    lines.push(`   ${volumeFreshCost(seg.usage)}${dur ? ` | ${dur}` : ""}${tag}`);
    lines.push(chalk.dim(`   ${formatBreakdown(seg.usage)}`));
  });
  return lines.join("\n");
}

/** Render the full `/tl summary` / final summary view (insights included). */
export function renderSummary(session: Session, view: ComputedView): string {
  const lines: string[] = [];
  lines.push(chalk.bold("TokenLedger summary"));
  lines.push("");
  if (!view.trackingAvailable) {
    lines.push(chalk.yellow("Token usage was unavailable for this session — segments recorded without token data."));
    return lines.join("\n");
  }
  const estLabel = ` ${chalk.dim("(exact tokens, estimated cost)")}`;
  lines.push(`Session total: ${volumeFreshCost(view.total)}${estLabel}${costLabel(view)}`);
  lines.push(chalk.dim(formatBreakdown(view.total)));
  if (view.segments.length) {
    lines.push("");
    lines.push("Segments:");
    lines.push(renderSegmentList(view.segments));
  }
  if (session.insights.length) {
    lines.push("");
    for (const insight of session.insights) {
      const label = INSIGHT_LABELS[insight.type] ?? "Insight:";
      lines.push(chalk.cyan(label));
      lines.push(insight.message);
      lines.push("");
    }
  }
  if (lines[lines.length - 1] !== "") lines.push("");
  lines.push(chalk.dim(COMMAND_HELP));
  return lines.join("\n").trimEnd();
}

// Claude Code wraps an intercepted prompt in an unavoidable "operation blocked
// by hook" banner. We can't remove that line, so TokenLedger-authored messages
// lead with a clear "captured" framing to make the interception read as benign:
// the command was caught by TokenLedger, not rejected as an error.
export function renderSegmentStarted(name: string, _baselineTokens: number | null): string {
  return [
    chalk.green(`✓ Segment started: ${name}`),
    chalk.dim("(captured by TokenLedger • not sent to Claude • 0 tokens)"),
  ].join("\n");
}

export function renderSegmentEnded(seg: SegmentView): string {
  const tag = isCacheHeavy(seg.usage) ? chalk.cyan("  cache-heavy") : "";
  return [
    chalk.green(`✓ Segment ended: ${seg.name}`) + tag,
    chalk.dim("(captured by TokenLedger)"),
    `Token volume: ${formatTokens(seg.usage.totalTokens)}`,
    `Fresh tokens: ${formatTokens(freshTokens(seg.usage))}`,
    `Estimated cost: ${formatCost(seg.usage.estimatedCostUsd)}`,
    `Duration: ${formatDuration(seg.durationMs)}`,
  ].join("\n");
}

export function summarizeUsage(u: TokenUsage): string {
  return `${formatTokens(u.totalTokens)} volume, ${formatCost(u.estimatedCostUsd)}`;
}
