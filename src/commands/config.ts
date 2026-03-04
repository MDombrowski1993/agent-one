import chalk from 'chalk';
import { loadConfig, configExists } from '../config/manager.js';

export async function configCommand(): Promise<void> {
  // Check if initialized
  if (!(await configExists())) {
    console.log(chalk.yellow('Not initialized yet. Run ') + chalk.cyan('a1 init') + chalk.yellow(' to get started.'));
    return;
  }

  // Load and display config
  const config = await loadConfig();
  if (!config) {
    console.error(chalk.red('Error: Configuration corrupted. Please run "a1 init" again.'));
    process.exit(1);
  }

  console.log(chalk.cyan(chalk.bold('\nAgent One Configuration\n')));
  console.log(chalk.dim('Config file: ') + chalk.white('~/.config/a1/config.json\n'));

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
