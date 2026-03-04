import fs from 'fs-extra';
import path from 'path';
import { getSwarmDir } from './metadata.js';
import { Handoff } from './types.js';

export function getHandoffPath(
  worktreePath: string,
  swarmName: string,
  roleName: string
): string {
  return path.join(getSwarmDir(worktreePath, swarmName), `handoff-${roleName}.md`);
}

export async function loadPreviousHandoffs(
  worktreePath: string,
  swarmName: string,
  currentRoleName: string,
  allRoles: string[]
): Promise<string> {
  const swarmDir = getSwarmDir(worktreePath, swarmName);

  if (!(await fs.pathExists(swarmDir))) {
    return 'No previous handoffs.';
  }

  const handoffs: Handoff[] = [];
  const currentRoleIndex = allRoles.indexOf(currentRoleName);

  // Load all handoffs from previous roles
  for (let i = 0; i < currentRoleIndex; i++) {
    const roleName = allRoles[i];
    const handoffPath = getHandoffPath(worktreePath, swarmName, roleName);

    if (await fs.pathExists(handoffPath)) {
      try {
        const content = await fs.readFile(handoffPath, 'utf-8');
        const stats = await fs.stat(handoffPath);
        handoffs.push({
          roleName,
          content,
          timestamp: stats.mtime.toISOString(),
        });
      } catch (error) {
        console.warn(`Warning: Could not read handoff from ${roleName}: ${error}`);
      }
    }
  }

  if (handoffs.length === 0) {
    return 'No previous handoffs.';
  }

  // Format handoffs as markdown
  return handoffs
    .map(
      (h) => `---
## Handoff from: ${h.roleName}
**Completed at:** ${new Date(h.timestamp).toLocaleString()}

${h.content}
`
    )
    .join('\n');
}

export async function createHandoffTemplate(
  worktreePath: string,
  swarmName: string,
  roleName: string
): Promise<string> {
  const handoffPath = getHandoffPath(worktreePath, swarmName, roleName);

  const template = `# Handoff from: ${roleName}

## What I Completed
-

## Artifacts Created
-

## Notes for Next Agent
-
`;

  await fs.writeFile(handoffPath, template, 'utf-8');
  return handoffPath;
}
