import fs from 'fs-extra';
import path from 'path';
import { homedir } from 'os';
import { A1RcFile, Config } from './types.js';
import {
  A1_RC_FILENAME,
  buildConfig,
  findProjectRoot,
  ResolvedProject,
} from './resolver.js';

/**
 * Legacy global config location — no longer read. Retained here so `a1 init`
 * can clean it up if it exists.
 */
const LEGACY_GLOBAL_CONFIG = path.join(homedir(), '.config', 'a1', 'config.json');

/**
 * Resolve the project-local config by walking up from `cwd`. Returns null if
 * no project marker is found (e.g. user hasn't run `a1 init`).
 */
export async function loadConfig(cwd: string = process.cwd()): Promise<Config | null> {
  const resolved = await findProjectRoot(cwd);
  if (!resolved || !resolved.rc) {
    // Either no marker at all, or only a package.json a1 dep with no rc file.
    return null;
  }
  return buildConfig(resolved);
}

/**
 * True if a `.a1rc.json` is reachable from `cwd` by walking up.
 */
export async function configExists(cwd: string = process.cwd()): Promise<boolean> {
  const resolved = await findProjectRoot(cwd);
  return Boolean(resolved && resolved.rc);
}

/**
 * Returns the resolved project, even when the rc file is missing — useful for
 * commands like `a1 init` that need to know where to write.
 */
export async function resolveProject(
  cwd: string = process.cwd()
): Promise<ResolvedProject | null> {
  return findProjectRoot(cwd);
}

/**
 * Write `.a1rc.json` at `projectRoot`.
 */
export async function writeRc(projectRoot: string, rc: A1RcFile): Promise<string> {
  const rcPath = path.join(projectRoot, A1_RC_FILENAME);
  await fs.writeFile(rcPath, JSON.stringify(rc, null, 2) + '\n', 'utf-8');
  return rcPath;
}

/**
 * Read `.a1rc.json` directly from a known project root (no walk-up).
 * Returns null if missing.
 */
export async function readRcAt(projectRoot: string): Promise<A1RcFile | null> {
  const rcPath = path.join(projectRoot, A1_RC_FILENAME);
  if (!(await fs.pathExists(rcPath))) return null;
  const raw = await fs.readFile(rcPath, 'utf-8');
  return JSON.parse(raw) as A1RcFile;
}

export function getRcPath(projectRoot: string): string {
  return path.join(projectRoot, A1_RC_FILENAME);
}

/**
 * Delete the legacy `~/.config/a1/config.json` if it exists. Returns true if
 * something was removed. Global roles/skills directories are NOT touched.
 */
export async function removeLegacyGlobalConfig(): Promise<boolean> {
  if (await fs.pathExists(LEGACY_GLOBAL_CONFIG)) {
    await fs.remove(LEGACY_GLOBAL_CONFIG);
    return true;
  }
  return false;
}

export function getLegacyGlobalConfigPath(): string {
  return LEGACY_GLOBAL_CONFIG;
}
