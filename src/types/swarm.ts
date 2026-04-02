export type AgentStatus = 'pending' | 'running' | 'blocked' | 'done' | 'failed';

export interface AgentConfig {
  role: string;
  worktree_branch: string;
  status: AgentStatus;
}

export interface TierConfig {
  tier: number;
  agents: AgentConfig[];
}

export interface SwarmManifest {
  session_id: string;
  task: string;
  created_at: string;
  integration_branch: string;
  tiers: TierConfig[];
}
