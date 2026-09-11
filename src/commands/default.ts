import chalk from 'chalk';
import { loadConfig, configExists } from '../config/manager.js';
import { CliTool } from '../config/types.js';
import { launchCLI } from '../services/cli-launcher.js';
import { roleExists } from '../services/role.js';
import { composeRoleContext, composeAlwaysOnContext } from '../services/context-composer.js';
import { printBanner } from '../utils/branding.js';
import { printLoadedSkills } from '../utils/skill-display.js';

interface DefaultCommandOptions {
  role?: string;
  cli?: string;
}

export async function defaultCommand(options: DefaultCommandOptions = {}): Promise<void> {
  printBanner();

  // Check if initialized
  if (!(await configExists())) {
    console.log(chalk.bold('Welcome to Agent One\n'));
    console.log(chalk.dim('Please run ') + chalk.cyan('a1 init') + chalk.dim(' to get started'));
    console.log();
    return;
  }

  // Initialized - launch default CLI in current directory
  const config = await loadConfig();
  if (!config) {
    console.error(chalk.red('Error: Configuration corrupted. Please run "a1 init" again.'));
    process.exit(1);
  }

  const cliTool: CliTool = (options.cli as CliTool) || config.defaultCli;

  // Load role context if specified; always-on skills load either way
  let roleContext: string | undefined;

  if (options.role) {
    if (!(await roleExists(config, options.role))) {
      console.error(chalk.red(`Error: Role "${options.role}" not found.`));
      process.exit(1);
    }

    const composed = await composeRoleContext(config, options.role);
    roleContext = composed.composedPrompt;
    console.log(chalk.cyan(`Launching ${cliTool} with role "${options.role}" in current directory...`));
    printLoadedSkills(composed.skills);
  } else {
    const composed = await composeAlwaysOnContext(config);
    roleContext = composed.composedPrompt || undefined;
    console.log(chalk.cyan(`Launching ${cliTool} in current directory...`));
    printLoadedSkills(composed.skills);
  }

  console.log(chalk.dim('─'.repeat(50)));

  try {
    const exitCode = await launchCLI(cliTool, process.cwd(), roleContext, config);
    process.exit(exitCode);
  } catch (error) {
    console.error(chalk.red(`\nError: ${error}`));
    process.exit(1);
  }
}
