import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { initGitCommand, uninstallGitCommand } from "../src/commands/gitHook";

const HOOK = ".git/hooks/prepare-commit-msg";
const LOCAL = ".git/hooks/prepare-commit-msg.local";

describe("init-git / uninstall-git", () => {
  let dir: string;
  let prevCwd: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "tl-hook-"));
    execFileSync("git", ["init"], { cwd: dir, stdio: "ignore" });
    prevCwd = process.cwd();
    process.chdir(dir);
  });

  afterEach(() => {
    process.chdir(prevCwd);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("installs a hook with our marker and removes it cleanly", () => {
    initGitCommand();
    const installed = fs.readFileSync(path.join(dir, HOOK), "utf8");
    expect(installed).toContain("tokenledger:prepare-commit-msg");
    expect(installed).toContain("commit-note --if-active");

    uninstallGitCommand();
    expect(fs.existsSync(path.join(dir, HOOK))).toBe(false);
  });

  it("preserves a pre-existing hook and restores it on uninstall", () => {
    const original = "#!/bin/sh\necho mine\n";
    fs.writeFileSync(path.join(dir, HOOK), original, "utf8");

    initGitCommand();
    expect(fs.readFileSync(path.join(dir, LOCAL), "utf8")).toBe(original);
    expect(fs.readFileSync(path.join(dir, HOOK), "utf8")).toContain("tokenledger:prepare-commit-msg");

    uninstallGitCommand();
    expect(fs.readFileSync(path.join(dir, HOOK), "utf8")).toBe(original);
    expect(fs.existsSync(path.join(dir, LOCAL))).toBe(false);
  });

  it("is idempotent on a second install", () => {
    initGitCommand();
    initGitCommand(); // should not wrap or duplicate
    const installed = fs.readFileSync(path.join(dir, HOOK), "utf8");
    expect(installed.match(/tokenledger:prepare-commit-msg/g)?.length).toBe(1);
  });
});
