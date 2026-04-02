import { execSync, spawn as nodeSpawn } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { Config } from '../config/types.js';
import { SwarmManifest, TierConfig, AgentConfig } from '../types/swarm.js';
import { getAgentDir, getSwarmDir, saveManifest } from './manifest.js';
import { createSwarmWorktree } from './worktree.js';
import { buildPrompt } from './prompt-builder.js';
import { composeRoleContext } from '../services/context-composer.js';

export class SwarmOrchestrator {
  private config: Config;
  private manifest: SwarmManifest;
  private projectRoot: string;
  private tmuxSession: string;
  private worktreePath: string = '';

  constructor(config: Config, manifest: SwarmManifest) {
    this.config = config;
    this.manifest = manifest;
    this.projectRoot = config.projectRoot;
    this.tmuxSession = `swarm-${manifest.session_id}`.slice(0, 50);
  }

  /**
   * Run the full swarm: worktree → tmux session → sequential agents → fan-in.
   */
  async run(): Promise<void> {
    this.ensureTmux();

    // Create single worktree
    console.log(chalk.cyan('Creating swarm worktree...'));
    this.worktreePath = await createSwarmWorktree(
      this.config,
      this.manifest.integration_branch,
      this.manifest.session_id
    );
    console.log(chalk.green(`  ✓ ${this.worktreePath}`));
    console.log(chalk.green(`  ✓ Branch: ${this.manifest.integration_branch}\n`));

    // Save manifest and create agent directories inside the worktree
    await saveManifest(this.worktreePath, this.manifest);

    // Create tmux session (detached — user will attach)
    this.createTmuxSession();

    console.log(chalk.cyan(`  tmux session: ${chalk.bold(this.tmuxSession)}`));
    console.log(chalk.cyan(`  Attach in another terminal: ${chalk.bold(`tmux attach -t ${this.tmuxSession}`)}\n`));

    // Auto-attach in a background child process so user can watch immediately
    this.autoAttach();

    // Execute tiers sequentially
    for (const tier of this.manifest.tiers) {
      await this.executeTier(tier);
    }

    // Fan-in
    await this.fanIn();

    // Clean up tmux session
    this.killTmuxSession();
  }

  /**
   * Execute all agents in a tier sequentially, each in the tmux session.
   */
  private async executeTier(tier: TierConfig): Promise<void> {
    this.tmuxSendStatus(`── Tier ${tier.tier} ──`);

    for (const agent of tier.agents) {
      await this.executeAgent(agent, tier.tier);
    }
  }

  /**
   * Run a single agent in the tmux session and wait for it to complete.
   */
  private async executeAgent(agent: AgentConfig, tierNum: number): Promise<void> {
    // Compose role context
    const composed = await composeRoleContext(this.config, agent.role);

    // Build prompt — paths are relative to the worktree so the agent can find them
    const prompt = buildPrompt(
      agent,
      this.manifest,
      this.worktreePath,
      tierNum,
      composed.composedPrompt
    );

    // Write PROMPT.md to swarm agent dir inside the worktree for audit trail
    const agentDir = getAgentDir(this.worktreePath, this.manifest.session_id, tierNum, agent.role);
    await fs.ensureDir(agentDir);
    await fs.writeFile(path.join(agentDir, 'PROMPT.md'), prompt, 'utf-8');

    // Write prompt to a temp file in the agent dir (avoids shell escaping issues with long prompts)
    const promptFile = path.join(agentDir, '.prompt.txt');
    await fs.writeFile(promptFile, prompt, 'utf-8');

    // Build the CLI command to run in tmux
    const cliCmd = this.buildCliCommand(promptFile);
    const channel = `${this.tmuxSession}-${agent.role}`;

    // Display header in tmux pane
    this.tmuxSendKeys(`echo ""`);
    this.tmuxSendKeys(`echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"`);
    this.tmuxSendKeys(`echo "  Agent: ${agent.role}  |  Tier ${tierNum}"`);
    this.tmuxSendKeys(`echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"`);
    this.tmuxSendKeys(`echo ""`);

    // Run agent CLI, then signal completion
    this.tmuxSendKeys(`${cliCmd}; tmux wait-for -S ${channel}`);

    // Block until agent process exits
    console.log(chalk.dim(`  ▸ Running ${agent.role} (Tier ${tierNum})...`));
    try {
      execSync(`tmux wait-for ${channel}`, { stdio: 'ignore' });
    } catch {
      // tmux wait-for can throw if session was killed
      console.log(chalk.yellow(`  ⚠ Agent ${agent.role} — tmux session interrupted`));
      return;
    }

    console.log(chalk.green(`  ✓ ${agent.role} completed`));

    // Clean up temp prompt file
    await fs.remove(promptFile);
  }

  /**
   * Build the shell command to launch the CLI with the prompt from a file.
   */
  private buildCliCommand(promptFile: string): string {
    const cli = this.config.defaultCli;

    // Read prompt from file via subshell to avoid arg length limits
    switch (cli) {
      case 'claude':
        return `claude "$(cat '${promptFile}')"`;
      case 'codex':
        return `codex "$(cat '${promptFile}')"`;
      case 'gemini':
        return `gemini -i "$(cat '${promptFile}')"`;
      case 'cursor-agent':
        return `cursor-agent "$(cat '${promptFile}')"`;
      default:
        return `${cli} "$(cat '${promptFile}')"`;
    }
  }

  /**
   * Collect all handoffs and write SWARM_SUMMARY.md.
   */
  private async fanIn(): Promise<void> {
    const swarmDir = getSwarmDir(this.worktreePath, this.manifest.session_id);

    const summaryParts: string[] = [];
    summaryParts.push(`# Swarm Summary: ${this.manifest.session_id}\n`);
    summaryParts.push(`**Task:** ${this.manifest.task}\n`);
    summaryParts.push(`**Completed:** ${new Date().toISOString()}\n`);

    for (const tier of this.manifest.tiers) {
      summaryParts.push(`\n## Tier ${tier.tier}\n`);

      for (const agent of tier.agents) {
        const agentDir = getAgentDir(
          this.worktreePath,
          this.manifest.session_id,
          tier.tier,
          agent.role
        );

        summaryParts.push(`### ${agent.role}\n`);

        const handoffPath = path.join(agentDir, 'HANDOFF.md');
        if (await fs.pathExists(handoffPath)) {
          summaryParts.push(await fs.readFile(handoffPath, 'utf-8'));
        } else {
          summaryParts.push('_No handoff provided._');
        }

        const outputPath = path.join(agentDir, 'OUTPUT.md');
        if (await fs.pathExists(outputPath)) {
          const output = await fs.readFile(outputPath, 'utf-8');
          summaryParts.push(`\n**Files modified:**\n${output}`);
        }

        summaryParts.push('');
      }
    }

    const summaryContent = summaryParts.join('\n');
    await fs.writeFile(path.join(swarmDir, 'SWARM_SUMMARY.md'), summaryContent, 'utf-8');

    // Print completion
    console.log(chalk.green.bold(`\n${'='.repeat(60)}`));
    console.log(chalk.green.bold(`  Swarm "${this.manifest.session_id}" completed!`));
    console.log(chalk.green.bold(`${'='.repeat(60)}\n`));

    console.log(chalk.cyan('  Next steps:'));
    console.log(chalk.dim(`    Review work:   cd ${this.worktreePath}`));
    console.log(chalk.dim(`    View summary:  cat ${path.join(swarmDir, 'SWARM_SUMMARY.md')}`));
    console.log(chalk.dim(`    Open a PR:     gh pr create --head ${this.manifest.integration_branch}`));
    console.log();
  }

  // ── tmux helpers ─────────────────────────────────────────────

  /**
   * Ensure tmux is installed.
   */
  private ensureTmux(): void {
    try {
      execSync('which tmux', { stdio: 'ignore' });
    } catch {
      throw new Error(
        'tmux is required for create-swarm. Install it with: brew install tmux (macOS) or apt install tmux (Linux)'
      );
    }
  }

  /**
   * Create a detached tmux session pointing at the worktree directory.
   */
  private createTmuxSession(): void {
    try {
      execSync(`tmux kill-session -t ${this.tmuxSession} 2>/dev/null`, { stdio: 'ignore' });
    } catch {
      // Session didn't exist, that's fine
    }

    execSync(`tmux new-session -d -s ${this.tmuxSession} -c '${this.worktreePath}'`);
  }

  /**
   * Send keystrokes to the tmux session's active pane.
   */
  private tmuxSendKeys(command: string): void {
    execSync(`tmux send-keys -t ${this.tmuxSession} ${this.shellEscape(command)} Enter`);
  }

  /**
   * Display a status message in the tmux pane.
   */
  private tmuxSendStatus(message: string): void {
    this.tmuxSendKeys(`echo "\\n${message}\\n"`);
  }

  /**
   * Spawn a background process that attaches the user's terminal to the tmux session.
   * Uses the parent process's stdio so the user sees the tmux UI.
   */
  private autoAttach(): void {
    const child = nodeSpawn('tmux', ['attach', '-t', this.tmuxSession], {
      stdio: 'inherit',
      detached: true,
    });
    child.unref();
  }

  /**
   * Kill the tmux session.
   */
  private killTmuxSession(): void {
    try {
      execSync(`tmux kill-session -t ${this.tmuxSession}`, { stdio: 'ignore' });
    } catch {
      // Ignore
    }
  }

  /**
   * Escape a string for safe use in a tmux send-keys command.
   */
  private shellEscape(str: string): string {
    return `'${str.replace(/'/g, "'\\''")}'`;
  }
}
