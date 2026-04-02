import fs from 'fs-extra';
import path from 'path';
import { AgentConfig, SwarmManifest } from '../types/swarm.js';
import { getAgentDir } from './manifest.js';

/**
 * Build the full prompt for an agent, including role context, task, upstream
 * handoffs, and completion instructions.
 *
 * @param worktreeRoot - the root path of the worktree where the agent is working.
 *   All paths shown to the agent are relative to or inside this directory.
 */
export function buildPrompt(
  agent: AgentConfig,
  manifest: SwarmManifest,
  worktreeRoot: string,
  currentTierNum: number,
  composedRolePrompt: string
): string {
  // ── Collect upstream handoffs ────────────────────────────────
  const previousHandoffs = manifest.tiers
    .filter((t) => t.tier < currentTierNum)
    .flatMap((t) => t.agents.map((a) => ({ ...a, tierNum: t.tier })))
    .map((a) => {
      const handoffPath = path.join(
        getAgentDir(worktreeRoot, manifest.session_id, a.tierNum, a.role),
        'HANDOFF.md'
      );
      if (fs.existsSync(handoffPath)) {
        return `### ${a.role} (Tier ${a.tierNum})\n${fs.readFileSync(handoffPath, 'utf8')}`;
      }
      return null;
    })
    .filter(Boolean)
    .join('\n\n---\n\n');

  // ── Agent directory (where this agent writes its outputs) ────
  const agentDir = getAgentDir(worktreeRoot, manifest.session_id, currentTierNum, agent.role);
  const relativeAgentDir = path.relative(worktreeRoot, agentDir);

  // ── Position context ─────────────────────────────────────────
  const tierAgents = manifest.tiers.find((t) => t.tier === currentTierNum)?.agents ?? [];
  const agentIndex = tierAgents.findIndex((a) => a.role === agent.role);
  const totalInTier = tierAgents.length;
  const totalAgents = manifest.tiers.reduce((sum, t) => sum + t.agents.length, 0);

  // ── Upcoming agents info ─────────────────────────────────────
  const remainingInTier = tierAgents.slice(agentIndex + 1).map((a) => a.role);
  const laterTiers = manifest.tiers.filter((t) => t.tier > currentTierNum);
  const upcomingAgents = [
    ...remainingInTier.map((r) => `${r} (Tier ${currentTierNum}, after you)`),
    ...laterTiers.flatMap((t) => t.agents.map((a) => `${a.role} (Tier ${t.tier})`)),
  ];

  const upcomingSection =
    upcomingAgents.length > 0
      ? `The following agents will run after you and will read your HANDOFF.md:\n${upcomingAgents.map((a) => `  - ${a}`).join('\n')}`
      : 'You are the final agent in this swarm.';

  return `# Swarm Context
You are part of an agent swarm working on a shared codebase.
A human operator is watching your output and may interact with you.
You are working inside a git worktree. All your code changes happen here.

**Swarm:** ${manifest.session_id}
**Your Role:** ${agent.role}
**Position:** Tier ${currentTierNum}, agent ${agentIndex + 1}/${totalInTier} (${totalAgents} agents total)
**Branch:** ${manifest.integration_branch} (already checked out — do not switch branches)
**Working Directory:** ${worktreeRoot}

# Your Role
${composedRolePrompt}

# Task
${manifest.task}

# Context from Previous Agents
${previousHandoffs || '_None — you are the first agent in this swarm._'}

# Who Comes After You
${upcomingSection}

# When You Are Done — Follow These Steps Exactly

## Step 1: Write your handoff file
Create the file \`${relativeAgentDir}/HANDOFF.md\` with this structure:

\`\`\`markdown
# Handoff: ${agent.role}

## Summary
One-paragraph summary of what you accomplished.

## What I Built / Changed
- List every file you created or modified, with a one-line description of each:
  - \`src/foo/bar.ts\` — added the Bar service with X, Y, Z methods
  - \`prisma/schema.prisma\` — added User and Session models

## Key Decisions
- Any design decisions, trade-offs, or assumptions you made.

## API Contracts / Interfaces
- If you defined any APIs, endpoints, types, or interfaces that downstream
  agents need to use, list them here with signatures/schemas.

## Notes for Next Agent
- Anything the next agent should know: things left incomplete,
  potential issues, or setup steps they may need.
\`\`\`

## Step 2: Write your output manifest
Create the file \`${relativeAgentDir}/OUTPUT.md\` — a flat list of every file
you created or modified, one per line:

\`\`\`
src/foo/bar.ts
src/foo/bar.test.ts
prisma/schema.prisma
\`\`\`

## Step 3: Commit your work
Stage and commit all your changes (including the handoff files) to the
current branch (\`${manifest.integration_branch}\`):

\`\`\`bash
git add -A
git commit -m "swarm(${agent.role}): <short description of what you did>"
\`\`\`

Do NOT push. Do NOT switch branches. Just commit locally.

## Step 4: Tell the user you are done
Let the human operator know you have finished and committed your work.
They will review and then advance to the next agent.`;
}
