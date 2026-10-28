import React from 'react';
import { render } from 'ink';
import chalk from 'chalk';
import { loadConfig } from '../config/manager.js';
import { Config } from '../config/types.js';
import { ForumClient } from '../services/forum/mcp-client.js';
import { App } from '../panel/App.js';
import { Manager } from '../manager/Manager.js';
import { hasTmux, launchPanel, stopPanel, tmuxSessionName } from '../manager/tmux.js';

interface PanelOptions {
  /** internal: the session list, run by tmux inside the panel */
  manager?: boolean;
  /** the forum on its own screen, without tmux */
  forum?: boolean;
  stop?: boolean;
}

export async function panelCommand(options: PanelOptions = {}): Promise<void> {
  const config = await loadConfig();
  if (!config) {
    console.error(chalk.red('Error: Not initialized. Run "a1 init" first.'));
    process.exit(1);
  }

  if (options.stop) {
    const stopped = await stopPanel(config);
    console.log(stopped ? `Stopped ${tmuxSessionName(config)} and every session in it.` : 'No panel running for this project.');
    return;
  }
  if (options.manager) return runManager(config);
  if (options.forum || !hasTmux()) {
    if (!options.forum) console.log(chalk.yellow('tmux not found (brew install tmux); opening the forum on its own.'));
    return runForum(config);
  }
  await launchPanel(config);
}

async function connect(config: Config): Promise<ForumClient | null> {
  try {
    return await ForumClient.connect(config);
  } catch {
    return null;
  }
}

async function fullScreen(node: React.ReactElement): Promise<void> {
  // Alternate buffer, restored on exit
  process.stdout.write('\x1b[?1049h');
  const app = render(node, { exitOnCtrlC: true });
  await app.waitUntilExit();
  process.stdout.write('\x1b[?1049l');
}

async function runForum(config: Config): Promise<void> {
  let client: ForumClient;
  try {
    client = await ForumClient.connect(config);
  } catch (error) {
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
  await fullScreen(<App config={config} client={client} />);
}

async function runManager(config: Config): Promise<void> {
  const managerPane = process.env.TMUX_PANE;
  const tmuxSession = process.env.A1_PANEL_TMUX;
  if (!managerPane || !tmuxSession) {
    console.error(chalk.red('a1 panel --manager runs inside the panel; start it with: a1 panel'));
    process.exit(1);
  }
  // The forum is optional: without the MCP the session manager still works
  const client = await connect(config);
  await fullScreen(<Manager config={config} client={client} tmuxSession={tmuxSession} managerPane={managerPane} />);
}
