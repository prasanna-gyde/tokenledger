import { describe, expect, it } from "vitest";
import { activeSegment, endSegment, startSegment } from "../src/core/segments";
import { Session } from "../src/core/types";

function blankSession(): Session {
  return {
    sessionId: "tl_test",
    agent: "claude",
    command: "claude",
    args: [],
    cwd: "/tmp",
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: null,
    durationMs: null,
    status: "running",
    exitCode: null,
    transcriptPath: null,
    trackingAvailable: true,
    total: null,
    segments: [],
    insights: [],
  };
}

describe("segment engine", () => {
  it("starts a segment as active", () => {
    const s = blankSession();
    const { started } = startSegment(s, "remove GPT-4o", "2026-01-01T00:01:00.000Z");
    expect(started.status).toBe("active");
    expect(activeSegment(s)?.name).toBe("remove GPT-4o");
    expect(s.segments).toHaveLength(1);
  });

  it("auto-closes the previous segment when a new one starts", () => {
    const s = blankSession();
    startSegment(s, "a", "2026-01-01T00:00:00.000Z");
    const { closedPrevious, started } = startSegment(s, "b", "2026-01-01T00:00:10.000Z");
    expect(closedPrevious?.name).toBe("a");
    expect(closedPrevious?.status).toBe("completed");
    expect(closedPrevious?.durationMs).toBe(10_000);
    expect(started.name).toBe("b");
    expect(s.segments.filter((x) => x.status === "active")).toHaveLength(1);
  });

  it("ignores a duplicate start of the active segment within the dedup window", () => {
    const s = blankSession();
    startSegment(s, "pull changes on gcp", "2026-01-01T00:00:00.000Z");
    const { started, closedPrevious, deduped } = startSegment(
      s,
      "pull changes on gcp",
      "2026-01-01T00:00:00.500Z",
    );
    expect(deduped).toBe(true);
    expect(closedPrevious).toBeUndefined();
    expect(s.segments).toHaveLength(1);
    expect(started.id).toBe("seg_001");
    expect(activeSegment(s)?.status).toBe("active");
  });

  it("treats a same-name start after the dedup window as a real restart", () => {
    const s = blankSession();
    startSegment(s, "fix tests", "2026-01-01T00:00:00.000Z");
    const { deduped, closedPrevious } = startSegment(s, "fix tests", "2026-01-01T00:00:30.000Z");
    expect(deduped).toBeUndefined();
    expect(closedPrevious?.id).toBe("seg_001");
    expect(s.segments).toHaveLength(2);
  });

  it("ends the active segment and records duration", () => {
    const s = blankSession();
    startSegment(s, "a", "2026-01-01T00:00:00.000Z");
    const closed = endSegment(s, "2026-01-01T00:06:12.000Z");
    expect(closed?.status).toBe("completed");
    expect(closed?.durationMs).toBe(372_000);
    expect(activeSegment(s)).toBeUndefined();
  });

  it("returns null when ending with no active segment", () => {
    const s = blankSession();
    expect(endSegment(s)).toBeNull();
  });
});
