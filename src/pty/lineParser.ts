export interface ParserHandlers {
  /** Send bytes onward to the agent (pty). */
  forward: (data: string) => void;
  /** Echo locally to the user's terminal (the agent never sees these). */
  echo: (data: string) => void;
  /** A complete in-session command line was captured (full "/tl ..." text). */
  command: (raw: string) => void;
}

const PREFIX = "/tl";

/**
 * Keystroke state machine that intercepts `/tl ...` lines without disturbing the
 * agent's terminal. Strategy: at the start of a line, HOLD keystrokes (without
 * echo or forwarding) while they remain a prefix of "/tl". If the line diverges,
 * flush the held bytes to the agent (a tiny delay on the first chars, no
 * duplication). If it reaches "/tl " it's a command: echo locally, capture to
 * Enter, and never forward to the agent.
 */
export function createLineParser(h: ParserHandlers) {
  type Mode = "maybe" | "capture" | "pass";
  let mode: Mode = "maybe";
  let buf = "";

  function isPrintable(code: number): boolean {
    return code >= 0x20 && code !== 0x7f;
  }

  function feed(chunk: string): void {
    for (const ch of chunk) {
      const code = ch.codePointAt(0)!;

      // Enter (raw terminals send CR).
      if (ch === "\r" || ch === "\n") {
        if (mode === "capture") {
          h.echo("\r\n");
          h.command(buf);
          buf = "";
          mode = "maybe";
        } else {
          if (buf) {
            h.forward(buf);
            buf = "";
          }
          h.forward(ch);
          mode = "maybe";
        }
        continue;
      }

      // Backspace / delete.
      if (code === 0x7f || code === 0x08) {
        if (mode === "capture") {
          if (buf.length > 0) {
            buf = buf.slice(0, -1);
            h.echo("\b \b");
          }
          if (!buf.startsWith(PREFIX)) {
            if (buf) h.forward(buf);
            buf = "";
            mode = "pass";
          }
        } else if (mode === "maybe") {
          if (buf.length > 0) buf = buf.slice(0, -1);
          else h.forward(ch);
        } else {
          h.forward(ch);
        }
        continue;
      }

      // Printable characters.
      if (isPrintable(code)) {
        if (mode === "pass") {
          h.forward(ch);
          continue;
        }
        if (mode === "capture") {
          buf += ch;
          h.echo(ch);
          continue;
        }
        // maybe
        const cand = buf + ch;
        if (PREFIX.startsWith(cand)) {
          buf = cand; // still a prefix of "/tl" — keep holding
        } else if (cand.startsWith(PREFIX + " ")) {
          mode = "capture";
          buf = cand;
          h.echo(buf); // reveal the held prefix + this char
        } else {
          h.forward(cand); // diverged — not a /tl command
          buf = "";
          mode = "pass";
        }
        continue;
      }

      // Other control bytes (ESC sequences, Ctrl+C, Tab, ...).
      if (mode === "maybe" && buf) {
        h.forward(buf);
        buf = "";
        h.forward(ch);
        mode = "pass";
      } else {
        h.forward(ch);
      }
    }
  }

  return { feed };
}
