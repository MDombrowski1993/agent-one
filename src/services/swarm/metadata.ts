import fs from 'fs-extra';
import path from 'path';
import { SwarmMetadata } from './types.js';

export function getSwarmDir(worktreePath: string, swarmName: string): string {
  return path.join(worktreePath, '.ai', 'swarms', swarmName);
}

export function getMetadataPath(worktreePath: string, swarmName: string): string {
  return path.join(getSwarmDir(worktreePath, swarmName), 'metadata.json');
}

export async function createSwarmMetadata(
  worktreePath: string,
  swarmName: string,
  taskDescription: string,
  roles: string[]
): Promise<void> {
  const swarmDir = getSwarmDir(worktreePath, swarmName);
  await fs.ensureDir(swarmDir);

  const metadata: SwarmMetadata = {
    name: swarmName,
    taskDescription,
    roles,
    createdAt: new Date().toISOString(),
    status: 'in-progress',
    currentRoleIndex: 0,
  };

  const metadataPath = getMetadataPath(worktreePath, swarmName);
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
}

export async function loadSwarmMetadata(
  worktreePath: string,
  swarmName: string
): Promise<SwarmMetadata | null> {
  const metadataPath = getMetadataPath(worktreePath, swarmName);

  if (!(await fs.pathExists(metadataPath))) {
    return null;
  }

  try {
    const data = await fs.readFile(metadataPath, 'utf-8');
    return JSON.parse(data) as SwarmMetadata;
  } catch (error) {
    throw new Error(`Failed to load swarm metadata: ${error}`);
  }
}

export async function updateSwarmStatus(
  worktreePath: string,
  swarmName: string,
  status: SwarmMetadata['status'],
  currentRoleIndex?: number
): Promise<void> {
  const metadata = await loadSwarmMetadata(worktreePath, swarmName);

  if (!metadata) {
    throw new Error(`Swarm metadata not found for: ${swarmName}`);
  }

  metadata.status = status;
  if (currentRoleIndex !== undefined) {
    metadata.currentRoleIndex = currentRoleIndex;
  }

  const metadataPath = getMetadataPath(worktreePath, swarmName);
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
}
