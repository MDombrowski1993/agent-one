import simpleGit from 'simple-git';
import path from 'path';
import { Config } from '../config/types.js';

/**
 * Get the worktree path for a swarm session, using the configured sessionsBase.
 * Mirrors the existing session path convention: <sessionsBase>/<projectName>/<sessionId>
 */
export function getSwarmWorktreePath(config: Config, sessionId: string): string {
  const projectName = path.basename(config.projectRoot);
  return path.join(config.sessionsBase, projectName, sessionId);
}

/**
 * Create the integration branch from current HEAD and set up a single
 * worktree for the entire swarm.
 */
export async function createSwarmWorktree(
  config: Config,
  integrationBranch: string,
  sessionId: string
): Promise<string> {
  const git = simpleGit(config.projectRoot);
  const worktreePath = getSwarmWorktreePath(config, sessionId);

  // Create worktree on a new integration branch from current HEAD
  await git.raw([
    'worktree', 'add',
    worktreePath,
    '-b', integrationBranch,
  ]);

  return worktreePath;
}

/**
 * Remove the swarm worktree and optionally delete the integration branch.
 */
export async function removeSwarmWorktree(
  config: Config,
  sessionId: string,
  integrationBranch: string
): Promise<void> {
  const git = simpleGit(config.projectRoot);
  const worktreePath = getSwarmWorktreePath(config, sessionId);

  try {
    await git.raw(['worktree', 'remove', worktreePath, '--force']);
  } catch {
    // Ignore if already removed
  }

  try {
    await git.branch(['-D', integrationBranch]);
  } catch {
    // Ignore if branch doesn't exist
  }
}
