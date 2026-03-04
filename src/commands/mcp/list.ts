import chalk from 'chalk';
import { loadConfig } from '../../config/manager.js';
import { buildCLIListCommand, runCLICommandCapture, isCursorAgent } from '../../services/mcp/cli-commands.js';

export async function listCommand(): Promise<void> {
  const config = await loadConfig();
  const cli = config?.defaultCli || 'claude';

  if (isCursorAgent(cli)) {
    console.log(chalk.yellow('Cursor requires manual MCP management.'));
    console.log(chalk.cyan('View your MCP servers at: https://cursor.com/docs/context/mcp/directory'));
    return;
  }

  const cliCmd = buildCLIListCommand(cli);

  if (cliCmd) {
    try {
      const result = await runCLICommandCapture(cliCmd.command, cliCmd.args, process.cwd());

      // Replace CLI-specific add hints with a1 command
      const output = result.stdout.replace(
        /Use `\w+ mcp add` to add a server\./g,
        'Use `a1 mcp add` to add a server.'
      );

      if (output) process.stdout.write(output);
      if (result.stderr) process.stderr.write(result.stderr);
    } catch (error) {
      console.error(chalk.red(`\nError running ${cli} mcp list: ${error}`));
      process.exit(1);
    }
  } else {
    console.log(chalk.yellow(`No native MCP list command available for ${cli}.`));
  }
}
