#!/usr/bin/env node
import { adapterIds } from "./adapters/index";
import { hookCommand } from "./commands/hook";
import { initCommand, uninstallCommand } from "./commands/init";
import { lastCommand } from "./commands/last";
import { runCommand } from "./commands/run";
import { sidecarCommand } from "./commands/sidecar";
import { todayCommand } from "./commands/today";

const VERSION = "0.1.0";

const HELP = `TokenLedger — token usage by developer-labeled work segment.

Usage:
  tokenledger init                      Enable in-terminal "tl" commands (one-time, per project)
  tokenledger <agent> [agent args...]   Launch an AI coding agent and track usage
                                       (agents: ${adapterIds().join(", ")}; Claude supported now)
  tokenledger last                      Show the most recent session summary
  tokenledger today                     Show today's total usage
  tokenledger uninstall                 Remove the in-terminal hook from this project
  tokenledger --help | --version

After 'tokenledger init', mark segments by typing in the SAME Claude terminal (no slash):
  tl start fix tests     tl usage     tl end     tl summary

Also available from any terminal (sidecar) while a session runs:
  tokenledger start "fix tests"   tokenledger usage   tokenledger end   tokenledger summary

Agent flags pass through, e.g.:  tokenledger claude --dangerously-skip-permissions`;

function main(): void {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const rest = argv.slice(1);

  if (!cmd || cmd === "-h" || cmd === "--help") {
    console.log(HELP);
    return;
  }
  if (cmd === "-V" || cmd === "--version") {
    console.log(VERSION);
    return;
  }

  if (adapterIds().includes(cmd as any)) {
    // Everything after the agent name passes through to the agent.
    void runCommand(cmd, rest);
    return;
  }

  switch (cmd) {
    case "init":
      initCommand();
      return;
    case "uninstall":
      uninstallCommand();
      return;
    case "hook":
      hookCommand();
      return;
    case "start":
      sidecarCommand("start", rest.join(" "));
      return;
    case "end":
      sidecarCommand("end", "");
      return;
    case "usage":
      sidecarCommand("usage", "");
      return;
    case "summary":
      sidecarCommand("summary", "");
      return;
    case "last":
      lastCommand();
      return;
    case "today":
      todayCommand();
      return;
    default:
      console.error(`Unknown command: ${cmd}\n`);
      console.log(HELP);
      process.exit(1);
  }
}

main();
