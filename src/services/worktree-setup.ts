import { spawnSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { Config } from '../config/types.js';

/**
 * Whether the config has any worktree setup steps defined.
 */
export function hasWorktreeSetup(config: Config): boolean {
  const setup = config.worktreeSetup;
  return Boolean(setup && ((setup.copyFiles && setup.copyFiles.length > 0) || setup.command));
}

/**
 * Prepare a freshly created worktree so it can run locally as-is:
 * copy gitignored files (env files, local overrides) from the project root,
 * then run the configured setup command at the worktree root.
 *
 * Failures are reported but never thrown — a broken setup step shouldn't
 * kill session creation. Returns true if all steps succeeded.
 */
export async function setupWorktree(config: Config, worktreePath: string): Promise<boolean> {
  const setup = config.worktreeSetup;
  if (!hasWorktreeSetup(config) || !setup) {
    return true;
  }

  console.log(chalk.cyan('\nSetting up worktree...'));
  let ok = true;

  for (const relPath of setup.copyFiles ?? []) {
    const src = path.join(config.projectRoot, relPath);
    const dest = path.join(worktreePath, relPath);

    try {
      if (await fs.pathExists(src)) {
        await fs.ensureDir(path.dirname(dest));
        await fs.copy(src, dest, { overwrite: true });
        console.log(chalk.green(`  ✓ Copied ${relPath}`));
      } else {
        console.log(chalk.yellow(`  ⚠ Skipped ${relPath} (not found in ${config.projectRoot})`));
        ok = false;
      }
    } catch (error) {
      console.log(chalk.yellow(`  ⚠ Failed to copy ${relPath}: ${error}`));
      ok = false;
    }
  }

  if (setup.command) {
    console.log(chalk.cyan(`  Running: ${setup.command}`));
    const result = spawnSync(setup.command, {
      cwd: worktreePath,
      shell: true,
      stdio: 'inherit',
    });

    if (result.status !== 0) {
      console.log(
        chalk.yellow(
          `  ⚠ Setup command exited with ${result.status ?? 'signal'} — fix and re-run with: a1 setup-worktree ${worktreePath}`
        )
      );
      ok = false;
    } else {
      console.log(chalk.green(`  ✓ Setup command completed`));
    }
  }

  return ok;
}
