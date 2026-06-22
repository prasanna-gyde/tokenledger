import chalk from "chalk";
import { computeView } from "../core/compute";
import { renderSummary } from "../core/format";
import { generateInsights } from "../core/insights";
import { listSessions } from "../core/storage";

/** Show the summary for the most recent TokenLedger session. */
export function lastCommand(): void {
  const { sessions, skipped } = listSessions();
  for (const msg of skipped) {
    console.warn(chalk.yellow(`Warning: Could not read one previous TokenLedger session file. Skipping: ${msg}`));
  }
  if (sessions.length === 0) {
    console.log("No TokenLedger sessions found. Start one with: tokenledger claude");
    return;
  }
  sessions.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  const session = sessions[0];
  const view = computeView(session);
  console.log(renderSummary({ ...session, insights: generateInsights(view) }, view));
}
