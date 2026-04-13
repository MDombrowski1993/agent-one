import inquirer from 'inquirer';
import path from 'path';
import fs from 'fs-extra';
import chalk from 'chalk';
import { A1RcFile, CliTool } from '../config/types.js';
import {
  writeRc,
  resolveProject,
  removeLegacyGlobalConfig,
  getLegacyGlobalConfigPath,
} from '../config/manager.js';
import { A1_RC_FILENAME, defaultSessionsBase } from '../config/resolver.js';
import { isGitRepo, expandPath } from '../utils/validation.js';
import { printBanner } from '../utils/branding.js';

export async function initCommand(): Promise<void> {
  printBanner();
  console.log(chalk.bold('Welcome to Agent One CLI Setup\n'));

  const cwd = process.cwd();

  // Project root is always the directory where init is run.
  const projectRoot = cwd;
  const rcPath = path.join(projectRoot, A1_RC_FILENAME);

  // Check if .a1rc.json already exists here
  if (await fs.pathExists(rcPath)) {
    const { overwrite } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'overwrite',
        message: `${A1_RC_FILENAME} already exists at ${projectRoot}. Overwrite?`,
        default: false,
      },
    ]);
    if (!overwrite) {
      console.log(chalk.yellow('\nSetup cancelled.'));
      return;
    }
  }

  // Warn about ancestor .a1rc.json (config would be shadowed by this one)
  const ancestor = await resolveProject(path.dirname(projectRoot));
  if (ancestor && ancestor.rcPath) {
    console.log(
      chalk.yellow(
        `  ℹ Note: an ancestor ${A1_RC_FILENAME} exists at ${ancestor.rcPath} — this project's config will take precedence within it.\n`
      )
    );
  }

  const isGit = await isGitRepo(projectRoot);
  if (isGit) {
    console.log(chalk.green('  ✓ Git repository detected - sessions will use worktrees'));
  } else {
    console.log(chalk.yellow('  ℹ Not a git repo - sessions will use simple directories'));
  }

  // Prompt for configuration
  const answers = await inquirer.prompt([
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
      message:
        'Sessions base directory:\n  (Isolated workspaces — kept outside the repo to avoid conflicts)',
      default: defaultSessionsBase(projectRoot),
      filter: (input: string) => expandPath(input),
    },
  ]);

  // Only persist sessionsBase if it differs from the default — keeps .a1rc.json lean
  const defaultBase = defaultSessionsBase(projectRoot);
  const rc: A1RcFile = {
    defaultCli: answers.defaultCli as CliTool,
  };
  if (path.resolve(answers.sessionsBase) !== path.resolve(defaultBase)) {
    rc.sessionsBase = answers.sessionsBase;
  }

  // Ensure on-disk directories exist
  const sessionsBase = answers.sessionsBase;
  const aiDirectory = path.join(projectRoot, '.ai');
  await fs.ensureDir(sessionsBase);
  await fs.ensureDir(aiDirectory);

  // Write .a1rc.json
  await writeRc(projectRoot, rc);

  // Clean up legacy global config
  const removed = await removeLegacyGlobalConfig();

  console.log(chalk.green(`\n✓ Wrote ${rcPath}`));
  console.log(chalk.dim(`  aiDirectory: ${aiDirectory}`));
  console.log(chalk.dim(`  sessionsBase: ${sessionsBase}`));
  if (removed) {
    console.log(
      chalk.dim(`  Removed legacy config at ${getLegacyGlobalConfigPath()}`)
    );
  }

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
