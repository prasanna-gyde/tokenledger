import { isProcessAlive, readActivePointer } from "../core/storage";
import { TtVerb } from "../core/ttcommand";
import { applyTt } from "./shared";

/**
 * Run a sidecar command (start/end/usage/summary) against the currently active
 * session. Coordinates purely through ~/.tokenledger/active.json — no IPC.
 */
export function sidecarCommand(verb: TtVerb, arg: string): void {
  const pointer = readActivePointer();
  if (!pointer || !isProcessAlive(pointer.pid)) {
    console.log("No active TokenLedger session found.\nStart one with: tokenledger claude");
    process.exit(1);
  }
  const out = applyTt(pointer!.sessionId, { verb, arg });
  console.log(out);
}
