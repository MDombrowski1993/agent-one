import chalk from 'chalk';
import { loadConfig, resolveProject } from '../config/manager.js';
import { A1_RC_FILENAME } from '../config/resolver.js';

export async function configCommand(): Promise<void> {
  const resolved = await resolveProject();

  if (!resolved || !resolved.rc) {
    console.log(
      chalk.yellow('No ') +
        chalk.cyan(A1_RC_FILENAME) +
        chalk.yellow(' found walking up from ') +
        chalk.white(process.cwd()) +
        chalk.yellow('. Run ') +
        chalk.cyan('a1 init') +
        chalk.yellow(' to create one.')
    );
    return;
  }

  const config = await loadConfig();
  if (!config) {
    console.error(chalk.red('Error: failed to resolve configuration.'));
    process.exit(1);
  }

  console.log(chalk.cyan(chalk.bold('\nAgent One Configuration\n')));
  console.log(chalk.dim('Config file: ') + chalk.white(resolved.rcPath ?? '(none)') + '\n');

  console.log(chalk.green('Project Root:'));
  console.log(chalk.dim('  ') + config.projectRoot);
  console.log();

  console.log(chalk.green('Default AI CLI:'));
  console.log(chalk.dim('  ') + config.defaultCli);
  console.log();

  console.log(chalk.green('Sessions Base:'));
  console.log(chalk.dim('  ') + config.sessionsBase);
  console.log();

  console.log(chalk.green('AI Directory:'));
  console.log(chalk.dim('  ') + config.aiDirectory);
  console.log();

  console.log(chalk.dim('To update configuration, run: ') + chalk.cyan('a1 update-config'));
}
