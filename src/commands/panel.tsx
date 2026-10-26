import React from 'react';
import { render } from 'ink';
import chalk from 'chalk';
import { loadConfig } from '../config/manager.js';
import { ForumClient } from '../services/forum/mcp-client.js';
import { App } from '../panel/App.js';

export async function panelCommand(): Promise<void> {
  const config = await loadConfig();
  if (!config) {
    console.error(chalk.red('Error: Not initialized. Run "a1 init" first.'));
    process.exit(1);
  }
  let client: ForumClient;
  try {
    client = await ForumClient.connect(config);
  } catch (error) {
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
  // Full-screen: alternate buffer, restored on exit
  process.stdout.write('\x1b[?1049h');
  const app = render(<App config={config} client={client} />, { exitOnCtrlC: true });
  await app.waitUntilExit();
  process.stdout.write('\x1b[?1049l');
}
