import {
  attributeToSegments,
  dominantModel,
  parseTranscript,
  RawUsage,
  rawTotal,
  sumEntries,
  toTokenUsage,
} from "./tokens";
import { Segment, Session, TokenUsage, UNSEGMENTED_NAME } from "./types";

export interface SegmentView {
  id: string;
  name: string;
  usage: TokenUsage;
  durationMs: number | null;
  status: Segment["status"] | "synthetic";
  /** True for the Unsegmented bucket. */
  isUnsegmented?: boolean;
}

export interface ComputedView {
  total: TokenUsage;
  /** Per-segment usage including the Unsegmented bucket (when non-zero), Unsegmented first. */
  segments: SegmentView[];
  model?: string;
  trackingAvailable: boolean;
  transcriptError?: string;
  /** Session burn rate in tokens/minute, or null if no elapsed time. */
  burnRatePerMin: number | null;
}

/**
 * Derive the token-usage view for a session from its transcript. Pure read: does
 * not mutate the session. Used by the final summary and by sidecar usage/summary.
 */
export function computeView(session: Session, nowMs: number = Date.now()): ComputedView {
  if (!session.trackingAvailable || !session.transcriptPath) {
    return {
      total: toTokenUsage(emptyRaw(), undefined),
      segments: [],
      trackingAvailable: false,
      burnRatePerMin: null,
    };
  }

  const { entries, error } = parseTranscript(session.transcriptPath);
  const model = dominantModel(entries);
  const windowEnd = session.endedAt ? Date.parse(session.endedAt) : nowMs;
  const { perSegment, unsegmented } = attributeToSegments(entries, session.segments, windowEnd);
  const totalRaw = sumEntries(entries);

  const segments: SegmentView[] = [];
  if (rawTotal(unsegmented) > 0) {
    segments.push({
      id: "unsegmented",
      name: UNSEGMENTED_NAME,
      usage: toTokenUsage(unsegmented, model),
      durationMs: null,
      status: "synthetic",
      isUnsegmented: true,
    });
  }
  for (const seg of session.segments) {
    segments.push({
      id: seg.id,
      name: seg.name,
      usage: toTokenUsage(perSegment.get(seg.id) ?? emptyRaw(), model),
      durationMs: seg.durationMs,
      status: seg.status,
    });
  }

  const elapsedMs = windowEnd - Date.parse(session.startedAt);
  const burnRatePerMin = elapsedMs > 0 ? totalRaw && rawTotal(totalRaw) / (elapsedMs / 60000) : null;

  return {
    total: toTokenUsage(totalRaw, model),
    segments,
    model,
    trackingAvailable: true,
    transcriptError: error,
    burnRatePerMin: typeof burnRatePerMin === "number" ? burnRatePerMin : null,
  };
}

function emptyRaw(): RawUsage {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
}

/** Find a single segment's computed usage by id (e.g. the active segment). */
export function segmentUsageById(view: ComputedView, id: string): SegmentView | undefined {
  return view.segments.find((s) => s.id === id);
}
