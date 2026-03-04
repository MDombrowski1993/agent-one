#!/usr/bin/env node

import { Command } from 'commander';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initCommand } from './commands/init.js';
import { createCommand } from './commands/create.js';
import { removeCommand } from './commands/remove.js';
import { createRoleCommand } from './commands/create-role.js';
import { updateRoleCommand } from './commands/update-role.js';
import { defaultCommand } from './commands/default.js';
import { configCommand } from './commands/config.js';
import { updateConfigCommand } from './commands/update-config.js';
import { listCommand } from './commands/list.js';
import { addCommand } from './commands/mcp/add.js';
import { listCommand as mcpListCommand } from './commands/mcp/list.js';
import { removeCommand as mcpRemoveCommand } from './commands/mcp/remove.js';
import { createSwarmCommand } from './commands/create-swarm.js';
import { createSkillCommand } from './commands/create-skill.js';
import { updateSkillCommand } from './commands/update-skill.js';
import { listSkillsCommand } from './commands/list-skills.js';
import { assignSkillCommand } from './commands/assign-skill.js';
import { listRolesCommand } from './commands/list-roles.js';

// Get package.json version
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(
  await readFile(join(__dirname, '../package.json'), 'utf-8')
);

const program = new Command();

program
  .name('a1')
  .description('Universal AI agent launcher with role-based context management')
  .version(packageJson.version);

// a1 launch
program
  .command('launch')
  .description('Launch AI agent in the current directory')
  .option('--role <role-name>', 'Load role context')
  .option('--cli <cli-tool>', 'Override default CLI (cursor-agent, claude, codex, gemini)')
  .action(async (options) => {
    await defaultCommand({ role: options.role, cli: options.cli });
  });

// a1 init
program
  .command('init')
  .description('Initialize Agent One configuration')
  .action(async () => {
    await initCommand();
  });

// a1 create <session-name>
program
  .command('create <session-name>')
  .description('Create a new session and launch AI agent')
  .option('--role <role-name>', 'Load role context')
  .option('--cli <cli-tool>', 'Override default CLI (cursor-agent, claude, codex, gemini)')
  .action(async (sessionName: string, options) => {
    await createCommand(sessionName, options);
  });

// a1 create-swarm <swarm-name>
program
  .command('create-swarm <swarm-name>')
  .description('Create an agent swarm with multiple roles working sequentially')
  .action(async (swarmName: string) => {
    await createSwarmCommand(swarmName);
  });

// a1 remove <session-name>
program
  .command('remove <session-name>')
  .description('Remove a session')
  .action(async (sessionName: string) => {
    await removeCommand(sessionName);
  });

// a1 create-role
program
  .command('create-role')
  .description('Create a new role interactively')
  .option('-g, --global', 'Create a global role (available across all projects)')
  .action(async (options) => {
    await createRoleCommand(options);
  });

// a1 update-role
program
  .command('update-role')
  .description('Update an existing role interactively')
  .option('--role <role-name>', 'Role name to update')
  .option('-g, --global', 'Update a global role')
  .action(async (options) => {
    await updateRoleCommand(options);
  });

// a1 list-roles
program
  .command('list-roles')
  .description('List all available roles')
  .action(async () => {
    await listRolesCommand();
  });

// a1 create-skill
program
  .command('create-skill')
  .description('Create a new skill interactively')
  .option('-g, --global', 'Create a global skill (available across all projects)')
  .action(async (options) => {
    await createSkillCommand(options);
  });

// a1 update-skill
program
  .command('update-skill')
  .description('Update an existing skill interactively')
  .option('--skill <skill-name>', 'Skill name to update')
  .option('-g, --global', 'Update a global skill')
  .action(async (options) => {
    await updateSkillCommand(options);
  });

// a1 list-skills
program
  .command('list-skills')
  .description('List all available skills')
  .action(async () => {
    await listSkillsCommand();
  });

// a1 assign-skill
program
  .command('assign-skill')
  .description('Assign skills to a role')
  .action(async () => {
    await assignSkillCommand();
  });

// a1 config
program
  .command('config')
  .description('Show current configuration')
  .action(async () => {
    await configCommand();
  });

// a1 update-config
program
  .command('update-config')
  .description('Update configuration settings')
  .action(async () => {
    await updateConfigCommand();
  });

// a1 list
program
  .command('list')
  .description('List all active sessions')
  .action(async () => {
    await listCommand();
  });

// a1 mcp - MCP server management
const mcpCommand = program.command('mcp').description('Manage MCP servers');

mcpCommand
  .command('add <server-name>')
  .description('Add a new MCP server')
  .action(async (serverName: string) => {
    await addCommand(serverName, {});
  });

mcpCommand
  .command('list')
  .description('List all MCP servers')
  .action(async () => {
    await mcpListCommand();
  });

mcpCommand
  .command('remove <server-name>')
  .description('Remove an MCP server')
  .action(async (serverName: string) => {
    await mcpRemoveCommand(serverName);
  });

program.parse();
