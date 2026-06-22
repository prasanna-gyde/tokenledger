import * as fs from "fs";
import * as path from "path";

/**
 * Resolve an executable on PATH (cross-platform-ish). Returns the absolute path
 * or null if not found. Used to give a friendly "CLI not found" error before we
 * attempt to spawn.
 */
export function findExecutable(name: string): string | null {
  // Absolute or explicit relative path: check directly.
  if (name.includes(path.sep)) {
    return isExecutable(name) ? name : null;
  }
  const pathEnv = process.env.PATH ?? "";
  const dirs = pathEnv.split(path.delimiter).filter(Boolean);
  const exts = process.platform === "win32"
    ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";")
    : [""];
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, name + ext);
      if (isExecutable(candidate)) return candidate;
    }
  }
  return null;
}

function isExecutable(p: string): boolean {
  try {
    const stat = fs.statSync(p);
    return stat.isFile();
  } catch {
    return false;
  }
}
