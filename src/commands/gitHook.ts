import chalk from "chalk";
import * as fs from "fs";
import * as path from "path";
import { hooksDir, repoRoot } from "../core/git";

const HOOK_NAME = "prepare-commit-msg";
const LOCAL = "prepare-commit-msg.local";
const MARKER = "# tokenledger:prepare-commit-msg";

/**
 * The installed hook: append the trailer only when a session is active, then chain
 * to any pre-existing hook we displaced at install time.
 */
function hookScript(): string {
  return [
    "#!/bin/sh",
    `${MARKER} (managed by 'tokenledger init-git'; remove with 'tokenledger uninstall-git')`,
    'note="$(tokenledger commit-note --if-active --quiet 2>/dev/null)"',
    // Append only output that is actually our trailer, so a version mismatch or
    // stray stdout can never pollute the commit message.
    'case "$note" in TokenLedger:*) printf \'\\n%s\\n\' "$note" >> "$1" ;; esac',
    'dir="$(dirname "$0")"',
    // Chain a displaced hook, propagating its exit code so it can still abort the
    // commit. Otherwise exit 0 — a missing chain must not fail prepare-commit-msg.
    `if [ -x "$dir/${LOCAL}" ]; then "$dir/${LOCAL}" "$@"; exit $?; fi`,
    "exit 0",
    "",
  ].join("\n");
}

export function initGitCommand(): void {
  const cwd = process.cwd();
  const dir = hooksDir(cwd);
  if (!dir || !repoRoot(cwd)) {
    console.error("Not a git repository. Run `tokenledger init-git` inside a repo.");
    process.exit(1);
  }
  fs.mkdirSync(dir, { recursive: true });
  const hookPath = path.join(dir, HOOK_NAME);

  if (fs.existsSync(hookPath)) {
    if (fs.readFileSync(hookPath, "utf8").includes(MARKER)) {
      console.log("TokenLedger commit trailer is already installed.");
      return;
    }
    // Preserve a pre-existing hook and chain to it from ours.
    const localPath = path.join(dir, LOCAL);
    fs.renameSync(hookPath, localPath);
    fs.chmodSync(localPath, 0o755);
    console.log(chalk.dim(`Preserved your existing ${HOOK_NAME} hook as ${LOCAL} (it still runs).`));
  }

  fs.writeFileSync(hookPath, hookScript(), "utf8");
  fs.chmodSync(hookPath, 0o755);
  console.log(chalk.green("Enabled the TokenLedger commit trailer."));
  console.log("Commits made during an active `tokenledger` session get a cost trailer in the message.");
  console.log(chalk.dim("Remove with `tokenledger uninstall-git`."));
}

export function uninstallGitCommand(): void {
  const cwd = process.cwd();
  const dir = hooksDir(cwd);
  if (!dir) {
    console.error("Not a git repository.");
    process.exit(1);
  }
  const hookPath = path.join(dir, HOOK_NAME);
  if (!fs.existsSync(hookPath) || !fs.readFileSync(hookPath, "utf8").includes(MARKER)) {
    console.log("No TokenLedger commit trailer installed.");
    return;
  }
  const localPath = path.join(dir, LOCAL);
  if (fs.existsSync(localPath)) {
    fs.renameSync(localPath, hookPath); // restore the hook we displaced
    fs.chmodSync(hookPath, 0o755);
    console.log("Removed the TokenLedger commit trailer and restored your previous hook.");
  } else {
    fs.unlinkSync(hookPath);
    console.log("Removed the TokenLedger commit trailer.");
  }
}
