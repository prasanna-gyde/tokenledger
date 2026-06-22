import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterAll, describe, expect, it } from "vitest";
import {
  attributeToSegments,
  parseTranscript,
  rawTotal,
  sumEntries,
  toTokenUsage,
  TranscriptEntry,
} from "../src/core/tokens";
import { Segment } from "../src/core/types";

function entry(tsMs: number, input: number, output = 0, cacheRead = 0, cacheWrite = 0): TranscriptEntry {
  return {
    tsMs,
    model: "claude-opus-4-8",
    usage: { inputTokens: input, outputTokens: output, cacheReadTokens: cacheRead, cacheWriteTokens: cacheWrite },
  };
}

function seg(id: string, name: string, start: string, end: string | null): Segment {
  return {
    id,
    name,
    startedAt: start,
    endedAt: end,
    durationMs: null,
    delta: null,
    status: end ? "completed" : "active",
  };
}

const T = (iso: string) => Date.parse(iso);

describe("attributeToSegments", () => {
  it("buckets entries by timestamp, with leftovers to Unsegmented", () => {
    const segments = [
      seg("seg_001", "a", "2026-01-01T00:01:00Z", "2026-01-01T00:02:00Z"),
      seg("seg_002", "b", "2026-01-01T00:02:00Z", null), // active -> windowEnd
    ];
    const windowEnd = T("2026-01-01T00:05:00Z");
    const entries = [
      entry(T("2026-01-01T00:00:30Z"), 100), // before any segment -> unsegmented
      entry(T("2026-01-01T00:01:30Z"), 200), // seg_001
      entry(T("2026-01-01T00:02:30Z"), 300), // seg_002
      entry(T("2026-01-01T00:04:00Z"), 400), // seg_002
    ];
    const { perSegment, unsegmented } = attributeToSegments(entries, segments, windowEnd);
    expect(rawTotal(perSegment.get("seg_001")!)).toBe(200);
    expect(rawTotal(perSegment.get("seg_002")!)).toBe(700);
    expect(rawTotal(unsegmented)).toBe(100);
  });

  it("sends everything to Unsegmented when no segments exist", () => {
    const entries = [entry(T("2026-01-01T00:00:30Z"), 100), entry(T("2026-01-01T00:01:30Z"), 50)];
    const { unsegmented } = attributeToSegments(entries, [], T("2026-01-01T01:00:00Z"));
    expect(rawTotal(unsegmented)).toBe(150);
  });
});

describe("toTokenUsage", () => {
  it("computes total and marks token counts exact", () => {
    const u = toTokenUsage(
      { inputTokens: 100, outputTokens: 50, cacheReadTokens: 20, cacheWriteTokens: 10 },
      "claude-opus-4-8",
    );
    expect(u.totalTokens).toBe(180);
    expect(u.isEstimated).toBe(false);
    expect(u.estimatedCostUsd).toBeGreaterThan(0);
  });
});

describe("parseTranscript", () => {
  const file = path.join(os.tmpdir(), `tl-fixture-${process.pid}.jsonl`);
  const lines = [
    JSON.stringify({ type: "user", message: { content: "hi" } }),
    JSON.stringify({
      type: "assistant",
      timestamp: "2026-01-01T00:01:30.000Z",
      message: { model: "claude-opus-4-8", usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 5, cache_creation_input_tokens: 3 } },
    }),
    "{ this is not valid json",
    JSON.stringify({
      type: "assistant",
      timestamp: "2026-01-01T00:02:30.000Z",
      message: { model: "claude-opus-4-8", usage: { input_tokens: 200, output_tokens: 40 } },
    }),
  ];
  fs.writeFileSync(file, lines.join("\n") + "\n");
  afterAll(() => fs.rmSync(file, { force: true }));

  it("reads assistant usage entries and skips other/malformed lines", () => {
    const { entries } = parseTranscript(file);
    expect(entries).toHaveLength(2);
    const total = sumEntries(entries);
    expect(total.inputTokens).toBe(300);
    expect(total.outputTokens).toBe(60);
    expect(total.cacheReadTokens).toBe(5);
    expect(total.cacheWriteTokens).toBe(3);
    expect(rawTotal(total)).toBe(368);
  });

  it("returns an error (not a throw) for a missing file", () => {
    const { entries, error } = parseTranscript("/no/such/transcript.jsonl");
    expect(entries).toEqual([]);
    expect(error).toBeTruthy();
  });
});
