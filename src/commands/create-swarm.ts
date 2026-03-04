import inquirer from 'inquirer';
import chalk from 'chalk';
import { loadConfig } from '../config/manager.js';
import { validateBranchName } from '../utils/validation.js';
import { createSession } from '../services/session.js';
import { discoverAllRoles } from '../services/role.js';
import { createSwarmMetadata, executeSwarmRoles } from '../services/swarm/index.js';

export async function createSwarmCommand(swarmName: string): Promise<void> {
  console.log(chalk.blue.bold('\n🐝 Creating Agent Swarm...\n'));

  // Load config
  const config = await loadConfig();
  if (!config) {
    console.error(chalk.red('Error: Not initialized. Run "a1 init" first.'));
    process.exit(1);
  }

  // Validate swarm name
  if (!validateBranchName(swarmName)) {
    console.error(chalk.red(`Error: Invalid swarm name "${swarmName}"`));
    process.exit(1);
  }

  try {
    // 1. Create session/worktree
    console.log(chalk.cyan(`Creating worktree for swarm: ${swarmName}...`));
    const { path: worktreePath, isGit } = await createSession(config, swarmName);

    if (isGit) {
      console.log(chalk.green(`✓ Git worktree created at: ${worktreePath}\n`));
    } else {
      console.log(chalk.green(`✓ Session directory created at: ${worktreePath}\n`));
    }

    // 2. Get task description (using editor)
    console.log(chalk.cyan('Opening editor for task description...'));
    const { taskDescription } = await inquirer.prompt<{ taskDescription: string }>([
      {
        type: 'editor',
        name: 'taskDescription',
        message: 'Describe the task for this swarm (opens in $EDITOR):',
        default: `# Task Description

Describe what you want this agent swarm to accomplish:

`,
        validate: (input: string) => {
          const trimmed = input.trim();
          if (!trimmed || trimmed === '# Task Description') {
            return 'Task description is required';
          }
          return true;
        },
      },
    ]);

    // 3. Discover available roles
    console.log(chalk.cyan('\nDiscovering available roles...'));
    const availableRoles = await discoverAllRoles(config);

    if (availableRoles.length === 0) {
      console.error(
        chalk.red(
          '\nError: No roles found. Create roles first with: a1 create-role'
        )
      );
      process.exit(1);
    }

    console.log(chalk.green(`✓ Found ${availableRoles.length} role(s)\n`));

    // 4. Select roles to use
    const { selectedRoleNames } = await inquirer.prompt<{
      selectedRoleNames: string[];
    }>([
      {
        type: 'checkbox',
        name: 'selectedRoleNames',
        message: 'Select roles to include in the swarm:',
        choices: availableRoles.map((role) => ({
          name: `${role.name} [${role.scope}] - ${role.description}`,
          value: role.name,
          short: role.name,
        })),
        validate: (input: string[]) => {
          if (input.length === 0) {
            return 'You must select at least one role';
          }
          return true;
        },
      },
    ]);

    // 5. Confirm execution order
    console.log(chalk.cyan('\nExecution order:'));
    selectedRoleNames.forEach((role, index) => {
      console.log(chalk.dim(`  ${index + 1}. ${role}`));
    });

    const { confirmOrder } = await inquirer.prompt<{ confirmOrder: boolean }>([
      {
        type: 'confirm',
        name: 'confirmOrder',
        message: 'Proceed with this order?',
        default: true,
      },
    ]);

    if (!confirmOrder) {
      // Allow reordering
      const { reorderedRoles } = await inquirer.prompt<{
        reorderedRoles: string[];
      }>([
        {
          type: 'checkbox',
          name: 'reorderedRoles',
          message: 'Select roles again in the desired order:',
          choices: selectedRoleNames.map((role) => ({
            name: role,
            value: role,
            checked: true,
          })),
        },
      ]);
      selectedRoleNames.length = 0;
      selectedRoleNames.push(...reorderedRoles);
    }

    // 6. Create swarm metadata
    await createSwarmMetadata(
      worktreePath,
      swarmName,
      taskDescription,
      selectedRoleNames
    );

    console.log(
      chalk.green(
        `\n✓ Swarm "${swarmName}" initialized with ${selectedRoleNames.length} agent(s)\n`
      )
    );

    // 7. Execute roles sequentially
    await executeSwarmRoles(
      config,
      worktreePath,
      swarmName,
      taskDescription,
      selectedRoleNames
    );

    // 8. Show next steps
    console.log(chalk.cyan('Next steps:'));
    console.log(
      chalk.dim(`  Review the work: cd ${worktreePath}`)
    );
    console.log(
      chalk.dim(
        `  Check handoffs: cat ${worktreePath}/.ai/swarms/${swarmName}/handoff-*.md`
      )
    );

    if (isGit) {
      console.log(
        chalk.dim(`  Push changes: cd ${worktreePath} && git push -u origin ${swarmName}`)
      );
    }

    console.log(chalk.dim(`  Clean up: a1 remove ${swarmName}\n`));

    process.exit(0);
  } catch (error) {
    console.error(chalk.red(`\nError: ${error}`));
    process.exit(1);
  }
}
