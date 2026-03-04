import inquirer from 'inquirer';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { loadConfig } from '../config/manager.js';
import { CliTool, Config } from '../config/types.js';
import { createSkill, getSkillPath, getSkillMCPRefsPath, skillExists } from '../services/skill/service.js';
import { discoverAllMCPServers } from '../services/mcp/manager.js';
import { launchCLI } from '../services/cli-launcher.js';

interface CreateSkillOptions {
  global?: boolean;
}

export async function createSkillCommand(options: CreateSkillOptions = {}): Promise<void> {
  const isGlobal = options.global || false;

  // Load config (only required for project-level skills)
  let config: Config | null = null;
  if (!isGlobal) {
    config = await loadConfig();
    if (!config) {
      console.error(chalk.red('Error: Not initialized. Run "a1 init" first.'));
      console.error(chalk.dim('Or use -g flag to create a global skill'));
      process.exit(1);
    }
  }

  if (isGlobal) {
    console.log(chalk.cyan(chalk.bold('\nCreate New Global Skill\n')));
    console.log(chalk.dim('This skill will be available across all projects.\n'));
  } else {
    console.log(chalk.cyan(chalk.bold('\nCreate New Skill\n')));
  }

  // Prompt for skill details
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'skillName',
      message: 'Skill name (e.g., "look-for-bug", "review-code"):',
      validate: (input: string) => {
        if (!input || input.trim() === '') {
          return 'Skill name is required';
        }
        if (!/^[a-z0-9-]+$/.test(input)) {
          return 'Skill name must be lowercase letters, numbers, and hyphens only';
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

  const { skillName, description } = answers;

  // Check if skill already exists
  if (await skillExists(config, skillName, isGlobal)) {
    const skillPath = getSkillPath(config, skillName, isGlobal);
    const location = isGlobal ? 'Global' : 'Project';
    console.error(chalk.red(`\nError: ${location} skill "${skillName}" already exists at: ${skillPath}`));
    process.exit(1);
  }

  try {
    // Create skill file
    const skillPath = await createSkill(config, skillName, description, isGlobal);
    const scope = isGlobal ? 'Global skill' : 'Skill';
    console.log(chalk.green(`\n✓ ${scope} file created at: ${skillPath}`));

    // Offer to associate MCP servers
    const allServers = await discoverAllMCPServers(config);
    if (allServers.length > 0) {
      const { selectedServers } = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'selectedServers',
          message: 'Associate MCP servers with this skill (optional):',
          choices: allServers.map((s) => ({
            name: `${s.name} (${s.scope})`,
            value: s.name,
          })),
        },
      ]);

      if (selectedServers.length > 0) {
        const mcpRefsPath = getSkillMCPRefsPath(config, skillName, isGlobal);
        await fs.ensureDir(path.dirname(mcpRefsPath));
        await fs.writeFile(mcpRefsPath, JSON.stringify(selectedServers, null, 2), 'utf-8');
        console.log(chalk.green(`✓ MCP servers linked: ${selectedServers.join(', ')}`));
      }
    }

    // Ask which CLI to use for building out the skill
    const defaultCli = config?.defaultCli || 'cursor-agent';
    const { cliTool } = await inquirer.prompt([
      {
        type: 'list',
        name: 'cliTool',
        message: 'Select AI CLI to help build out this skill:',
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

    // Create meta-prompt for AI to interview and help build the skill
    const metaPrompt = `You are helping the user create a new AI agent skill called "${skillName}". The user has provided this initial description: "${description}"

Your task is to INTERVIEW the user to gather comprehensive information about this skill, then construct a detailed skill.md file. The skill file has been created at: ${skillPath}

A skill defines a specific capability that can be assigned to roles. Skills are more focused than roles — they describe a particular task or ability.

PROCESS:
1. INTERVIEW PHASE: Ask the user thoughtful questions to understand:
   - What specific task or capability does this skill provide?
   - What are the step-by-step instructions for performing this skill?
   - When should this skill be used vs not used?
   - What guidelines or best practices should be followed?
   - Are there any tools, APIs, or MCP servers this skill requires?

2. CONSTRUCTION PHASE: After gathering information, edit the skill.md file at ${skillPath} to include:
   - Description (based on user's input)
   - Instructions (detailed steps)
   - When to Use (trigger conditions)
   - Guidelines (best practices, constraints)

Start by asking your first interview question to understand what this "${skillName}" skill should do.`;

    console.log(chalk.cyan(`\nLaunching ${cliTool} to help build out the skill...`));
    console.log(chalk.dim('─'.repeat(50)));

    const workingDir = isGlobal
      ? path.dirname(skillPath)
      : config!.aiDirectory;

    await launchCLI(cliTool as CliTool, workingDir, metaPrompt, config || undefined);

    console.log(chalk.dim('─'.repeat(50)));
    const skillScope = isGlobal ? 'global skill' : 'skill';
    console.log(chalk.green(`\n✓ ${skillScope} "${skillName}" is ready to use!`));
    console.log(chalk.dim(`\nAssign it to a role with: a1 assign-skill`));
    if (isGlobal) {
      console.log(chalk.dim('(Available across all projects)'));
    }
  } catch (error) {
    console.error(chalk.red(`\nError: ${error}`));
    process.exit(1);
  }
}
