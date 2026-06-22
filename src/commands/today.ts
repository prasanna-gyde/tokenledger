import chalk from "chalk";
import { computeView } from "../core/compute";
import { formatCost, formatTokens, freshTokens } from "../core/format";
import { listSessions } from "../core/storage";

function sameLocalDay(iso: string, ref: Date): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  );
}

/** Aggregate token usage and cost across all of today's sessions. */
export function todayCommand(): void {
  const { sessions, skipped } = listSessions();
  for (const msg of skipped) {
    console.warn(chalk.yellow(`Warning: Could not read one previous TokenLedger session file. Skipping: ${msg}`));
  }
  const ref = new Date();
  const todays = sessions.filter((s) => sameLocalDay(s.startedAt, ref));

  let totalVolume = 0;
  let totalFresh = 0;
  let totalCost = 0;
  let costKnown = true;
  for (const s of todays) {
    // Recompute from the transcript when available; fall back to stored totals.
    const view = computeView(s);
    const total = view.trackingAvailable ? view.total : s.total;
    if (!total) continue;
    totalVolume += total.totalTokens;
    totalFresh += freshTokens(total);
    if (total.estimatedCostUsd === undefined) costKnown = false;
    else totalCost += total.estimatedCostUsd;
  }

  console.log(chalk.bold("TokenLedger today"));
  console.log("");
  console.log(`Sessions: ${todays.length}`);
  console.log(
    `Total: ${formatTokens(totalVolume)} volume | ${formatTokens(totalFresh)} fresh | ${costKnown ? formatCost(totalCost) : "cost partially unavailable"}`,
  );
}
