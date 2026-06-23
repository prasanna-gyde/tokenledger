import { execFileSync } from "child_process";
import * as path from "path";
import { findExecutable } from "../util/which";

/** Run a git subcommand in `cwd`, returning trimmed stdout or undefined on any failure. */
function git(cwd: string, args: string[]): string | undefined {
  const exe = findExecutable("git");
  if (!exe) return undefined;
  try {
    const out = execFileSync(exe, args, { cwd, stdio: ["ignore", "pipe", "ignore"] });
    const s = out.toString("utf8").trim();
    return s.length ? s : undefined;
  } catch {
    return undefined; // not a repo, detached, git error — all non-fatal here
  }
}

/** Current branch name, or undefined (not a repo / detached HEAD). */
export function currentBranch(cwd: string): string | undefined {
  const b = git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  return b && b !== "HEAD" ? b : undefined;
}

/** Short HEAD sha, or undefined. */
export function headSha(cwd: string): string | undefined {
  return git(cwd, ["rev-parse", "--short", "HEAD"]);
}

/** `origin` remote URL, or undefined. */
export function remoteUrl(cwd: string): string | undefined {
  return git(cwd, ["remote", "get-url", "origin"]);
}

/** Absolute repository root, or undefined when not inside a repo. */
export function repoRoot(cwd: string): string | undefined {
  return git(cwd, ["rev-parse", "--show-toplevel"]);
}

/**
 * Absolute path to this repo's hooks directory (honors worktrees/`core.hooksPath`),
 * or undefined when not in a repo.
 */
export function hooksDir(cwd: string): string | undefined {
  const p = git(cwd, ["rev-parse", "--git-path", "hooks"]);
  return p ? path.resolve(cwd, p) : undefined;
}

/** All git context for a session, captured once at start. */
export interface GitContext {
  branch?: string;
  head?: string;
  remoteUrl?: string;
  root?: string;
}

export function gitContext(cwd: string): GitContext {
  return {
    branch: currentBranch(cwd),
    head: headSha(cwd),
    remoteUrl: remoteUrl(cwd),
    root: repoRoot(cwd),
  };
}

const TICKET_RE = /\b[A-Z][A-Z0-9]+-\d+\b/;

/**
 * Extract an issue id like "PROJ-123" from a segment name first, then the branch
 * (branches often encode it, e.g. "feat/PROJ-123-add-auth"). Undefined if neither has one.
 */
export function parseTicket(segmentName: string, branch?: string): string | undefined {
  return segmentName.match(TICKET_RE)?.[0] ?? branch?.match(TICKET_RE)?.[0] ?? undefined;
}
