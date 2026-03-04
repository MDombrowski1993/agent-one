import inquirer from 'inquirer';
import chalk from 'chalk';
import { loadConfig } from '../../config/manager.js';
import {
  discoverAllMCPServers,
  removeMCPServer,
} from '../../services/mcp/manager.js';
import {
  MCPScope,
  buildCLIRemoveCommand,
  runCLICommand,
  isCursorAgent,
} from '../../services/mcp/cli-commands.js';

export async function removeCommand(serverName: string): Promise<void> {
  console.log(chalk.blue(`Removing MCP server: ${serverName}`));

  const config = await loadConfig();
  const cli = config?.defaultCli || 'claude';

  // Ask which scope to remove from
  const { scope } = await inquirer.prompt<{ scope: MCPScope }>([
    {
      type: 'list',
      name: 'scope',
      message: `Remove "${serverName}" from which scope?`,
      choices: [
        { name: 'local  - Only you, this project', value: 'local' },
        { name: 'project - Shared .mcp.json', value: 'project' },
        { name: 'user    - You, across all projects', value: 'user' },
      ],
    },
  ]);

  // Delegate to the native CLI command
  if (isCursorAgent(cli)) {
    console.log(chalk.yellow(`\nCursor requires manual MCP management.`));
    console.log(chalk.cyan('Manage your MCP servers at: https://cursor.com/docs/context/mcp/directory'));
  } else {
    const cliCmd = buildCLIRemoveCommand(cli, serverName, scope);

    if (cliCmd) {
      console.log(chalk.cyan(`\nRunning: ${cliCmd.command} ${cliCmd.args.join(' ')}`));

      try {
        const exitCode = await runCLICommand(cliCmd.command, cliCmd.args, process.cwd());

        if (exitCode !== 0) {
          console.error(chalk.red(`\nCLI command exited with code ${exitCode}`));
          process.exit(exitCode);
        }

        console.log(chalk.green(`\n✓ MCP server "${serverName}" removed from ${cli} (${scope} scope)`));
      } catch (error) {
        console.error(chalk.red(`\nError running ${cli} command: ${error}`));
        process.exit(1);
      }
    } else {
      console.log(chalk.yellow(`\nNo native MCP remove command available for ${cli}.`));
    }
  }

  // Clean up a1 reference if it exists
  if (config) {
    const allServers = await discoverAllMCPServers(config);
    const hasRef = allServers.some((s) => s.name === serverName);
    if (hasRef) {
      try {
        await removeMCPServer(config, serverName, false);
        console.log(chalk.dim('a1 reference removed'));
      } catch {
        // Might be global ref
        try {
          await removeMCPServer(null, serverName, true);
          console.log(chalk.dim('a1 reference removed'));
        } catch {
          // No reference to clean up
        }
      }
    }
  }
}
