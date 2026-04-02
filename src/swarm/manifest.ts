import fs from 'fs-extra';
import path from 'path';
import { SwarmManifest, TierConfig, AgentStatus } from '../types/swarm.js';

/**
 * Generate a session ID from the task string and current timestamp.
 * Format: <task-slug>-<YYYYMMdd-HHmmss>
 */
export function generateSessionId(task: string): string {
  const slug = task
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

  const now = new Date();
  const timestamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '-',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');

  return `${slug}-${timestamp}`;
}

/**
 * Convert tier selections from the wizard into a SwarmManifest.
 */
export function tiersToManifest(
  tiers: string[][],
  task: string,
  sessionId: string
): SwarmManifest {
  return {
    session_id: sessionId,
    task,
    created_at: new Date().toISOString(),
    integration_branch: `swarm/${sessionId}/integration`,
    tiers: tiers.map((roles, i) => ({
      tier: i + 1,
      agents: roles.map((role) => ({
        role,
        worktree_branch: `swarm/${sessionId}/t${i + 1}-${role}`,
        status: 'pending' as AgentStatus,
      })),
    })),
  };
}

/**
 * Get the swarm base directory for a session.
 */
export function getSwarmDir(projectRoot: string, sessionId: string): string {
  return path.join(projectRoot, 'swarm', sessionId);
}

/**
 * Get the agent directory within the swarm for a specific tier/role.
 */
export function getAgentDir(
  projectRoot: string,
  sessionId: string,
  tierNum: number,
  role: string
): string {
  return path.join(getSwarmDir(projectRoot, sessionId), `tier-${tierNum}`, `agent-${role}`);
}

/**
 * Save the manifest to disk and create all tier/agent subdirectories.
 */
export async function saveManifest(
  projectRoot: string,
  manifest: SwarmManifest
): Promise<void> {
  const swarmDir = getSwarmDir(projectRoot, manifest.session_id);
  await fs.ensureDir(swarmDir);

  // Create tier/agent directories and initial STATUS.md files
  for (const tier of manifest.tiers) {
    for (const agent of tier.agents) {
      const agentDir = getAgentDir(projectRoot, manifest.session_id, tier.tier, agent.role);
      await fs.ensureDir(agentDir);
      await fs.writeFile(path.join(agentDir, 'STATUS.md'), 'pending', 'utf-8');
    }
  }

  // Write manifest.json
  const manifestPath = path.join(swarmDir, 'manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
}

/**
 * Load and validate a manifest from a file path.
 */
export async function loadManifest(manifestPath: string): Promise<SwarmManifest> {
  if (!(await fs.pathExists(manifestPath))) {
    throw new Error(`Manifest not found at: ${manifestPath}`);
  }

  const data = await fs.readFile(manifestPath, 'utf-8');
  const manifest = JSON.parse(data) as SwarmManifest;

  validateManifest(manifest);
  return manifest;
}

/**
 * Validate that a manifest has the required structure.
 */
export function validateManifest(manifest: SwarmManifest): void {
  if (!manifest.session_id) throw new Error('Manifest missing session_id');
  if (!manifest.task) throw new Error('Manifest missing task');
  if (!manifest.integration_branch) throw new Error('Manifest missing integration_branch');
  if (!Array.isArray(manifest.tiers) || manifest.tiers.length === 0) {
    throw new Error('Manifest must have at least one tier');
  }

  const seenRoles = new Set<string>();
  for (const tier of manifest.tiers) {
    if (!Array.isArray(tier.agents) || tier.agents.length === 0) {
      throw new Error(`Tier ${tier.tier} must have at least one agent`);
    }
    for (const agent of tier.agents) {
      if (!agent.role) throw new Error(`Agent in tier ${tier.tier} missing role`);
      if (seenRoles.has(agent.role)) {
        throw new Error(`Duplicate role "${agent.role}" across tiers`);
      }
      seenRoles.add(agent.role);
    }
  }
}

/**
 * Update a specific agent's status in the manifest on disk.
 */
export async function updateManifestAgentStatus(
  projectRoot: string,
  sessionId: string,
  role: string,
  status: AgentStatus
): Promise<void> {
  const manifestPath = path.join(getSwarmDir(projectRoot, sessionId), 'manifest.json');
  const manifest = await loadManifest(manifestPath);

  for (const tier of manifest.tiers) {
    for (const agent of tier.agents) {
      if (agent.role === role) {
        agent.status = status;
      }
    }
  }

  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
}
