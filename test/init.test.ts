import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initCommand, isHookInstalled, uninstallCommand } from "../src/commands/init";

let tmp: string;
let prevCwd: string;
let globalPath: string;

function settingsPath(): string {
  return path.join(tmp, ".claude", "settings.local.json");
}

function writeSettings(obj: unknown): void {
  fs.mkdirSync(path.join(tmp, ".claude"), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(obj, null, 2));
}

function writeGlobalSettings(obj: unknown): void {
  fs.writeFileSync(globalPath, JSON.stringify(obj, null, 2));
}

function commands(): string[] {
  const s = JSON.parse(fs.readFileSync(settingsPath(), "utf8"));
  return (s.hooks?.UserPromptSubmit ?? []).flatMap((g: any) => (g.hooks ?? []).map((h: any) => h.command));
}

function group(command: string) {
  return { matcher: "", hooks: [{ type: "command", command }] };
}

describe("init / uninstall hook management", () => {
  beforeEach(() => {
    prevCwd = process.cwd();
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tl-init-"));
    process.chdir(tmp);
    // Point the global-settings lookup at a (by default absent) file inside tmp so tests
    // never read the real ~/.claude/settings.json on the machine running them.
    globalPath = path.join(tmp, "global-settings.json");
    process.env.TOKENLEDGER_GLOBAL_SETTINGS = globalPath;
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    process.chdir(prevCwd);
    delete process.env.TOKENLEDGER_GLOBAL_SETTINGS;
    vi.restoreAllMocks();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("collapses a legacy + current double-hook state into a single current hook", () => {
    writeSettings({ hooks: { UserPromptSubmit: [group("tokentrail hook"), group("tokenledger hook")] } });
    initCommand();
    expect(commands()).toEqual(["tokenledger hook"]);
  });

  it("migrates a lone legacy hook to the current command", () => {
    writeSettings({ hooks: { UserPromptSubmit: [group("tokentrail hook")] } });
    initCommand();
    expect(commands()).toEqual(["tokenledger hook"]);
  });

  it("is idempotent: re-running init on a clean single hook does not duplicate", () => {
    writeSettings({ hooks: { UserPromptSubmit: [group("tokenledger hook")] } });
    initCommand();
    initCommand();
    expect(commands()).toEqual(["tokenledger hook"]);
  });

  it("installs a hook from scratch when none exists", () => {
    initCommand();
    expect(commands()).toEqual(["tokenledger hook"]);
    expect(isHookInstalled(tmp)).toBe(true);
  });

  it("uninstall removes both current and legacy hooks", () => {
    writeSettings({ hooks: { UserPromptSubmit: [group("tokentrail hook"), group("tokenledger hook")] } });
    uninstallCommand();
    expect(isHookInstalled(tmp)).toBe(false);
    const s = JSON.parse(fs.readFileSync(settingsPath(), "utf8"));
    expect(s.hooks?.UserPromptSubmit).toBeUndefined();
  });

  it("preserves unrelated hooks in the same UserPromptSubmit array", () => {
    writeSettings({
      hooks: { UserPromptSubmit: [group("some-other-tool run"), group("tokentrail hook")] },
    });
    initCommand();
    expect(commands()).toEqual(["some-other-tool run", "tokenledger hook"]);
  });

  it("treats a global hook as installed without any project settings", () => {
    writeGlobalSettings({ hooks: { UserPromptSubmit: [group("tokenledger hook")] } });
    expect(isHookInstalled(tmp)).toBe(true);
  });

  it("does not add a project hook when one is already installed globally", () => {
    writeGlobalSettings({ hooks: { UserPromptSubmit: [group("tokenledger hook")] } });
    initCommand();
    // No project-level settings file should be created — global already covers this project.
    expect(fs.existsSync(settingsPath())).toBe(false);
  });

  it("removes a redundant project hook when a global hook exists (would double-fire)", () => {
    writeGlobalSettings({ hooks: { UserPromptSubmit: [group("tokenledger hook")] } });
    writeSettings({ hooks: { UserPromptSubmit: [group("some-other-tool run"), group("tokenledger hook")] } });
    initCommand();
    expect(commands()).toEqual(["some-other-tool run"]);
  });
});
