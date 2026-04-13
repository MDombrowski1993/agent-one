import fs from 'fs-extra';
import path from 'path';
import { homedir } from 'os';
import { Config } from './types.js';

const CONFIG_DIR = path.join(homedir(), '.config', 'a1');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export async function ensureConfigDir(): Promise<void> {
  await fs.ensureDir(CONFIG_DIR);
}

export async function configExists(): Promise<boolean> {
  return fs.pathExists(CONFIG_FILE);
}

export async function loadConfig(): Promise<Config | null> {
  if (!(await configExists())) {
    return null;
  }

  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf-8');
    return JSON.parse(data) as Config;
  } catch (error) {
    throw new Error(`Failed to load config: ${error}`);
  }
}

export async function saveConfig(config: Config): Promise<void> {
  await ensureConfigDir();

  try {
    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  } catch (error) {
    throw new Error(`Failed to save config: ${error}`);
  }
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}
