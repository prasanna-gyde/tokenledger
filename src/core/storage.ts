import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { ActivePointer, ActivePointerSchema, Session, SessionSchema } from "./types";

/** Root directory for all TokenLedger local state. */
export function rootDir(): string {
  return path.join(os.homedir(), ".tokenledger");
}

export function sessionsDir(): string {
  return path.join(rootDir(), "sessions");
}

export function sessionPath(sessionId: string): string {
  return path.join(sessionsDir(), `${sessionId}.json`);
}

export function activePointerPath(): string {
  return path.join(rootDir(), "active.json");
}

/** Where `tokenledger share` writes the latest Markdown summary. */
export function lastSummaryPath(): string {
  return path.join(rootDir(), "last-summary.md");
}

/** The most recent session by start time, or null if none. */
export function latestSession(): Session | null {
  const { sessions } = listSessions();
  if (!sessions.length) return null;
  sessions.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  return sessions[0];
}

export function ensureDirs(): void {
  fs.mkdirSync(sessionsDir(), { recursive: true });
}

/** Atomic write: write to a temp file then rename, so readers never see partial JSON. */
export function atomicWriteJson(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, filePath);
}

export function saveSession(session: Session): void {
  atomicWriteJson(sessionPath(session.sessionId), session);
}

export interface LoadResult {
  session: Session | null;
  error?: string;
}

/**
 * Load and validate a session file. Never throws: a missing/corrupt/invalid file
 * returns { session: null, error } so callers can skip it with a warning.
 */
export function loadSession(filePath: string): LoadResult {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (e) {
    return { session: null, error: `could not read ${filePath}` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { session: null, error: `corrupt JSON: ${filePath}` };
  }
  const result = SessionSchema.safeParse(parsed);
  if (!result.success) {
    return { session: null, error: `invalid session schema: ${filePath}` };
  }
  return { session: result.data };
}

export interface ListResult {
  sessions: Session[];
  skipped: string[];
}

/** List all stored sessions, skipping (not crashing on) any corrupt file. */
export function listSessions(): ListResult {
  const dir = sessionsDir();
  const sessions: Session[] = [];
  const skipped: string[] = [];
  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return { sessions, skipped };
  }
  for (const f of files) {
    const { session, error } = loadSession(path.join(dir, f));
    if (session) sessions.push(session);
    else if (error) skipped.push(error);
  }
  return { sessions, skipped };
}

// --- Active session pointer (coordination with sidecar commands) ---

export function writeActivePointer(pointer: ActivePointer): void {
  atomicWriteJson(activePointerPath(), pointer);
}

export function readActivePointer(): ActivePointer | null {
  let raw: string;
  try {
    raw = fs.readFileSync(activePointerPath(), "utf8");
  } catch {
    return null;
  }
  try {
    const parsed = ActivePointerSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function clearActivePointer(): void {
  try {
    fs.unlinkSync(activePointerPath());
  } catch {
    /* already gone */
  }
}

/** True if a process with the given pid is alive (best-effort). */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e: any) {
    return e?.code === "EPERM"; // exists but not ours to signal
  }
}
