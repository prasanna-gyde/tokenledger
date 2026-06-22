import * as fs from "fs";
import { estimateCost } from "./cost";
import { Segment, TokenUsage } from "./types";

/** Raw token counts (no cost) summed from transcript entries. */
export interface RawUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** One usage-bearing entry from an agent transcript. */
export interface TranscriptEntry {
  tsMs: number;
  usage: RawUsage;
  model?: string;
}

export function emptyRaw(): RawUsage {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
}

export function rawTotal(u: RawUsage): number {
  return u.inputTokens + u.outputTokens + u.cacheReadTokens + u.cacheWriteTokens;
}

function addInto(target: RawUsage, src: RawUsage): void {
  target.inputTokens += src.inputTokens;
  target.outputTokens += src.outputTokens;
  target.cacheReadTokens += src.cacheReadTokens;
  target.cacheWriteTokens += src.cacheWriteTokens;
}

export interface ParseResult {
  entries: TranscriptEntry[];
  error?: string;
}

/**
 * Parse a Claude Code JSONL transcript. Each `assistant` entry carries an exact
 * `message.usage` and a top-level ISO `timestamp`. Malformed lines are skipped,
 * never thrown — a partially-written transcript (live session) parses cleanly.
 */
export function parseTranscript(filePath: string): ParseResult {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return { entries: [], error: `could not read transcript: ${filePath}` };
  }
  const entries: TranscriptEntry[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let obj: any;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      continue; // partial trailing line during a live write
    }
    if (obj?.type !== "assistant") continue;
    const usage = obj?.message?.usage;
    if (!usage) continue;
    const ts = obj?.timestamp;
    const tsMs = ts ? Date.parse(ts) : NaN;
    if (Number.isNaN(tsMs)) continue;
    entries.push({
      tsMs,
      model: obj?.message?.model,
      usage: {
        inputTokens: usage.input_tokens ?? 0,
        outputTokens: usage.output_tokens ?? 0,
        cacheReadTokens: usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
      },
    });
  }
  entries.sort((a, b) => a.tsMs - b.tsMs);
  return { entries };
}

/** The model accounting for the most tokens across the given entries. */
export function dominantModel(entries: TranscriptEntry[]): string | undefined {
  const byModel = new Map<string, number>();
  for (const e of entries) {
    if (!e.model) continue;
    byModel.set(e.model, (byModel.get(e.model) ?? 0) + rawTotal(e.usage));
  }
  let best: string | undefined;
  let bestTokens = -1;
  for (const [model, tokens] of byModel) {
    if (tokens > bestTokens) {
      best = model;
      bestTokens = tokens;
    }
  }
  return best;
}

/** Convert raw token counts + a model into a costed TokenUsage record. */
export function toTokenUsage(raw: RawUsage, model: string | undefined): TokenUsage {
  const totalTokens = rawTotal(raw);
  const { costUsd } = estimateCost({ ...raw, model });
  return {
    ...raw,
    totalTokens,
    model,
    estimatedCostUsd: costUsd ?? undefined,
    isEstimated: false, // token counts are exact; only cost is derived
  };
}

export interface Attribution {
  /** Raw token sums keyed by segment id. */
  perSegment: Map<string, RawUsage>;
  /** Tokens not falling inside any segment window. */
  unsegmented: RawUsage;
}

/**
 * Attribute transcript entries to segments by timestamp. An entry belongs to the
 * first segment whose [startedAt, endedAt) window contains it; entries outside
 * all windows fall to Unsegmented. An active segment (endedAt null) extends to
 * `windowEndMs` (typically the session end / now).
 */
export function attributeToSegments(
  entries: TranscriptEntry[],
  segments: Segment[],
  windowEndMs: number,
): Attribution {
  const perSegment = new Map<string, RawUsage>();
  const unsegmented = emptyRaw();
  for (const seg of segments) perSegment.set(seg.id, emptyRaw());

  const windows = segments.map((seg) => ({
    id: seg.id,
    start: Date.parse(seg.startedAt),
    end: seg.endedAt ? Date.parse(seg.endedAt) : windowEndMs,
  }));

  for (const entry of entries) {
    const win = windows.find((w) => entry.tsMs >= w.start && entry.tsMs < w.end);
    if (win) addInto(perSegment.get(win.id)!, entry.usage);
    else addInto(unsegmented, entry.usage);
  }
  return { perSegment, unsegmented };
}

/** Sum all entries into a single raw usage record. */
export function sumEntries(entries: TranscriptEntry[]): RawUsage {
  const total = emptyRaw();
  for (const e of entries) addInto(total, e.usage);
  return total;
}
