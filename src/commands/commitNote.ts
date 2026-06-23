import { computeView, segmentUsageById } from "../core/compute";
import { formatCost, formatDuration, formatTokens } from "../core/format";
import { activeSegment } from "../core/segments";
import {
  isProcessAlive,
  latestSession,
  loadSession,
  readActivePointer,
  sessionPath,
} from "../core/storage";
import { Segment, Session } from "../core/types";

export interface CommitNoteOptions {
  /** Include the cost figure (default true). */
  cost?: boolean;
  /** Only emit when a session is currently running (used by the git hook). */
  ifActive?: boolean;
  /** Suppress the "no session" message (used by the git hook). */
  quiet?: boolean;
}

/**
 * Print a commit-message trailer for the active (or, standalone, the most recent)
 * segment. Output is plain text so a `prepare-commit-msg` hook can append it.
 */
export function commitNoteCommand(opts: CommitNoteOptions): void {
  const active = activeRunningSession();
  const session = active ?? (opts.ifActive ? null : latestSession());
  if (!session) {
    if (!opts.ifActive && !opts.quiet) {
      console.error("No TokenLedger session found.");
      process.exit(1);
    }
    return;
  }

  const seg = (active ? activeSegment(session) : undefined) ?? lastSegment(session);
  if (!seg) return;

  const view = computeView(session);
  const usage = segmentUsageById(view, seg.id)?.usage;
  if (!usage) return;

  const showCost = opts.cost !== false;
  const dur = formatDuration(seg.durationMs);
  const head =
    `TokenLedger: ${formatTokens(usage.totalTokens)} tokens` +
    (showCost ? ` · ${formatCost(usage.estimatedCostUsd)}` : "") +
    (dur ? ` · ${dur}` : "");
  const branch = session.gitBranch ?? seg.gitBranchAtStart;

  const lines = [head, `segment: ${seg.name}`];
  if (branch) lines.push(`branch: ${branch}`);
  console.log(lines.join("\n"));
}

function activeRunningSession(): Session | null {
  const p = readActivePointer();
  if (!p || !isProcessAlive(p.pid)) return null;
  return loadSession(sessionPath(p.sessionId)).session;
}

function lastSegment(s: Session): Segment | undefined {
  return s.segments.length ? s.segments[s.segments.length - 1] : undefined;
}
