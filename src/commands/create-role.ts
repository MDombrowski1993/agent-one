import inquirer from 'inquirer';
import chalk from 'chalk';
import path from 'path';
import { loadConfig } from '../config/manager.js';
import { CliTool, Config } from '../config/types.js';
import { createRole, getRolePath, roleExists } from '../services/role.js';
import { discoverAllSkills, getRoleSkillsPath } from '../services/skill/service.js';
import { launchCLI } from '../services/cli-launcher.js';
import fs from 'fs-extra';

interface CreateRoleOptions {
  global?: boolean;
}

export async function createRoleCommand(options: CreateRoleOptions = {}): Promise<void> {
  const isGlobal = options.global || false;

  // Load config (only required for app-specific roles)
  let config: Config | null = null;
  if (!isGlobal) {
    config = await loadConfig();
    if (!config) {
      console.error(chalk.red('Error: Not initialized. Run "a1 init" first.'));
      console.error(chalk.dim('Or use -g flag to create a global role'));
      process.exit(1);
    }
  }

  // Update header based on scope
  if (isGlobal) {
    console.log(chalk.cyan(chalk.bold('\nCreate New Global Role\n')));
    console.log(chalk.dim('This role will be available across all projects.\n'));
  } else {
    console.log(chalk.cyan(chalk.bold('\nCreate New Role\n')));
  }

  // Prompt for role details
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'roleName',
      message: 'Role name (e.g., "ux-designer", "backend-dev"):',
      validate: (input: string) => {
        if (!input || input.trim() === '') {
          return 'Role name is required';
        }
        // Validate format (lowercase with hyphens)
        if (!/^[a-z0-9-]+$/.test(input)) {
          return 'Role name must be lowercase letters, numbers, and hyphens only';
        }
        return true;
      },
    },
    {
      type: 'input',
      name: 'description',
      message: 'Brief description (1-2 sentences):',
      validate: (input: string) => {
        if (!input || input.trim() === '') {
          return 'Description is required';
        }
        return true;
      },
    },
  ]);

  const { roleName, description } = answers;

  // Check if role already exists
  if (await roleExists(config, roleName, isGlobal)) {
    const rolePath = getRolePath(config, roleName, isGlobal);
    const location = isGlobal ? 'Global' : 'App-specific';
    console.error(chalk.red(`\nError: ${location} role "${roleName}" already exists at: ${rolePath}`));
    process.exit(1);
  }

  try {
    // Create role file
    const rolePath = await createRole(config, roleName, description, isGlobal);
    const scope = isGlobal ? 'Global role' : 'Role';
    console.log(chalk.green(`\n✓ ${scope} file created at: ${rolePath}`));

    // Offer skill assignment if skills exist
    const allSkills = await discoverAllSkills(config);
    if (allSkills.length > 0) {
      const { selectedSkills } = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'selectedSkills',
          message: 'Assign skills to this role (optional):',
          choices: allSkills.map((s) => ({
            name: `${s.name} (${s.scope}) - ${s.description}`,
            value: s.name,
          })),
        },
      ]);

      if (selectedSkills.length > 0) {
        const skillsPath = getRoleSkillsPath(config, roleName, isGlobal);
        await fs.ensureDir(path.dirname(skillsPath));
        await fs.writeFile(skillsPath, JSON.stringify(selectedSkills, null, 2), 'utf-8');
        console.log(chalk.green(`✓ Skills assigned: ${selectedSkills.join(', ')}`));
      }
    }

    // Ask which CLI to use for building out the role
    const defaultCli = config?.defaultCli || 'cursor-agent';
    const { cliTool } = await inquirer.prompt([
      {
        type: 'list',
        name: 'cliTool',
        message: 'Select AI CLI to help build out this role:',
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

    // Create meta-prompt for AI to interview and help build the role
    const metaPrompt = `You are helping the user create a new AI agent role called "${roleName}". The user has provided this initial description: "${description}"

Your task is to INTERVIEW the user to gather comprehensive information about this role, then construct a detailed role.md file. The role file has been created at: ${rolePath}

PROCESS:
1. INTERVIEW PHASE: Ask the user thoughtful questions to understand:
   - What are the key responsibilities of this role?
   - What context or domain knowledge should this role have?
   - What are the common tasks or workflows this role will handle?
   - What guidelines, principles, or best practices should this role follow?
   - What are the key focus areas or priorities?
   - Any specific tools, frameworks, or methodologies this role should be familiar with?
   - Any examples of ideal outputs or behaviors?

2. CONSTRUCTION PHASE: After gathering information, edit the role.md file at ${rolePath} to include:
   - Description (based on user's input)
   - Responsibilities (specific duties)
   - Context & Guidelines (relevant background, principles, best practices)
   - Key Focus Areas (what to prioritize)
   - Any additional sections that would be valuable based on the conversation

Start by asking your first interview question to understand what this "${roleName}" role should do.`;

    console.log(chalk.cyan(`\nLaunching ${cliTool} to help build out the role...`));
    console.log(chalk.dim('─'.repeat(50)));

    // Launch CLI with meta-prompt in the appropriate directory
    const workingDir = isGlobal
      ? path.dirname(rolePath)  // Global: launch in the role directory
      : config!.aiDirectory;    // App-specific: launch in .ai directory

    await launchCLI(cliTool as CliTool, workingDir, metaPrompt, config || undefined);

    console.log(chalk.dim('─'.repeat(50)));
    const roleScope = isGlobal ? 'global role' : 'role';
    console.log(chalk.green(`\n✓ ${roleScope} "${roleName}" is ready to use!`));
    console.log(chalk.dim(`\nUse it with: a1 create <session-name> --role=${roleName}`));
    if (isGlobal) {
      console.log(chalk.dim('(Available across all projects)'));
    }
  } catch (error) {
    console.error(chalk.red(`\nError: ${error}`));
    process.exit(1);
  }
}
