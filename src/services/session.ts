import path from 'path';
import fs from 'fs-extra';
import simpleGit from 'simple-git';
import { Config } from '../config/types.js';
import { isGitRepo } from '../utils/validation.js';

export function getSessionPath(config: Config, sessionName: string): string {
  const projectName = path.basename(config.projectRoot);
  return path.join(config.sessionsBase, projectName, sessionName);
}

export async function sessionExists(sessionPath: string): Promise<boolean> {
  return fs.pathExists(sessionPath);
}

export async function createSession(
  config: Config,
  sessionName: string
): Promise<{ path: string; isGit: boolean }> {
  const sessionPath = getSessionPath(config, sessionName);
  const isGit = await isGitRepo(config.projectRoot);

  // Check if session already exists
  if (await sessionExists(sessionPath)) {
    throw new Error(`Session already exists at: ${sessionPath}`);
  }

  // Ensure parent directory exists
  await fs.ensureDir(path.dirname(sessionPath));

  if (isGit) {
    // Git mode: Create worktree from origin/main
    const git = simpleGit(config.projectRoot);

    // Fetch latest changes
    await git.fetch('origin');

    // Create worktree from origin/main
    await git.raw(['worktree', 'add', sessionPath, '-b', sessionName, 'origin/main']);
  } else {
    // Non-git mode: Create simple directory
    await fs.ensureDir(sessionPath);
  }

  return { path: sessionPath, isGit };
}

export async function removeSession(
  config: Config,
  sessionName: string
): Promise<void> {
  const sessionPath = getSessionPath(config, sessionName);
  const isGit = await isGitRepo(config.projectRoot);

  // Check if session exists
  if (!(await sessionExists(sessionPath))) {
    throw new Error(`Session does not exist at: ${sessionPath}`);
  }

  if (isGit) {
    // Git mode: Remove worktree
    const git = simpleGit(config.projectRoot);
    await git.raw(['worktree', 'remove', sessionPath]);
  } else {
    // Non-git mode: Remove directory
    await fs.remove(sessionPath);
  }
}

export async function listSessions(projectRoot: string): Promise<string> {
  const isGit = await isGitRepo(projectRoot);

  if (isGit) {
    const git = simpleGit(projectRoot);
    const result = await git.raw(['worktree', 'list']);
    return result;
  } else {
    return 'Session listing not available for non-git projects';
  }
}
