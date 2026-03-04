import inquirer from 'inquirer';
import path from 'path';
import fs from 'fs-extra';
import chalk from 'chalk';
import { Config, CliTool } from '../config/types.js';
import { saveConfig, configExists } from '../config/manager.js';
import { isGitRepo, expandPath } from '../utils/validation.js';
import { printBanner } from '../utils/branding.js';

export async function initCommand(): Promise<void> {
  printBanner();
  console.log(chalk.bold('Welcome to Agent One CLI Setup\n'));

  // Check if already initialized
  if (await configExists()) {
    const { overwrite } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'overwrite',
        message: 'Configuration already exists. Do you want to overwrite it?',
        default: false,
      },
    ]);

    if (!overwrite) {
      console.log(chalk.yellow('\nSetup cancelled.'));
      return;
    }
  }

  // Prompt for configuration
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'projectRoot',
      message: 'Project root path (git repo or any directory):',
      default: process.cwd(),
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
        { name: 'claude', value: 'claude' },
        { name: 'cursor-agent', value: 'cursor-agent' },
        { name: 'codex', value: 'codex' },
        { name: 'gemini', value: 'gemini' },
      ],
      default: 'claude',
    },
    {
      type: 'input',
      name: 'sessionsBase',
      message: 'Sessions base directory:\n  (Isolated workspaces - for git repos, kept separate to avoid conflicts)',
      default: (answers: { projectRoot: string }) => {
        // Default to sibling "sessions" directory
        const projectParent = path.dirname(answers.projectRoot);
        return path.join(projectParent, 'sessions');
      },
      filter: (input: string) => expandPath(input),
    },
    {
      type: 'input',
      name: 'aiDirectory',
      message: 'AI directory (where roles and configurations are stored):',
      default: async (answers: { projectRoot: string }) => {
        // Check if .ai exists in current working directory
        const cwdAiDir = path.join(process.cwd(), '.ai');
        const cwdAiExists = await fs.pathExists(cwdAiDir);

        if (cwdAiExists) {
          console.log(chalk.green('  ✓ Found existing .ai directory in current location'));
          return cwdAiDir;
        }

        // Otherwise default to project root
        return path.join(answers.projectRoot, '.ai');
      },
      filter: (input: string) => expandPath(input),
    },
  ]);

  // Create config object
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

  console.log(chalk.green('\n✓ Configuration saved successfully!'));
  console.log(chalk.dim(`\nConfig location: ~/.config/a1/config.json`));

  console.log(chalk.bold('\nGet started:\n'));

  console.log(chalk.cyan('  Roles & Skills'));
  console.log(chalk.dim('  a1 create-role                   Create a role (e.g. bug-catcher)'));
  console.log(chalk.dim('  a1 create-skill                  Create a skill (e.g. look-for-bug)'));
  console.log(chalk.dim('  a1 assign-skill                  Assign skills to a role'));

  console.log(chalk.cyan('\n  MCP Servers'));
  console.log(chalk.dim('  a1 mcp add <name>                Add an MCP server (e.g. linear)'));
  console.log(chalk.dim('  a1 update-skill                  Link MCP servers to a skill'));

  console.log(chalk.cyan('\n  Launch'));
  console.log(chalk.dim('  a1 launch                        Launch your default CLI'));
  console.log(chalk.dim('  a1 launch --role <role>           Launch with a role'));
  console.log(chalk.dim('  a1 create <session>              Create an isolated session'));
  console.log(chalk.dim('  a1 create <session> --role <role> Session with a role'));

  console.log(chalk.dim('\n  a1 --help                        See all commands'));
}
