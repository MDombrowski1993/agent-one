import inquirer from 'inquirer';
import chalk from 'chalk';
import { loadConfig } from '../../config/manager.js';
import {
  MCPServer,
  MCPServerType,
  MCPStdioServer,
  MCPHttpServer,
  MCPSseServer,
} from '../../services/mcp/types.js';
import { saveMCPServer } from '../../services/mcp/manager.js';
import {
  MCPScope,
  buildCLIAddCommand,
  runCLICommand,
} from '../../services/mcp/cli-commands.js';

export async function addCommand(serverName: string, options: any): Promise<void> {
  console.log(chalk.blue(`Adding MCP server: ${serverName}`));

  const config = await loadConfig();

  // Prompt for server type
  const { serverType } = await inquirer.prompt<{ serverType: MCPServerType }>([
    {
      type: 'list',
      name: 'serverType',
      message: 'Select server type:',
      choices: [
        { name: 'stdio (Local command/process)', value: 'stdio' },
        { name: 'http (HTTP endpoint)', value: 'http' },
        { name: 'sse (Server-Sent Events)', value: 'sse' },
      ],
    },
  ]);

  let server: MCPServer;

  if (serverType === 'stdio') {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'command',
        message: 'Enter command:',
        validate: (input: string) => (input.trim() ? true : 'Command is required'),
      },
      {
        type: 'input',
        name: 'args',
        message: 'Enter arguments (comma-separated, optional):',
        default: '',
      },
      {
        type: 'confirm',
        name: 'hasEnv',
        message: 'Do you want to add environment variables?',
        default: false,
      },
    ]);

    const stdioServer: MCPStdioServer = {
      type: 'stdio',
      command: answers.command.trim(),
    };

    if (answers.args.trim()) {
      stdioServer.args = answers.args.split(',').map((arg: string) => arg.trim());
    }

    if (answers.hasEnv) {
      const envVars: Record<string, string> = {};
      let addMore = true;

      while (addMore) {
        const envAnswer = await inquirer.prompt([
          {
            type: 'input',
            name: 'key',
            message: 'Environment variable name:',
            validate: (input: string) => (input.trim() ? true : 'Key is required'),
          },
          {
            type: 'input',
            name: 'value',
            message: 'Environment variable value:',
          },
        ]);

        envVars[envAnswer.key.trim()] = envAnswer.value;

        const { continueAdding } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'continueAdding',
            message: 'Add another environment variable?',
            default: false,
          },
        ]);

        addMore = continueAdding;
      }

      if (Object.keys(envVars).length > 0) {
        stdioServer.env = envVars;
      }
    }

    server = stdioServer;
  } else if (serverType === 'http') {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'url',
        message: 'Enter HTTP URL:',
        validate: (input: string) => {
          const trimmed = input.trim();
          if (!trimmed) return 'URL is required';
          try {
            new URL(trimmed);
            return true;
          } catch {
            return 'Please enter a valid URL';
          }
        },
      },
      {
        type: 'confirm',
        name: 'hasHeaders',
        message: 'Do you want to add HTTP headers?',
        default: false,
      },
    ]);

    const httpServer: MCPHttpServer = {
      type: 'http',
      url: answers.url.trim(),
    };

    if (answers.hasHeaders) {
      httpServer.headers = await promptHeaders();
    }

    server = httpServer;
  } else {
    // SSE
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'url',
        message: 'Enter SSE URL:',
        validate: (input: string) => {
          const trimmed = input.trim();
          if (!trimmed) return 'URL is required';
          try {
            new URL(trimmed);
            return true;
          } catch {
            return 'Please enter a valid URL';
          }
        },
      },
      {
        type: 'confirm',
        name: 'hasHeaders',
        message: 'Do you want to add HTTP headers?',
        default: false,
      },
    ]);

    const sseServer: MCPSseServer = {
      type: 'sse',
      url: answers.url.trim(),
    };

    if (answers.hasHeaders) {
      sseServer.headers = await promptHeaders();
    }

    server = sseServer;
  }

  // Ask for scope
  const { scope } = await inquirer.prompt<{ scope: MCPScope }>([
    {
      type: 'list',
      name: 'scope',
      message: 'Select scope:',
      choices: [
        { name: 'local  - Only you, this project (default)', value: 'local' },
        { name: 'project - Shared via .mcp.json (version controlled)', value: 'project' },
        { name: 'user    - You, across all projects', value: 'user' },
      ],
      default: 'local',
    },
  ]);

  // Delegate to the native CLI command
  const cli = config?.defaultCli || 'claude';
  const cliCmd = buildCLIAddCommand(cli, { name: serverName, server, scope });

  if (cliCmd) {
    console.log(chalk.cyan(`\nRunning: ${cliCmd.command} ${cliCmd.args.join(' ')}`));

    try {
      const exitCode = await runCLICommand(cliCmd.command, cliCmd.args, process.cwd());

      if (exitCode !== 0) {
        console.error(chalk.red(`\nCLI command exited with code ${exitCode}`));
        process.exit(exitCode);
      }

      console.log(chalk.green(`\n✓ MCP server "${serverName}" added to ${cli} (${scope} scope)`));
    } catch (error) {
      console.error(chalk.red(`\nError running ${cli} command: ${error}`));
      process.exit(1);
    }
  } else {
    console.log(chalk.yellow(`\nNo native MCP command available for ${cli}. Server reference saved only.`));
  }

  // Save a reference in a1's directory format for skill association
  if (config) {
    try {
      await saveMCPServer(config, serverName, server, false);
      console.log(chalk.dim(`Reference saved in a1 config (available for skill assignment)`));
    } catch (error) {
      console.warn(chalk.yellow(`Warning: Failed to save a1 reference: ${error}`));
    }
  }
}

async function promptHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  let addMore = true;

  while (addMore) {
    const headerAnswer = await inquirer.prompt([
      {
        type: 'input',
        name: 'key',
        message: 'Header name:',
        validate: (input: string) => (input.trim() ? true : 'Header name is required'),
      },
      {
        type: 'input',
        name: 'value',
        message: 'Header value:',
      },
    ]);

    headers[headerAnswer.key.trim()] = headerAnswer.value;

    const { continueAdding } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'continueAdding',
        message: 'Add another header?',
        default: false,
      },
    ]);

    addMore = continueAdding;
  }

  return headers;
}
