import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { loadConfig, configExists } from '../config/manager.js';
import { isGitRepo } from '../utils/validation.js';
import simpleGit from 'simple-git';

export async function listCommand(): Promise<void> {
  // Check if initialized
  if (!(await configExists())) {
    console.log(chalk.yellow('Not initialized yet. Run ') + chalk.cyan('a1 init') + chalk.yellow(' to get started.'));
    return;
  }

  // Load config
  const config = await loadConfig();
  if (!config) {
    console.error(chalk.red('Error: Configuration corrupted. Please run "a1 init" again.'));
    process.exit(1);
  }

  const projectName = path.basename(config.projectRoot);
  const projectSessionsDir = path.join(config.sessionsBase, projectName);
  const isGit = await isGitRepo(config.projectRoot);

  console.log(chalk.cyan(chalk.bold('\nActive Sessions\n')));
  console.log(chalk.dim(`Project: ${projectName}`));
  console.log(chalk.dim(`Type: ${isGit ? 'Git (worktrees)' : 'Non-git (directories)'}\n`));

  // Check if sessions directory exists
  if (!(await fs.pathExists(projectSessionsDir))) {
    console.log(chalk.yellow('No sessions directory found.'));
    console.log(chalk.dim(`Expected at: ${projectSessionsDir}\n`));
    console.log(chalk.dim('Create your first session with: ') + chalk.cyan('a1 create <session-name>'));
    return;
  }

  // List all subdirectories in the project sessions directory
  const entries = await fs.readdir(projectSessionsDir, { withFileTypes: true });
  const sessions = entries.filter(entry => entry.isDirectory()).map(entry => entry.name);

  if (sessions.length === 0) {
    console.log(chalk.yellow('No active sessions found.\n'));
    console.log(chalk.dim('Create your first session with: ') + chalk.cyan('a1 create <session-name>'));
    return;
  }

  console.log(chalk.green(`Found ${sessions.length} session${sessions.length === 1 ? '' : 's'}:\n`));

  // For git repos, also get worktree info
  let worktreeInfo: Map<string, string> | null = null;
  if (isGit) {
    try {
      const git = simpleGit(config.projectRoot);
      const worktreeList = await git.raw(['worktree', 'list', '--porcelain']);
      worktreeInfo = parseWorktreeList(worktreeList);
    } catch (error) {
      // Ignore errors, just won't show git info
    }
  }

  // Display sessions
  for (const session of sessions.sort()) {
    const sessionPath = path.join(projectSessionsDir, session);
    const stats = await fs.stat(sessionPath);
    const lastModified = stats.mtime.toLocaleDateString();

    console.log(chalk.white(`  ${session}`));
    console.log(chalk.dim(`    Path: ${sessionPath}`));
    console.log(chalk.dim(`    Last modified: ${lastModified}`));

    // Show git status if available
    if (isGit && worktreeInfo && worktreeInfo.has(sessionPath)) {
      const branch = worktreeInfo.get(sessionPath);
      console.log(chalk.dim(`    Branch: ${branch}`));
    }

    console.log();
  }

  console.log(chalk.dim('To remove a session: ') + chalk.cyan('a1 remove <session-name>'));
}

function parseWorktreeList(output: string): Map<string, string> {
  const worktrees = new Map<string, string>();
  const lines = output.split('\n');

  let currentPath = '';
  let currentBranch = '';

  for (const line of lines) {
    if (line.startsWith('worktree ')) {
      currentPath = line.substring('worktree '.length);
    } else if (line.startsWith('branch ')) {
      currentBranch = line.substring('branch '.length).replace('refs/heads/', '');
      if (currentPath) {
        worktrees.set(currentPath, currentBranch);
      }
    }
  }

  return worktrees;
}
