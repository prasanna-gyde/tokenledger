import { describe, it, expect } from "vitest";
import chalk from "chalk";
import { visibleLen, padEndVisible, truncVisible, splitCols, drawCard } from "../src/core/box";

// Force ANSI output so the width logic is actually exercised (chalk auto-disables
// color when stdout is not a TTY, as under the test runner).
chalk.level = 3;

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

describe("width helpers", () => {
  it("visibleLen ignores ANSI codes", () => {
    expect(visibleLen(chalk.red("hello"))).toBe(5);
    expect(visibleLen("plain")).toBe(5);
  });

  it("padEndVisible pads by visible width despite color", () => {
    expect(visibleLen(padEndVisible(chalk.green("hi"), 6))).toBe(6);
  });

  it("truncVisible adds an ellipsis only when over width", () => {
    expect(truncVisible("abcdef", 4)).toBe("abc…");
    expect(truncVisible("ab", 4)).toBe("ab");
  });

  it("splitCols right-aligns the second column within width", () => {
    const r = splitCols(chalk.bold("L"), chalk.dim("R"), 10);
    expect(visibleLen(r)).toBe(10);
    expect(stripAnsi(r).endsWith("R")).toBe(true);
  });
});

describe("drawCard", () => {
  it("keeps every line the same visible width with colored content", () => {
    const out = drawCard([[chalk.bold("Title")], ["a", chalk.cyan("bb")]], { columns: 80 });
    const lines = out.split("\n");
    expect(new Set(lines.map(visibleLen)).size).toBe(1);
    expect(stripAnsi(lines[0]).startsWith("╭")).toBe(true);
    expect(stripAnsi(lines[lines.length - 1]).startsWith("╰")).toBe(true);
  });

  it("draws a divider between groups", () => {
    const out = drawCard([["a"], ["b"]], { columns: 80 });
    expect(stripAnsi(out)).toContain("├");
  });

  it("clamps to the available columns and truncates overflow", () => {
    const out = drawCard([["x".repeat(200)]], { columns: 50 });
    const lines = out.split("\n");
    // inner clamps to columns - 2 = 48, so each line is 48 + 2 borders = 50.
    expect(new Set(lines.map(visibleLen))).toEqual(new Set([50]));
  });
});
