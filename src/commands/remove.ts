import inquirer from 'inquirer';
import chalk from 'chalk';
import { loadConfig } from '../config/manager.js';
import { removeSession, getSessionPath, sessionExists } from '../services/session.js';

export async function removeCommand(sessionName: string): Promise<void> {
  // Load config
  const config = await loadConfig();
  if (!config) {
    console.error(chalk.red('Error: Not initialized. Run "a1 init" first.'));
    process.exit(1);
  }

  const sessionPath = getSessionPath(config, sessionName);

  // Check if session exists
  if (!(await sessionExists(sessionPath))) {
    console.error(chalk.red(`Error: Session does not exist at: ${sessionPath}`));
    process.exit(1);
  }

  // Confirm removal
  console.log(chalk.yellow(`\nYou are about to remove the session:`));
  console.log(chalk.dim(`  Name: ${sessionName}`));
  console.log(chalk.dim(`  Path: ${sessionPath}`));
  console.log();

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Are you sure you want to remove this session?',
      default: false,
    },
  ]);

  if (!confirm) {
    console.log(chalk.yellow('Removal cancelled.'));
    return;
  }

  try {
    await removeSession(config, sessionName);
    console.log(chalk.green(`✓ Session removed: ${sessionName}`));
  } catch (error) {
    console.error(chalk.red(`\nError: ${error}`));
    process.exit(1);
  }
}
