import chalk from "chalk";
import * as fs from "fs";
import * as path from "path";

const HOOK_COMMAND = "tokenledger hook";

/**
 * Command fragments that identify a hook as ours, including legacy names from
 * before the package was renamed. Detection and removal must recognize ALL of
 * these: a fresh `init` that only matched the current name once appended a second
 * group alongside a stale `tokentrail hook` entry, leaving two hooks that both
 * fired on every prompt (the phantom-segment bug).
 */
const HOOK_COMMAND_MATCHERS = ["tokenledger hook", "tokentrail hook"];

function settingsLocalPath(cwd: string): string {
  return path.join(cwd, ".claude", "settings.local.json");
}

function readJson(file: string): any {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function isOurHookCommand(command: unknown): boolean {
  return typeof command === "string" && HOOK_COMMAND_MATCHERS.some((m) => command.includes(m));
}

function groupHasOurHook(g: any): boolean {
  return Array.isArray(g?.hooks) && g.hooks.some((h: any) => isOurHookCommand(h?.command));
}

function hooksHaveTokenLedger(settings: any): boolean {
  const groups = settings?.hooks?.UserPromptSubmit;
  if (!Array.isArray(groups)) return false;
  return groups.some(groupHasOurHook);
}

/** True if a group is ours but uses a legacy (non-current) command string. */
function groupIsStale(g: any): boolean {
  return (
    Array.isArray(g?.hooks) &&
    g.hooks.some((h: any) => isOurHookCommand(h?.command) && !String(h?.command).includes(HOOK_COMMAND))
  );
}

/** True if a TokenLedger UserPromptSubmit hook is installed for this project. */
export function isHookInstalled(cwd: string): boolean {
  for (const f of [path.join(cwd, ".claude", "settings.local.json"), path.join(cwd, ".claude", "settings.json")]) {
    if (fs.existsSync(f) && hooksHaveTokenLedger(readJson(f))) return true;
  }
  return false;
}

/**
 * Install the in-terminal control hook into the project's local Claude settings
 * (`.claude/settings.local.json`, which Claude Code gitignores). After this, the
 * user can type `tl start ...` directly in the Claude terminal.
 */
export function initCommand(): void {
  const cwd = process.cwd();
  const file = settingsLocalPath(cwd);
  const settings = readJson(file);
  settings.hooks = settings.hooks ?? {};
  let groups: any[] = (settings.hooks.UserPromptSubmit = settings.hooks.UserPromptSubmit ?? []);

  // Drop any stale/legacy groups (e.g. a pre-rename `tokentrail hook`) so we never
  // leave two of our hooks firing side by side.
  const staleCount = groups.filter(groupIsStale).length;
  if (staleCount > 0) {
    groups = settings.hooks.UserPromptSubmit = groups.filter((g) => !groupIsStale(g));
  }

  const alreadyCurrent = groups.some(
    (g) => Array.isArray(g?.hooks) && g.hooks.some((h: any) => String(h?.command).includes(HOOK_COMMAND)),
  );

  if (alreadyCurrent && staleCount === 0) {
    console.log("TokenLedger in-terminal commands are already enabled for this project.");
    printUsage();
    return;
  }

  if (!alreadyCurrent) {
    groups.push({ matcher: "", hooks: [{ type: "command", command: HOOK_COMMAND }] });
  }

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(settings, null, 2) + "\n", "utf8");

  if (staleCount > 0) {
    console.log(chalk.green(`Migrated TokenLedger hook (removed ${staleCount} stale entry/entries).`));
  } else {
    console.log(chalk.green("Enabled TokenLedger in-terminal commands."));
  }
  console.log(`Updated the UserPromptSubmit hook in ${path.relative(cwd, file)}.`);
  printUsage();
  console.log(chalk.dim("\nRemove it by deleting that hook entry from the file, or run `tokenledger uninstall`."));
}

/** Remove the TokenLedger hook from the project's local Claude settings. */
export function uninstallCommand(): void {
  const cwd = process.cwd();
  const file = settingsLocalPath(cwd);
  if (!fs.existsSync(file)) {
    console.log("Nothing to remove.");
    return;
  }
  const settings = readJson(file);
  const groups = settings?.hooks?.UserPromptSubmit;
  if (Array.isArray(groups)) {
    settings.hooks.UserPromptSubmit = groups.filter((g: any) => !groupHasOurHook(g));
    if (settings.hooks.UserPromptSubmit.length === 0) delete settings.hooks.UserPromptSubmit;
    fs.writeFileSync(file, JSON.stringify(settings, null, 2) + "\n", "utf8");
  }
  console.log("Removed TokenLedger in-terminal commands.");
}

function printUsage(): void {
  console.log("\nIn the Claude terminal, type (no slash):");
  console.log("  tl start fix tests     tl usage     tl end     tl summary");
}
