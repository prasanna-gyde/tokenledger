import { isProcessAlive, readActivePointer } from "../core/storage";
import { parseTtCommand } from "../core/ttcommand";
import { applyTt } from "./shared";

/** Matches an in-terminal control prompt: "tl start ...", "tl e", "tl usage", etc. */
const TT_RE = /^\/?tl\s+(start|s|end|e|usage|u|summary)\b/i;

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g;

/**
 * Stop a `tl ...` control prompt from reaching the model while showing the user
 * a clean confirmation. We use `UserPromptSubmit` JSON output (`decision: block`)
 * with exit 0 rather than exit 2: exit 2 makes Claude Code render a scary
 * "operation blocked by hook" banner, whereas the JSON path surfaces our `reason`
 * text directly. ANSI color codes are stripped because they don't render here.
 */
function block(reason: string): never {
  process.stdout.write(JSON.stringify({ decision: "block", reason: reason.replace(ANSI_RE, "").trim() }));
  process.exit(0);
}

/**
 * Claude Code `UserPromptSubmit` hook entry point. Reads the hook JSON on stdin;
 * if the prompt is a `tl ...` control command, applies it to the active session
 * and intercepts the prompt (it never reaches the model = 0 tokens). Otherwise
 * exits 0 so the prompt proceeds to Claude untouched.
 */
export function hookCommand(): void {
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (c) => (input += c));
  process.stdin.on("end", () => {
    let prompt = "";
    try {
      prompt = String(JSON.parse(input).prompt ?? "");
    } catch {
      process.exit(0); // not our concern — let Claude handle it
    }
    const trimmed = prompt.trim();
    if (!TT_RE.test(trimmed)) process.exit(0);

    const body = trimmed.replace(/^\/?tl\s+/i, "");
    const cmd = parseTtCommand(body);

    const pointer = readActivePointer();
    if (!pointer || !isProcessAlive(pointer.pid)) {
      block("TokenLedger: no active session. Start one with `tokenledger claude`.");
    }
    block(applyTt(pointer!.sessionId, cmd));
  });
}
