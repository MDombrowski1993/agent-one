import inquirer from 'inquirer';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { loadConfig } from '../config/manager.js';
import { CliTool, Config } from '../config/types.js';
import {
  getSkillPath,
  getSkillMCPRefsPath,
  loadSkillMCPRefs,
} from '../services/skill/service.js';
import { discoverAllMCPServers as discoverMCP } from '../services/mcp/manager.js';
import { launchCLI } from '../services/cli-launcher.js';

interface UpdateSkillOptions {
  skill?: string;
  global?: boolean;
}

export async function updateSkillCommand(options: UpdateSkillOptions = {}): Promise<void> {
  const config = await loadConfig();
  const isGlobal = options.global || false;

  if (!isGlobal && !config) {
    console.error(chalk.red('Error: Not initialized. Run "a1 init" first.'));
    console.error(chalk.dim('Or use -g flag to update a global skill'));
    process.exit(1);
  }

  // Get skill name from options or prompt
  let skillName = options.skill;
  if (!skillName) {
    const answer = await inquirer.prompt([
      {
        type: 'input',
        name: 'skillName',
        message: 'Skill name to update:',
        validate: (input: string) => {
          if (!input || input.trim() === '') {
            return 'Skill name is required';
          }
          return true;
        },
      },
    ]);
    skillName = answer.skillName;
  }

  if (!skillName) {
    console.error(chalk.red('Error: Skill name is required'));
    process.exit(1);
  }

  // Find the skill
  let actualIsGlobal: boolean;
  let skillPath: string;
  let skillContent: string;

  try {
    if (isGlobal) {
      skillPath = getSkillPath(null, skillName, true);
      if (!(await fs.pathExists(skillPath))) {
        console.error(chalk.red(`\nError: Global skill "${skillName}" does not exist.`));
        console.error(chalk.dim(`Expected at: ${skillPath}`));
        process.exit(1);
      }
      actualIsGlobal = true;
      skillContent = await fs.readFile(skillPath, 'utf-8');
    } else {
      const projectPath = getSkillPath(config, skillName, false);
      if (await fs.pathExists(projectPath)) {
        skillPath = projectPath;
        actualIsGlobal = false;
        skillContent = await fs.readFile(skillPath, 'utf-8');
      } else {
        const globalPath = getSkillPath(null, skillName, true);
        if (await fs.pathExists(globalPath)) {
          skillPath = globalPath;
          actualIsGlobal = true;
          skillContent = await fs.readFile(skillPath, 'utf-8');
        } else {
          console.error(chalk.red(`\nError: Skill "${skillName}" does not exist.`));
          console.error(chalk.dim('Checked both project and global locations.'));
          console.error(chalk.dim(`\nCreate it first with: a1 create-skill`));
          process.exit(1);
        }
      }
    }
  } catch (error) {
    console.error(chalk.red(`\nError loading skill: ${error}`));
    process.exit(1);
  }

  const skillScope = actualIsGlobal! ? 'Global' : 'Project';
  console.log(chalk.cyan(chalk.bold(`\nUpdate ${skillScope} Skill: ${skillName}\n`)));
  console.log(chalk.dim(`Location: ${skillPath!}\n`));

  // Ask what to update
  const { updateType } = await inquirer.prompt([
    {
      type: 'list',
      name: 'updateType',
      message: 'What would you like to update?',
      choices: [
        { name: 'Edit skill.md (with AI assistance)', value: 'markdown' },
        { name: 'Manage MCP server references', value: 'mcp' },
      ],
    },
  ]);

  if (updateType === 'mcp') {
    await updateMCPRefs(config, skillName!, actualIsGlobal!);
    return;
  }

  // Edit skill.md with AI
  const defaultCli = config?.defaultCli || 'cursor-agent';
  const { cliTool } = await inquirer.prompt([
    {
      type: 'list',
      name: 'cliTool',
      message: 'Select AI CLI to help update this skill:',
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

  const metaPrompt = `You are helping the user update an existing AI agent skill called "${skillName}".

The skill file is located at: ${skillPath!}

CURRENT SKILL CONTENT:
---
${skillContent!}
---

YOUR TASK:
1. FIRST, read the skill file at ${skillPath!} to see the current content in the actual file.
2. ASK the user what changes they would like to make to this skill.
3. After understanding what changes they want, EDIT the skill file at ${skillPath!} to incorporate those changes.

Start by asking the user what changes they'd like to make to the "${skillName}" skill.`;

  console.log(chalk.cyan(`\nLaunching ${cliTool} to help update the skill...`));
  console.log(chalk.dim('─'.repeat(50)));

  const workingDir = actualIsGlobal!
    ? path.dirname(skillPath!)
    : config!.aiDirectory;

  try {
    await launchCLI(cliTool as CliTool, workingDir, metaPrompt, config || undefined);

    console.log(chalk.dim('─'.repeat(50)));
    console.log(chalk.green(`\n✓ Skill "${skillName}" has been updated!`));
    console.log(chalk.dim(`Location: ${skillPath!}`));
  } catch (error) {
    console.error(chalk.red(`\nError launching CLI: ${error}`));
    process.exit(1);
  }
}

async function updateMCPRefs(
  config: Config | null,
  skillName: string,
  isGlobal: boolean
): Promise<void> {
  // Load current MCP refs
  const currentRefs = await loadSkillMCPRefs(config, skillName);

  // Discover available MCP servers
  const allServers = await discoverMCP(config);

  if (allServers.length === 0) {
    console.log(chalk.yellow('\nNo MCP servers configured.'));
    console.log(chalk.dim('Add servers with: a1 mcp add <server-name>'));
    return;
  }

  // Let user select MCP servers
  const { selectedServers } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedServers',
      message: 'Select MCP servers for this skill:',
      choices: allServers.map((s) => ({
        name: `${s.name} (${s.scope})`,
        value: s.name,
        checked: currentRefs.includes(s.name),
      })),
    },
  ]);

  // Write mcp.json
  const mcpRefsPath = getSkillMCPRefsPath(config, skillName, isGlobal);
  await fs.ensureDir(path.dirname(mcpRefsPath));

  if (selectedServers.length > 0) {
    await fs.writeFile(mcpRefsPath, JSON.stringify(selectedServers, null, 2), 'utf-8');
    console.log(chalk.green(`\n✓ MCP references updated: ${selectedServers.join(', ')}`));
  } else {
    // Remove mcp.json if no servers selected
    if (await fs.pathExists(mcpRefsPath)) {
      await fs.remove(mcpRefsPath);
    }
    console.log(chalk.green('\n✓ MCP references cleared'));
  }
}
