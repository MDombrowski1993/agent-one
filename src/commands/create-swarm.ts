import chalk from 'chalk';
import path from 'path';
import { loadConfig } from '../config/manager.js';
import { isGitRepo } from '../utils/validation.js';
import { runWizard } from '../swarm/wizard.js';
import { loadManifest } from '../swarm/manifest.js';
import { SwarmOrchestrator } from '../swarm/orchestrator.js';
import { SwarmManifest } from '../types/swarm.js';

export interface CreateSwarmOptions {
  manifest?: string;
}

export async function createSwarmCommand(options: CreateSwarmOptions): Promise<void> {
  console.log(chalk.blue.bold('\n  Agent Swarm\n'));

  // Load config
  const config = await loadConfig();
  if (!config) {
    console.error(chalk.red('Error: Not initialized. Run "a1 init" first.'));
    process.exit(1);
  }

  // Verify git repo
  if (!(await isGitRepo(config.projectRoot))) {
    console.error(chalk.red('Error: create-swarm requires a git repository.'));
    process.exit(1);
  }

  try {
    let manifest: SwarmManifest;

    if (options.manifest) {
      const manifestPath = path.resolve(options.manifest);
      console.log(chalk.cyan(`Loading manifest from: ${manifestPath}\n`));
      manifest = await loadManifest(manifestPath);
    } else {
      manifest = await runWizard(config);
    }

    console.log(chalk.green(`  ✓ Swarm ready: ${manifest.session_id}\n`));

    // The orchestrator handles worktree creation, manifest save, and execution
    const orchestrator = new SwarmOrchestrator(config, manifest);
    await orchestrator.run();

    process.exit(0);
  } catch (error) {
    console.error(chalk.red(`\nError: ${error}`));
    process.exit(1);
  }
}
