import chalk from 'chalk';
import { Config } from '../../config/types.js';
import { composeRoleContext } from '../context-composer.js';
import { launchCLI } from '../cli-launcher.js';
import {
  loadPreviousHandoffs,
  createHandoffTemplate,
  getHandoffPath,
} from './handoffs.js';
import { updateSwarmStatus } from './metadata.js';

export async function executeSwarmRoles(
  config: Config,
  worktreePath: string,
  swarmName: string,
  taskDescription: string,
  roles: string[]
): Promise<void> {
  console.log(chalk.blue('\n🚀 Starting Agent Swarm...\n'));

  for (let i = 0; i < roles.length; i++) {
    const roleName = roles[i];
    const roleNumber = i + 1;
    const totalRoles = roles.length;

    console.log(
      chalk.cyan(
        `\n${'='.repeat(60)}\n🤖 Agent ${roleNumber}/${totalRoles}: ${roleName}\n${'='.repeat(60)}\n`
      )
    );

    try {
      // Compose role context (includes skills)
      const composed = await composeRoleContext(config, roleName);

      if (composed.skillMarkdowns.length > 0) {
        console.log(chalk.green(`  ✓ ${composed.skillMarkdowns.length} skill(s) loaded`));
      }

      // Build swarm-specific context
      const context = await buildSwarmContext(
        config,
        worktreePath,
        swarmName,
        taskDescription,
        roleName,
        roles,
        roleNumber,
        totalRoles,
        composed.composedPrompt
      );

      // Update swarm status
      await updateSwarmStatus(worktreePath, swarmName, 'in-progress', i);

      // Launch CLI with context
      const exitCode = await launchCLI(config.defaultCli, worktreePath, context, config);

      if (exitCode !== 0) {
        console.log(
          chalk.yellow(
            `\n⚠️  Agent ${roleName} exited with code ${exitCode}. Continuing with next agent...`
          )
        );
      }

      console.log(chalk.green(`\n✓ Agent ${roleName} completed\n`));
    } catch (error) {
      console.error(chalk.red(`\n✗ Error running agent ${roleName}: ${error}\n`));
      await updateSwarmStatus(worktreePath, swarmName, 'failed', i);
      throw error;
    }
  }

  // Mark swarm as completed
  await updateSwarmStatus(worktreePath, swarmName, 'completed', roles.length);

  console.log(
    chalk.green.bold(
      `\n${'='.repeat(60)}\n✨ Agent Swarm "${swarmName}" completed!\n${'='.repeat(60)}\n`
    )
  );
  console.log(
    chalk.dim(`All agents have finished their work in the worktree at:\n${worktreePath}\n`)
  );
}

async function buildSwarmContext(
  config: Config,
  worktreePath: string,
  swarmName: string,
  taskDescription: string,
  roleName: string,
  allRoles: string[],
  roleNumber: number,
  totalRoles: number,
  composedRolePrompt: string
): Promise<string> {
  // Load previous handoffs
  const previousHandoffs = await loadPreviousHandoffs(
    worktreePath,
    swarmName,
    roleName,
    allRoles
  );

  // Create handoff template for this role
  const handoffPath = await createHandoffTemplate(worktreePath, swarmName, roleName);

  // Determine next agent info
  const isLastAgent = roleNumber === totalRoles;
  const nextAgentInfo = isLastAgent
    ? 'You are the FINAL agent in this swarm. Complete the task and write a final summary.'
    : `The next agent will be: **${allRoles[roleNumber]}**`;

  // Build complete context
  return `${composedRolePrompt}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 🐝 AGENT SWARM CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Swarm Name:** ${swarmName}
**Your Position:** Agent ${roleNumber}/${totalRoles}
**Your Role:** ${roleName}

### Original Task
${taskDescription}

### Previous Work
${previousHandoffs}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 📝 YOUR TASK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. **Review** the original task and previous agents' work
2. **Complete** your responsibilities as the ${roleName} agent
3. **Document** your work by editing the handoff file at:
   \`${handoffPath}\`

### Handoff Instructions
When you're done, edit the handoff file to include:
- What you completed
- Files/artifacts you created
- Important notes for the next agent

${nextAgentInfo}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
}
