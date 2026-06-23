import { execFileSync } from "child_process";
import * as fs from "fs";
import chalk from "chalk";
import { computeView } from "../core/compute";
import { renderSummaryMarkdown } from "../core/format";
import { repoRoot } from "../core/git";
import { generateInsights } from "../core/insights";
import { lastSummaryPath, latestSession } from "../core/storage";
import { findExecutable } from "../util/which";

export interface ShareOptions {
  /** Post to the current branch's PR via gh instead of just printing. */
  pr?: boolean;
  /** Include cost figures (default true; false drops dollar amounts). */
  cost?: boolean;
}

/** `tokenledger share` — render the latest session as Markdown; optionally post to a PR. */
export function shareCommand(opts: ShareOptions): void {
  const session = latestSession();
  if (!session) {
    console.log("No TokenLedger sessions found. Start one with: tokenledger claude");
    process.exit(1);
  }
  const view = computeView(session);
  const md = renderSummaryMarkdown(
    { ...session, insights: generateInsights(view) },
    view,
    { cost: opts.cost },
  );

  const outPath = lastSummaryPath();
  try {
    fs.writeFileSync(outPath, md + "\n", "utf8");
  } catch {
    /* non-fatal: we still print below */
  }

  if (!opts.pr) {
    console.log(md);
    console.log(chalk.dim(`\nSaved to ${outPath}`));
    return;
  }

  // --pr: post as a PR comment via gh, which infers the PR from the current branch.
  const cwd = session.gitRoot ?? session.cwd;
  const gh = findExecutable("gh");
  if (!gh || !repoRoot(cwd)) {
    const why = !gh ? "gh CLI not found" : "not a git repository";
    console.log(md);
    console.log(chalk.yellow(`\nCould not post to a PR (${why}). Markdown saved to ${outPath}; paste it manually.`));
    process.exit(1);
  }
  try {
    execFileSync(gh, ["pr", "comment", "--body-file", outPath], { cwd, stdio: "inherit" });
    console.log(chalk.green("✓ Posted the summary to this branch's PR."));
  } catch {
    console.log(md);
    console.log(chalk.yellow(`\nCould not post via gh (no open PR for this branch?). Markdown saved to ${outPath}; paste it manually.`));
    process.exit(1);
  }
}
