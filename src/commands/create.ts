import chalk from 'chalk';
import inquirer from 'inquirer';
import { loadConfig } from '../config/manager.js';
import { CliTool } from '../config/types.js';
import { validateBranchName } from '../utils/validation.js';
import { createSession, removeSession } from '../services/session.js';
import { roleExists } from '../services/role.js';
import { composeRoleContext } from '../services/context-composer.js';
import { launchCLI } from '../services/cli-launcher.js';
import { printBanner } from '../utils/branding.js';

interface CreateOptions {
  role?: string;
  cli?: CliTool;
}

export async function createCommand(
  sessionName: string,
  options: CreateOptions
): Promise<void> {
  // Load config
  const config = await loadConfig();
  if (!config) {
    console.error(chalk.red('Error: Not initialized. Run "a1 init" first.'));
    process.exit(1);
  }

  // Validate session name (use branch name validation for now)
  if (!validateBranchName(sessionName)) {
    console.error(chalk.red(`Error: Invalid session name "${sessionName}"`));
    process.exit(1);
  }

  // Determine which CLI to use
  const cliTool = options.cli || config.defaultCli;

  printBanner();
  console.log(chalk.cyan(`Creating session: ${sessionName}`));

  try {
    // Load role context if specified
    let roleContext: string | undefined;

    if (options.role) {
      console.log(chalk.cyan(`Loading role: ${options.role}`));

      if (!(await roleExists(config, options.role))) {
        console.error(
          chalk.red(`Error: Role "${options.role}" not found (checked both app-specific and global locations)`)
        );
        console.error(chalk.dim('Create it with: a1 create-role'));
        process.exit(1);
      }

      const composed = await composeRoleContext(config, options.role);
      roleContext = composed.composedPrompt;
      console.log(chalk.green('✓ Role context loaded'));

      if (composed.skillMarkdowns.length > 0) {
        console.log(chalk.green(`✓ ${composed.skillMarkdowns.length} skill(s) loaded`));
      }
    }

    // Create session
    const { path: sessionPath, isGit } = await createSession(config, sessionName);

    if (isGit) {
      console.log(chalk.green(`✓ Git worktree created at: ${sessionPath}`));
    } else {
      console.log(chalk.green(`✓ Session directory created at: ${sessionPath}`));
    }

    // Launch CLI
    console.log(chalk.cyan(`\nLaunching ${cliTool}...`));
    console.log(chalk.dim('─'.repeat(50)));

    const exitCode = await launchCLI(cliTool, sessionPath, roleContext, config);

    // After CLI exits
    console.log(chalk.dim('─'.repeat(50)));

    if (isGit) {
      console.log(chalk.dim(`  To push: cd ${sessionPath} && git push -u origin ${sessionName}`));
    }

    const { cleanup } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'cleanup',
        message: 'Session ended. Clean up worktree branch?',
        default: false,
      },
    ]);

    if (cleanup) {
      try {
        await removeSession(config, sessionName);
        console.log(chalk.green(`✓ Session removed: ${sessionName}`));
      } catch (err) {
        console.error(chalk.red(`Failed to clean up: ${err}`));
        console.log(chalk.dim(`  To clean up manually: a1 remove ${sessionName}`));
      }
    } else {
      console.log(chalk.dim(`  To clean up later: a1 remove ${sessionName}`));
    }

    process.exit(exitCode);
  } catch (error) {
    console.error(chalk.red(`\nError: ${error}`));
    process.exit(1);
  }
}
