import { Segment, Session } from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

export function activeSegment(session: Session): Segment | undefined {
  return session.segments.find((s) => s.status === "active");
}

function nextSegmentId(session: Session): string {
  const n = session.segments.length + 1;
  return `seg_${String(n).padStart(3, "0")}`;
}

export interface StartResult {
  closedPrevious?: Segment;
  started: Segment;
  /** True when the start was a duplicate of the active segment and was ignored. */
  deduped?: boolean;
}

/**
 * Window within which an identical `start` is treated as a re-fire of the same
 * command rather than a deliberate restart. Two interception paths (the
 * UserPromptSubmit hook and the PTY interceptor — or two registered hooks) can
 * each process the same `tl start` line, which would otherwise create a phantom
 * zero-token, zero-duration segment that is instantly closed by the second start.
 */
const DEDUP_WINDOW_MS = 2_000;

/**
 * Start a new segment. If one is already active it is closed first (so users
 * never have to type `end` between tasks). Pure: records timestamps only — token
 * deltas are computed later from the transcript.
 *
 * Idempotent against immediate duplicates: if a segment with the same name is
 * already active and was started within DEDUP_WINDOW_MS, the call is a no-op and
 * returns the existing active segment (deduped: true). This prevents the phantom
 * segment a double-processed `tl start` would otherwise leave behind.
 */
export function startSegment(session: Session, name: string, at: string = nowIso()): StartResult {
  const trimmed = name.trim();
  const active = activeSegment(session);
  if (
    active &&
    active.name === trimmed &&
    Date.parse(at) - Date.parse(active.startedAt) <= DEDUP_WINDOW_MS
  ) {
    return { started: active, deduped: true };
  }

  const closedPrevious = endSegment(session, at) ?? undefined;
  const started: Segment = {
    id: nextSegmentId(session),
    name: trimmed,
    startedAt: at,
    endedAt: null,
    durationMs: null,
    delta: null,
    status: "active",
  };
  session.segments.push(started);
  return { closedPrevious, started };
}

/** Close the active segment, if any. Returns the closed segment or null. */
export function endSegment(session: Session, at: string = nowIso()): Segment | null {
  const seg = activeSegment(session);
  if (!seg) return null;
  seg.endedAt = at;
  seg.durationMs = Date.parse(at) - Date.parse(seg.startedAt);
  seg.status = "completed";
  return seg;
}
