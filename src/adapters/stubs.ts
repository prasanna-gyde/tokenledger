import { AgentAdapter } from "./adapter";

/**
 * Future-agent stubs. They conform to the adapter interface so the architecture
 * stays multi-agent, but are not implemented in this release. `run` detects
 * `supported: false` and exits with a clear message rather than launching.
 */
export const CodexAdapter: AgentAdapter = {
  id: "codex",
  displayName: "OpenAI Codex CLI",
  executable: "codex",
  supported: false,
  transcriptExt: ".jsonl",
  transcriptDir(): string | null {
    return null;
  },
};

export const OpenCodeAdapter: AgentAdapter = {
  id: "opencode",
  displayName: "OpenCode",
  executable: "opencode",
  supported: false,
  transcriptExt: ".jsonl",
  transcriptDir(): string | null {
    return null;
  },
};
