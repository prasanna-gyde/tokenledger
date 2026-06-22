export type AgentId = "claude" | "codex" | "opencode";

/**
 * Per-agent integration surface. Segment tracking is agent-independent (core);
 * only launching and locating token data is adapter-specific.
 */
export interface AgentAdapter {
  id: AgentId;
  displayName: string;
  /** Executable to launch (looked up on PATH). */
  executable: string;
  /** Whether this adapter is implemented in this release. */
  supported: boolean;
  /**
   * Directory where the agent writes per-session transcripts for `cwd`, or null
   * if this agent does not expose local transcripts.
   */
  transcriptDir(cwd: string): string | null;
  /** File extension of transcript files (e.g. ".jsonl"). */
  transcriptExt: string;
}
