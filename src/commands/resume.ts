import chalk from 'chalk';
import fs from 'fs-extra';
import { loadConfig } from '../config/manager.js';
import { CliTool } from '../config/types.js';
import { getSessionPath } from '../services/session.js';
import { composeAlwaysOnContext } from '../services/context-composer.js';
import { launchCLI } from '../services/cli-launcher.js';
import { readActivity } from '../services/activity.js';

/** Reopens an existing session's worktree and continues its last conversation (Claude), or starts a fresh one. */
export async function resumeCommand(sessionName: string, options: { cli?: CliTool }): Promise<void> {
  const config = await loadConfig();
  if (!config) {
    console.error(chalk.red('Error: Not initialized. Run "a1 init" first.'));
    process.exit(1);
  }
  const sessionPath = getSessionPath(config, sessionName);
  if (!(await fs.pathExists(sessionPath))) {
    console.error(chalk.red(`Error: No session at ${sessionPath}. Start one with: a1 create ${sessionName}`));
    process.exit(1);
  }

  const cliTool = options.cli || config.defaultCli;
  const claudeSession = readActivity(sessionName)?.claude_session_id;
  console.log(chalk.cyan(`Resuming ${sessionName} in ${sessionPath}`));

  process.env.A1_SESSION = sessionName;
  // A resumed Claude conversation already holds the always-on context; other CLIs start fresh and need it
  const context = cliTool === 'claude' ? undefined : (await composeAlwaysOnContext(config)).composedPrompt || undefined;
  const exitCode = await launchCLI(cliTool, sessionPath, context, config, {
    resume: cliTool === 'claude' ? (claudeSession ?? true) : undefined,
  });
  if (process.env.A1_PANEL) console.log(chalk.dim('  Session ended. Press r in a1 panel to resume it.'));
  process.exit(exitCode);
}
