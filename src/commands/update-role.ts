import inquirer from 'inquirer';
import chalk from 'chalk';
import path from 'path';
import { loadConfig } from '../config/manager.js';
import { CliTool, Config } from '../config/types.js';
import { getRolePath, loadRoleContext } from '../services/role.js';
import { launchCLI } from '../services/cli-launcher.js';
import fs from 'fs-extra';

interface UpdateRoleOptions {
  role?: string;
  global?: boolean;
}

export async function updateRoleCommand(options: UpdateRoleOptions = {}): Promise<void> {
  // Load config (may be needed for app-specific roles)
  const config = await loadConfig();

  // Determine if we're updating a global role
  const isGlobal = options.global || false;

  // Check if config is required but missing
  if (!isGlobal && !config) {
    console.error(chalk.red('Error: Not initialized. Run "a1 init" first.'));
    console.error(chalk.dim('Or use -g flag to update a global role'));
    process.exit(1);
  }

  // Get role name from options or prompt
  let roleName = options.role;
  if (!roleName) {
    const answer = await inquirer.prompt([
      {
        type: 'input',
        name: 'roleName',
        message: 'Role name to update:',
        validate: (input: string) => {
          if (!input || input.trim() === '') {
            return 'Role name is required';
          }
          return true;
        },
      },
    ]);
    roleName = answer.roleName;
  }

  // TypeScript safety check (should never happen due to validation above)
  if (!roleName) {
    console.error(chalk.red('Error: Role name is required'));
    process.exit(1);
  }

  // Determine which location the role exists in
  let actualIsGlobal: boolean;
  let rolePath: string;
  let roleContent: string;

  try {
    // If global flag is set, check only global location
    if (isGlobal) {
      rolePath = getRolePath(null, roleName, true);
      if (!(await fs.pathExists(rolePath))) {
        console.error(chalk.red(`\nError: Global role "${roleName}" does not exist.`));
        console.error(chalk.dim(`Expected at: ${rolePath}`));
        process.exit(1);
      }
      actualIsGlobal = true;
      roleContent = await fs.readFile(rolePath, 'utf-8');
    } else {
      // Check app-specific first, then global (using priority logic from loadRoleContext)
      const appSpecificPath = getRolePath(config, roleName, false);
      if (await fs.pathExists(appSpecificPath)) {
        rolePath = appSpecificPath;
        actualIsGlobal = false;
        roleContent = await fs.readFile(rolePath, 'utf-8');
      } else {
        const globalPath = getRolePath(null, roleName, true);
        if (await fs.pathExists(globalPath)) {
          rolePath = globalPath;
          actualIsGlobal = true;
          roleContent = await fs.readFile(rolePath, 'utf-8');
        } else {
          console.error(chalk.red(`\nError: Role "${roleName}" does not exist.`));
          console.error(chalk.dim('Checked both app-specific and global locations.'));
          console.error(chalk.dim(`\nCreate it first with: a1 create-role`));
          process.exit(1);
        }
      }
    }
  } catch (error) {
    console.error(chalk.red(`\nError loading role: ${error}`));
    process.exit(1);
  }

  // Display info about which role is being updated
  const roleScope = actualIsGlobal ? 'Global' : 'App-specific';
  console.log(chalk.cyan(chalk.bold(`\nUpdate ${roleScope} Role: ${roleName}\n`)));
  console.log(chalk.dim(`Location: ${rolePath}\n`));

  // Ask which CLI to use for updating the role
  const defaultCli = config?.defaultCli || 'cursor-agent';
  const { cliTool } = await inquirer.prompt([
    {
      type: 'list',
      name: 'cliTool',
      message: 'Select AI CLI to help update this role:',
      choices: [
        { name: `${defaultCli} (default)`, value: defaultCli },
        ...(defaultCli !== 'cursor-agent'
          ? [{ name: 'cursor-agent', value: 'cursor-agent' }]
          : []),
        ...(defaultCli !== 'claude' ? [{ name: 'claude', value: 'claude' }] : []),
        ...(defaultCli !== 'codex' ? [{ name: 'codex', value: 'codex' }] : []),
        ...(defaultCli !== 'gemini' ? [{ name: 'gemini', value: 'gemini' }] : []),
      ],
    },
  ]);

  // Create meta-prompt for AI to help update the role
  const metaPrompt = `You are helping the user update an existing AI agent role called "${roleName}".

The role file is located at: ${rolePath}

CURRENT ROLE CONTENT:
---
${roleContent}
---

YOUR TASK:
1. FIRST, read the role file at ${rolePath} to see the current content in the actual file (it should match what's shown above).
2. ASK the user what changes they would like to make to this role. Examples:
   - Add new responsibilities
   - Update guidelines or best practices
   - Change focus areas
   - Add context about new tools or frameworks
   - Refine the description
   - Any other modifications

3. After understanding what changes they want, EDIT the role file at ${rolePath} to incorporate those changes while preserving the existing structure and any content they want to keep.

Start by asking the user what changes they'd like to make to the "${roleName}" role.`;

  console.log(chalk.cyan(`\nLaunching ${cliTool} to help update the role...`));
  console.log(chalk.dim('─'.repeat(50)));

  // Launch CLI with meta-prompt in the appropriate directory
  const workingDir = actualIsGlobal
    ? path.dirname(rolePath)  // Global: launch in the role directory
    : config!.aiDirectory;    // App-specific: launch in .ai directory

  try {
    await launchCLI(cliTool as CliTool, workingDir, metaPrompt, config || undefined);

    console.log(chalk.dim('─'.repeat(50)));
    console.log(chalk.green(`\n✓ Role "${roleName}" has been updated!`));
    console.log(chalk.dim(`Location: ${rolePath}`));
  } catch (error) {
    console.error(chalk.red(`\nError launching CLI: ${error}`));
    process.exit(1);
  }
}
