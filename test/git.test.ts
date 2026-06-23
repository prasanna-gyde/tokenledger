import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { currentBranch, headSha, repoRoot, parseTicket } from "../src/core/git";
import { SessionSchema } from "../src/core/types";

describe("parseTicket", () => {
  it("prefers a ticket in the segment name", () => {
    expect(parseTicket("PROJ-123 add auth", "feat/OTHER-9")).toBe("PROJ-123");
  });
  it("falls back to the branch", () => {
    expect(parseTicket("add auth", "feature/ABC-42-thing")).toBe("ABC-42");
  });
  it("returns undefined when neither has one", () => {
    expect(parseTicket("just a name", "main")).toBeUndefined();
    expect(parseTicket("lowercase-1")).toBeUndefined();
  });
});

describe("git helpers against a temp repo", () => {
  let dir: string;
  let nonRepo: string;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "tl-git-"));
    nonRepo = fs.mkdtempSync(path.join(os.tmpdir(), "tl-plain-"));
    const run = (args: string[]) => execFileSync("git", args, { cwd: dir, stdio: "ignore" });
    run(["init", "-b", "feat/PROJ-7-demo"]);
    run(["config", "user.email", "t@t.dev"]);
    run(["config", "user.name", "T"]);
    fs.writeFileSync(path.join(dir, "f.txt"), "hi");
    run(["add", "."]);
    run(["commit", "-m", "init"]);
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(nonRepo, { recursive: true, force: true });
  });

  it("reads branch, head and root inside a repo", () => {
    expect(currentBranch(dir)).toBe("feat/PROJ-7-demo");
    expect(headSha(dir)).toMatch(/^[0-9a-f]{7,}$/);
    expect(repoRoot(dir)).toBe(fs.realpathSync(dir));
  });

  it("returns undefined outside a repo", () => {
    expect(currentBranch(nonRepo)).toBeUndefined();
    expect(headSha(nonRepo)).toBeUndefined();
    expect(repoRoot(nonRepo)).toBeUndefined();
  });
});

describe("session schema back-compat", () => {
  it("parses an old session file with no git fields", () => {
    const old = {
      sessionId: "tl_x",
      agent: "claude",
      command: "claude",
      cwd: "/x",
      startedAt: "2026-01-01T00:00:00.000Z",
      status: "completed",
    };
    const res = SessionSchema.safeParse(old);
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.gitBranch).toBeUndefined();
  });
});
