import { spawn } from "child_process";

export interface LaunchResult {
  exitCode: number;
  signalled: boolean;
}

export interface InheritOptions {
  file: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  onSpawn?: (pid: number) => void;
}

/**
 * Launch the agent with fully inherited stdio. This is the default control path:
 * the agent owns the terminal exactly as if run directly (no keyboard-protocol
 * interference), and segment control happens via sidecar commands. Resolves with
 * the agent's exit code when it exits.
 */
export function runInherited(opts: InheritOptions): Promise<LaunchResult> {
  return new Promise((resolve) => {
    const child = spawn(opts.file, opts.args, {
      stdio: "inherit",
      cwd: opts.cwd,
      env: opts.env,
    });
    if (child.pid) opts.onSpawn?.(child.pid);

    // The agent shares our process group and receives terminal signals directly;
    // ignore them in the parent so we survive to finalize on the agent's exit.
    const ignore = () => {};
    process.on("SIGINT", ignore);
    process.on("SIGTERM", ignore);

    const cleanup = () => {
      process.removeListener("SIGINT", ignore);
      process.removeListener("SIGTERM", ignore);
    };

    child.on("error", () => {
      cleanup();
      resolve({ exitCode: 127, signalled: false });
    });
    child.on("exit", (code, signal) => {
      cleanup();
      resolve({ exitCode: code ?? (signal ? 1 : 0), signalled: !!signal });
    });
  });
}
