import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { loadConfig } from '../config/manager.js';
import { setupWorktree, hasWorktreeSetup } from '../services/worktree-setup.js';

/**
 * Run the configured worktree setup (copy env files + setup command) against
 * an existing worktree. Defaults to the current directory.
 */
export async function setupWorktreeCommand(worktreePath?: string): Promise<void> {
  const config = await loadConfig();
  if (!config) {
    console.error(chalk.red('Error: Not initialized. Run "a1 init" first.'));
    process.exit(1);
  }

  if (!hasWorktreeSetup(config)) {
    console.log(chalk.yellow('No worktree setup configured.'));
    console.log(chalk.dim('Add copy files / a setup command with: a1 update-config'));
    return;
  }

  const target = path.resolve(worktreePath || process.cwd());

  if (!(await fs.pathExists(target))) {
    console.error(chalk.red(`Error: Path does not exist: ${target}`));
    process.exit(1);
  }

  if (path.resolve(target) === path.resolve(config.projectRoot)) {
    console.error(chalk.red('Error: Refusing to run setup against the project root itself.'));
    process.exit(1);
  }

  console.log(chalk.cyan(`Worktree: ${target}`));
  const ok = await setupWorktree(config, target);

  if (ok) {
    console.log(chalk.green('\n✓ Worktree ready.'));
  } else {
    console.log(chalk.yellow('\n⚠ Setup finished with warnings (see above).'));
    process.exit(1);
  }
}
