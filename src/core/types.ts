import { z } from "zod";

/**
 * Token usage for a session, segment, or a single transcript entry.
 *
 * `totalTokens` = input + output + cacheRead + cacheWrite. Tokens read from a
 * Claude transcript are EXACT (isEstimated=false); only cost is derived.
 */
export const TokenUsageSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadTokens: z.number().default(0),
  cacheWriteTokens: z.number().default(0),
  totalTokens: z.number(),
  estimatedCostUsd: z.number().optional(),
  model: z.string().optional(),
  /** True if token counts (not cost) are approximate rather than read exactly. */
  isEstimated: z.boolean().default(false),
});
export type TokenUsage = z.infer<typeof TokenUsageSchema>;

export const SegmentStatusSchema = z.enum(["active", "completed"]);
export type SegmentStatus = z.infer<typeof SegmentStatusSchema>;

/**
 * A manually-labeled unit of work inside an agent session. A segment is a
 * labeled time-range; token usage is attributed to it by transcript timestamp.
 */
export const SegmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  startedAt: z.string(), // ISO 8601
  endedAt: z.string().nullable().default(null),
  durationMs: z.number().nullable().default(null),
  /** Computed token delta attributed to this segment (filled at finalize time). */
  delta: TokenUsageSchema.nullable().default(null),
  status: SegmentStatusSchema,
});
export type Segment = z.infer<typeof SegmentSchema>;

export const SessionStatusSchema = z.enum(["running", "completed", "interrupted"]);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const InsightSchema = z.object({
  type: z.string(),
  message: z.string(),
});
export type Insight = z.infer<typeof InsightSchema>;

export const SessionSchema = z.object({
  sessionId: z.string(),
  agent: z.string(),
  command: z.string(),
  args: z.array(z.string()).default([]),
  cwd: z.string(),
  startedAt: z.string(),
  endedAt: z.string().nullable().default(null),
  durationMs: z.number().nullable().default(null),
  status: SessionStatusSchema,
  exitCode: z.number().nullable().default(null),
  /** Path to the agent transcript this session is bound to (Claude JSONL). */
  transcriptPath: z.string().nullable().default(null),
  /** Whether token tracking is available for this session at all. */
  trackingAvailable: z.boolean().default(true),
  total: TokenUsageSchema.nullable().default(null),
  segments: z.array(SegmentSchema).default([]),
  insights: z.array(InsightSchema).default([]),
});
export type Session = z.infer<typeof SessionSchema>;

/** Pointer to the currently-running session, used by sidecar commands. */
export const ActivePointerSchema = z.object({
  sessionId: z.string(),
  sessionFile: z.string(),
  transcriptPath: z.string().nullable(),
  pid: z.number(),
  agent: z.string(),
  startedAt: z.string(),
});
export type ActivePointer = z.infer<typeof ActivePointerSchema>;

/** Pricing for one model, in USD per million tokens. Isolated to cost.ts. */
export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  cacheReadPerMillion?: number;
  cacheWritePerMillion?: number;
}

export const UNSEGMENTED_NAME = "Unsegmented";
