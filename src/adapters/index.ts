import { AgentAdapter, AgentId } from "./adapter";
import { ClaudeAdapter } from "./claude";
import { CodexAdapter, OpenCodeAdapter } from "./stubs";

const REGISTRY: Record<AgentId, AgentAdapter> = {
  claude: ClaudeAdapter,
  codex: CodexAdapter,
  opencode: OpenCodeAdapter,
};

export function getAdapter(id: string): AgentAdapter | undefined {
  return REGISTRY[id as AgentId];
}

export function adapterIds(): AgentId[] {
  return Object.keys(REGISTRY) as AgentId[];
}

export { AgentAdapter, AgentId };
