import { computeView, segmentUsageById } from "../core/compute";
import {
  formatCost,
  formatTokens,
  renderSegmentEnded,
  renderSegmentStarted,
  renderSummary,
  renderUsage,
} from "../core/format";
import { currentBranch, headSha, parseTicket } from "../core/git";
import { generateInsights } from "../core/insights";
import { activeSegment, endSegment, startSegment } from "../core/segments";
import { loadSession, saveSession } from "../core/storage";
import { TtCommand } from "../core/ttcommand";
import { Segment, Session } from "../core/types";

/** Build a session id like tl_20260622_153000 from a Date (local time). */
export function newSessionId(now: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `tl_${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}` +
    `_${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`
  );
}

/**
 * Load the session file, apply a mutation, and atomically save. This is the
 * single serialization point shared by the running process and sidecar commands,
 * so segment edits from either never clobber each other.
 */
export function mutateSessionFile(sessionId: string, fn: (s: Session) => void): Session | null {
  const { session } = loadSession(sessionPathFor(sessionId));
  if (!session) return null;
  fn(session);
  saveSession(session);
  return session;
}

function sessionPathFor(sessionId: string): string {
  // Imported lazily to keep this module free of a hard storage path dependency.
  return require("../core/storage").sessionPath(sessionId);
}

/**
 * Apply an in-session/sidecar command to a session and return rendered output.
 * Shared by the UserPromptSubmit hook (`tl ...`) and sidecar subcommands.
 */
export function applyTt(sessionId: string, cmd: TtCommand): string {
  switch (cmd.verb) {
    case "start":
      return doStart(sessionId, cmd.arg);
    case "end":
      return doEnd(sessionId);
    case "usage":
      return doUsage(sessionId);
    case "summary":
      return doSummary(sessionId);
    default:
      return "TokenLedger: unrecognized command.\nCommands: tl start <name> · tl end · tl usage · tl summary";
  }
}

function doStart(sessionId: string, name: string): string {
  if (!name.trim()) return "Usage: /tl start <segment name>";
  let closedId: string | undefined;
  const updated = mutateSessionFile(sessionId, (s) => {
    const res = startSegment(s, name);
    closedId = res.closedPrevious?.id;
    if (res.deduped) return;
    const cwd = s.gitRoot ?? s.cwd;
    const head = headSha(cwd);
    if (res.closedPrevious) res.closedPrevious.gitHeadAtEnd = head;
    res.started.gitBranchAtStart = currentBranch(cwd);
    res.started.gitHeadAtStart = head;
    res.started.ticket = parseTicket(res.started.name, res.started.gitBranchAtStart);
  });
  if (!updated) return notFound();

  const view = computeView(updated);
  const lines: string[] = [];
  if (closedId) {
    const closed = segmentUsageById(view, closedId);
    if (closed) {
      lines.push("Previous segment closed:");
      lines.push(`${closed.name}, ${formatTokens(closed.usage.totalTokens)} volume, ${formatCost(closed.usage.estimatedCostUsd)}`);
      lines.push("");
    }
  }
  const baseline = view.trackingAvailable ? view.total.totalTokens : null;
  lines.push(renderSegmentStarted(name.trim(), baseline));
  return lines.join("\n");
}

function doEnd(sessionId: string): string {
  let endedSeg: Segment | null = null;
  const updated = mutateSessionFile(sessionId, (s) => {
    endedSeg = endSegment(s);
    if (endedSeg) (endedSeg as Segment).gitHeadAtEnd = headSha(s.gitRoot ?? s.cwd);
  });
  if (!updated) return notFound();
  if (!endedSeg) return "No active segment to end.";
  const view = computeView(updated);
  const seg = segmentUsageById(view, (endedSeg as Segment).id);
  if (!seg) return "Segment ended.";
  return renderSegmentEnded(seg);
}

function doUsage(sessionId: string): string {
  const { session } = loadSession(sessionPathFor(sessionId));
  if (!session) return notFound();
  const view = computeView(session);
  const active = activeSegment(session);
  return renderUsage(view, active?.name ?? null);
}

function doSummary(sessionId: string): string {
  const { session } = loadSession(sessionPathFor(sessionId));
  if (!session) return notFound();
  const view = computeView(session);
  const withInsights: Session = { ...session, insights: generateInsights(view) };
  return renderSummary(withInsights, view);
}

function notFound(): string {
  return "No active TokenLedger session found.\nStart one with: tokenledger claude";
}
