export type TtVerb = "start" | "end" | "usage" | "summary" | "unknown";

export interface TtCommand {
  verb: TtVerb;
  arg: string;
}

/**
 * Parse an in-session command line. Accepts the full line including the leading
 * "/tl" (the line parser captures that). Supports shorthands s/e/u.
 *   "/tl start fix tests" -> { verb: "start", arg: "fix tests" }
 *   "/tl e"               -> { verb: "end", arg: "" }
 */
export function parseTtCommand(raw: string): TtCommand {
  let body = raw.trim();
  if (body.startsWith("/tl")) body = body.slice(3).trim();
  if (!body) return { verb: "unknown", arg: "" };
  const spaceIdx = body.indexOf(" ");
  const head = (spaceIdx === -1 ? body : body.slice(0, spaceIdx)).toLowerCase();
  const arg = spaceIdx === -1 ? "" : body.slice(spaceIdx + 1).trim();
  const verb = mapVerb(head);
  return { verb, arg };
}

function mapVerb(head: string): TtVerb {
  switch (head) {
    case "start":
    case "s":
      return "start";
    case "end":
    case "e":
      return "end";
    case "usage":
    case "u":
      return "usage";
    case "summary":
      return "summary";
    default:
      return "unknown";
  }
}
