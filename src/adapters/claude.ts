import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { AgentAdapter } from "./adapter";

/**
 * Encode an absolute cwd to Claude Code's project-directory name. Claude replaces
 * every non-alphanumeric character with a hyphen, e.g.
 *   /Users/x/arbr.ai  ->  -Users-x-arbr-ai
 */
export function encodeProjectDir(cwd: string): string {
  return cwd.replace(/[^A-Za-z0-9]/g, "-");
}

export const ClaudeAdapter: AgentAdapter = {
  id: "claude",
  displayName: "Claude Code",
  executable: "claude",
  supported: true,
  transcriptExt: ".jsonl",
  transcriptDir(cwd: string): string {
    return path.join(os.homedir(), ".claude", "projects", encodeProjectDir(cwd));
  },
};

/** Snapshot of existing transcript files (basenames) in a directory. */
export function snapshotTranscripts(dir: string, ext: string): Set<string> {
  try {
    return new Set(fs.readdirSync(dir).filter((f) => f.endsWith(ext)));
  } catch {
    return new Set();
  }
}

/**
 * Find the transcript this run is writing to: a file that did not exist at launch
 * (in `before`), or an existing file whose mtime advanced past `sinceMs`. Among
 * candidates, the most recently modified wins. Returns null if none yet.
 */
export function findActiveTranscript(
  dir: string,
  ext: string,
  before: Set<string>,
  sinceMs: number,
): string | null {
  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(ext));
  } catch {
    return null;
  }
  let best: { path: string; mtimeMs: number } | null = null;
  for (const f of files) {
    const full = path.join(dir, f);
    let mtimeMs: number;
    try {
      mtimeMs = fs.statSync(full).mtimeMs;
    } catch {
      continue;
    }
    const isNew = !before.has(f);
    const advanced = mtimeMs >= sinceMs;
    if (!isNew && !advanced) continue;
    if (!best || mtimeMs > best.mtimeMs) best = { path: full, mtimeMs };
  }
  return best?.path ?? null;
}
