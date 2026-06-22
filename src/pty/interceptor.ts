import * as pty from "node-pty";
import { createLineParser } from "./lineParser";

export interface PtyOptions {
  file: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  /** Whether to intercept /tl commands from stdin (true when stdin is a TTY). */
  interactive: boolean;
  /** Called with the raw "/tl ..." line when a command is captured. */
  onCommand: (raw: string) => void;
  /** Called once with the child pid right after spawn. */
  onSpawn?: (pid: number) => void;
}

export interface PtyResult {
  exitCode: number;
  signalled: boolean;
}

/**
 * Launch the agent inside a pseudo-terminal, preserving native terminal behavior
 * (colors, prompts, resize, Ctrl+C), while intercepting `/tl` command lines from
 * stdin. Resolves with the child's exit code when it exits.
 */
export function runWithPty(opts: PtyOptions): Promise<PtyResult> {
  return new Promise((resolve) => {
    const cols = process.stdout.columns || 80;
    const rows = process.stdout.rows || 24;

    const child = pty.spawn(opts.file, opts.args, {
      name: process.env.TERM || "xterm-256color",
      cols,
      rows,
      cwd: opts.cwd,
      env: opts.env as { [key: string]: string },
    });
    opts.onSpawn?.(child.pid);

    child.onData((data) => process.stdout.write(data));

    const parser = createLineParser({
      forward: (d) => child.write(d),
      echo: (d) => process.stdout.write(d),
      command: (raw) => {
        try {
          opts.onCommand(raw);
        } catch {
          /* never let a command handler crash the session */
        }
      },
    });

    const onStdin = (chunk: Buffer) => {
      const s = chunk.toString("utf8");
      if (opts.interactive) parser.feed(s);
      else child.write(s);
    };

    const stdin = process.stdin;
    const wasRaw = stdin.isTTY ? stdin.isRaw : false;
    if (stdin.isTTY && opts.interactive) stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onStdin);

    const onResize = () => {
      try {
        child.resize(process.stdout.columns || 80, process.stdout.rows || 24);
      } catch {
        /* child may have exited */
      }
    };
    process.stdout.on("resize", onResize);

    // Forward termination signals to the child; finalize happens on its exit.
    const forwardSignal = (sig: NodeJS.Signals) => () => {
      try {
        child.kill(sig);
      } catch {
        /* already gone */
      }
    };
    const onSigInt = forwardSignal("SIGINT");
    const onSigTerm = forwardSignal("SIGTERM");
    process.on("SIGINT", onSigInt);
    process.on("SIGTERM", onSigTerm);

    let done = false;
    child.onExit(({ exitCode, signal }) => {
      if (done) return;
      done = true;
      stdin.removeListener("data", onStdin);
      if (stdin.isTTY) {
        try {
          stdin.setRawMode(wasRaw);
        } catch {
          /* noop */
        }
      }
      stdin.pause();
      process.stdout.removeListener("resize", onResize);
      process.removeListener("SIGINT", onSigInt);
      process.removeListener("SIGTERM", onSigTerm);
      resolve({ exitCode, signalled: !!signal });
    });
  });
}
