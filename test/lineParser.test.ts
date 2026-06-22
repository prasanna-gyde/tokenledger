import { describe, expect, it } from "vitest";
import { createLineParser } from "../src/pty/lineParser";

const CR = "\r";
const ESC = "\x1b";
const BS = "\x7f";

function harness() {
  const fwd: string[] = [];
  const echo: string[] = [];
  const cmds: string[] = [];
  const p = createLineParser({
    forward: (d) => fwd.push(d),
    echo: (d) => echo.push(d),
    command: (r) => cmds.push(r),
  });
  return {
    feed: (s: string) => p.feed(s),
    fwd: () => fwd.join(""),
    echo: () => echo.join(""),
    cmds,
  };
}

describe("lineParser /tl interception", () => {
  it("captures a full /tl command and never forwards it to the agent", () => {
    const h = harness();
    h.feed("/tl start fix tests" + CR);
    expect(h.cmds).toEqual(["/tl start fix tests"]);
    expect(h.fwd()).toBe("");
    expect(h.echo()).toContain("/tl start fix tests");
  });

  it("captures shorthand /tl e", () => {
    const h = harness();
    h.feed("/tl e" + CR);
    expect(h.cmds).toEqual(["/tl e"]);
    expect(h.fwd()).toBe("");
  });

  it("forwards a non-tl slash command intact (e.g. /help)", () => {
    const h = harness();
    h.feed("/help" + CR);
    expect(h.cmds).toEqual([]);
    expect(h.fwd()).toBe("/help" + CR);
  });

  it("forwards ordinary input intact", () => {
    const h = harness();
    h.feed("hello world" + CR);
    expect(h.cmds).toEqual([]);
    expect(h.fwd()).toBe("hello world" + CR);
  });

  it("treats bare /tl + Enter as passthrough (no subcommand)", () => {
    const h = harness();
    h.feed("/tl" + CR);
    expect(h.cmds).toEqual([]);
    expect(h.fwd()).toBe("/tl" + CR);
  });

  it("flushes a divergent prefix like /ta", () => {
    const h = harness();
    h.feed("/ta" + CR);
    expect(h.cmds).toEqual([]);
    expect(h.fwd()).toBe("/ta" + CR);
  });

  it("handles backspace within a captured command", () => {
    const h = harness();
    h.feed("/tl usagx" + BS + "e" + CR);
    expect(h.cmds).toEqual(["/tl usage"]);
    expect(h.fwd()).toBe("");
  });

  it("processes a command fed across multiple chunks", () => {
    const h = harness();
    h.feed("/t");
    h.feed("l en");
    h.feed("d" + CR);
    expect(h.cmds).toEqual(["/tl end"]);
    expect(h.fwd()).toBe("");
  });

  it("forwards an escape sequence after holding a prefix", () => {
    const h = harness();
    h.feed("/t" + ESC + "[A");
    expect(h.cmds).toEqual([]);
    expect(h.fwd()).toContain("/t");
    expect(h.fwd()).toContain("[A");
  });
});
