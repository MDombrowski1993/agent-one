import inquirer from 'inquirer';
import path from 'path';
import fs from 'fs-extra';
import chalk from 'chalk';
import { Config, CliTool } from '../config/types.js';
import { saveConfig, configExists, loadConfig } from '../config/manager.js';
import { isGitRepo, expandPath } from '../utils/validation.js';

export async function updateConfigCommand(): Promise<void> {
  // Check if initialized
  if (!(await configExists())) {
    console.log(chalk.yellow('\nNot initialized yet. Run ') + chalk.cyan('a1 init') + chalk.yellow(' first.'));
    return;
  }

  // Load current config
  const currentConfig = await loadConfig();
  if (!currentConfig) {
    console.error(chalk.red('Error: Configuration corrupted. Please run "a1 init" again.'));
    process.exit(1);
  }

  console.log(chalk.cyan(chalk.bold('\nUpdate Configuration\n')));
  console.log(chalk.dim('Current values are shown as defaults. Press Enter to keep them.\n'));

  // Prompt for configuration with current values as defaults
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'projectRoot',
      message: 'Project root path (git repo or any directory):',
      default: currentConfig.projectRoot,
      validate: async (input: string) => {
        const expanded = expandPath(input);
        const exists = await fs.pathExists(expanded);
        if (!exists) {
          return 'Path must exist';
        }
        const stats = await fs.stat(expanded);
        if (!stats.isDirectory()) {
          return 'Path must be a directory';
        }
        return true;
      },
      filter: async (input: string) => {
        const expanded = expandPath(input);
        const isGit = await isGitRepo(expanded);
        if (isGit) {
          console.log(chalk.green('  ✓ Git repository detected - sessions will use worktrees'));
        } else {
          console.log(chalk.yellow('  ℹ Not a git repo - sessions will use simple directories'));
        }
        return expanded;
      },
    },
    {
      type: 'list',
      name: 'defaultCli',
      message: 'Default AI CLI tool:',
      choices: [
        { name: 'cursor-agent', value: 'cursor-agent' },
        { name: 'claude', value: 'claude' },
        { name: 'codex', value: 'codex' },
        { name: 'gemini', value: 'gemini' },
      ],
      default: currentConfig.defaultCli,
    },
    {
      type: 'input',
      name: 'sessionsBase',
      message: 'Sessions base directory:\n  (Isolated workspaces - for git repos, kept separate to avoid conflicts)',
      default: currentConfig.sessionsBase,
      filter: (input: string) => expandPath(input),
    },
    {
      type: 'input',
      name: 'aiDirectory',
      message: 'AI directory (where roles and configurations are stored):',
      default: currentConfig.aiDirectory,
      filter: (input: string) => expandPath(input),
    },
  ]);

  // Create updated config object
  const config: Config = {
    projectRoot: answers.projectRoot,
    defaultCli: answers.defaultCli as CliTool,
    sessionsBase: answers.sessionsBase,
    aiDirectory: answers.aiDirectory,
  };

  // Ensure directories exist
  await fs.ensureDir(config.sessionsBase);
  await fs.ensureDir(config.aiDirectory);

  // Save config
  await saveConfig(config);

  console.log(chalk.green('\n✓ Configuration updated successfully!'));
  console.log(chalk.dim(`\nConfig location: ~/.config/a1/config.json`));
  console.log(chalk.dim('\nView config with: ') + chalk.cyan('a1 config'));
}
