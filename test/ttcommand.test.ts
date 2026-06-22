import { describe, expect, it } from "vitest";
import { parseTtCommand } from "../src/core/ttcommand";

describe("parseTtCommand", () => {
  it("parses start with a multi-word name", () => {
    expect(parseTtCommand("/tl start fix tests")).toEqual({ verb: "start", arg: "fix tests" });
  });
  it("parses shorthand s", () => {
    expect(parseTtCommand("/tl s remove GPT-4o")).toEqual({ verb: "start", arg: "remove GPT-4o" });
  });
  it("parses end and shorthand e", () => {
    expect(parseTtCommand("/tl end")).toEqual({ verb: "end", arg: "" });
    expect(parseTtCommand("/tl e")).toEqual({ verb: "end", arg: "" });
  });
  it("parses usage and summary", () => {
    expect(parseTtCommand("/tl usage").verb).toBe("usage");
    expect(parseTtCommand("/tl summary").verb).toBe("summary");
  });
  it("works without the /tl prefix (sidecar style)", () => {
    expect(parseTtCommand("start fix login")).toEqual({ verb: "start", arg: "fix login" });
  });
  it("returns unknown for unrecognized verbs", () => {
    expect(parseTtCommand("/tl frobnicate").verb).toBe("unknown");
  });
});
