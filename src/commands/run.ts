import chalk from "chalk";
import { findActiveTranscript, snapshotTranscripts } from "../adapters/claude";
import { getAdapter } from "../adapters/index";
import { computeView } from "../core/compute";
import { renderSummary } from "../core/format";
import { gitContext, headSha } from "../core/git";
import { generateInsights } from "../core/insights";
import { endSegment } from "../core/segments";
import {
  clearActivePointer,
  ensureDirs,
  saveSession,
  sessionPath,
  writeActivePointer,
} from "../core/storage";
import { Session } from "../core/types";
import { runInherited } from "../launch/launchInherit";
import { isHookInstalled } from "./init";
import { mutateSessionFile, newSessionId } from "./shared";

export async function runCommand(agentId: string, passArgs: string[]): Promise<void> {
  const adapter = getAdapter(agentId);
  if (!adapter) {
    console.error(`Unknown agent: ${agentId}. Supported: claude`);
    process.exit(1);
  }
  if (!adapter.supported) {
    console.error(`tokenledger ${agentId} is not supported yet — this release supports Claude only.`);
    process.exit(1);
  }

  const { findExecutable } = require("../util/which");
  const exe = findExecutable(adapter.executable);
  if (!exe) {
    console.error(
      `Error: ${adapter.executable} CLI not found.\n` +
        `Install ${adapter.displayName} or make sure \`${adapter.executable}\` is available in PATH.`,
    );
    process.exit(1);
  }

  ensureDirs();
  const cwd = process.cwd();
  const startDate = new Date();
  const git = gitContext(cwd);
  const session: Session = {
    sessionId: newSessionId(startDate),
    agent: adapter.id,
    command: adapter.executable,
    args: passArgs,
    cwd,
    startedAt: startDate.toISOString(),
    endedAt: null,
    durationMs: null,
    status: "running",
    exitCode: null,
    transcriptPath: null,
    trackingAvailable: true,
    total: null,
    segments: [],
    insights: [],
    gitBranch: git.branch,
    gitHeadAtStart: git.head,
    gitRemoteUrl: git.remoteUrl,
    gitRoot: git.root,
  };
  saveSession(session);
  writeActivePointer({
    sessionId: session.sessionId,
    sessionFile: sessionPath(session.sessionId),
    transcriptPath: null,
    pid: process.pid,
    agent: adapter.id,
    startedAt: session.startedAt,
  });

  const hookOn = adapter.id === "claude" && isHookInstalled(cwd);
  console.log(chalk.bold("TokenLedger started"));
  console.log(`Tracking ${adapter.displayName} token usage by segment.`);
  if (hookOn) {
    console.log("\nMark work segments by typing in this terminal (no slash):");
    console.log("  tl start fix tests     tl usage     tl end     tl summary");
  } else {
    console.log(chalk.dim("\nTip: run `tokenledger init` once to mark segments by typing `tl start ...` here."));
    console.log(chalk.dim('Or from any terminal: tokenledger start "fix tests" / usage / end / summary'));
  }
  console.log(`\nStarting ${adapter.displayName}...\n`);

  // Locate the transcript this run writes to, then bind the session to it.
  const dir = adapter.transcriptDir(cwd);
  let poll: NodeJS.Timeout | null = null;
  if (dir) {
    const before = snapshotTranscripts(dir, adapter.transcriptExt);
    const launchMs = Date.now();
    poll = setInterval(() => {
      const found = findActiveTranscript(dir, adapter.transcriptExt, before, launchMs);
      if (found) {
        mutateSessionFile(session.sessionId, (s) => {
          s.transcriptPath = found;
        });
        writeActivePointer({
          sessionId: session.sessionId,
          sessionFile: sessionPath(session.sessionId),
          transcriptPath: found,
          pid: process.pid,
          agent: adapter.id,
          startedAt: session.startedAt,
        });
        if (poll) {
          clearInterval(poll);
          poll = null;
        }
      }
    }, 2000);
  } else {
    mutateSessionFile(session.sessionId, (s) => {
      s.trackingAvailable = false;
    });
  }

  const result = await runInherited({ file: exe, args: passArgs, cwd, env: process.env });

  if (poll) clearInterval(poll);

  const status = result.signalled ? "interrupted" : "completed";
  const final = finalizeSession(session.sessionId, result.exitCode, status);

  if (final) {
    console.log("\n" + renderSummary(final, computeView(final)));
  }
  clearActivePointer();
  process.exit(result.exitCode);
}

/** Close any active segment, compute totals/deltas/insights, persist, return session. */
export function finalizeSession(
  sessionId: string,
  exitCode: number,
  status: Session["status"],
): Session | null {
  return mutateSessionFile(sessionId, (s) => {
    const endIso = new Date().toISOString();
    const closed = endSegment(s, endIso);
    if (closed) closed.gitHeadAtEnd = headSha(s.gitRoot ?? s.cwd);
    s.endedAt = endIso;
    s.durationMs = Date.parse(endIso) - Date.parse(s.startedAt);
    s.status = status;
    s.exitCode = exitCode;
    if (!s.transcriptPath) s.trackingAvailable = false;

    const view = computeView(s, Date.parse(endIso));
    s.total = view.total;
    for (const seg of s.segments) {
      const sv = view.segments.find((v) => v.id === seg.id);
      if (sv) seg.delta = sv.usage;
    }
    s.insights = generateInsights(view);
  });
}
