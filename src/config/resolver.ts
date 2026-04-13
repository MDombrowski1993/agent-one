import fs from 'fs-extra';
import path from 'path';
import { A1RcFile, Config, CliTool } from './types.js';

export const A1_RC_FILENAME = '.a1rc.json';

export interface ResolvedProject {
  /** Directory containing the project marker (.a1rc.json or package.json with a1 dep). */
  projectRoot: string;
  /** Path to the .a1rc.json file, if one exists. */
  rcPath: string | null;
  /** Parsed .a1rc.json contents, if the file exists. */
  rc: A1RcFile | null;
  /** True if the project root was discovered via package.json a1 dep rather than .a1rc.json. */
  discoveredViaPackageJson: boolean;
}

/**
 * Walk up from `startDir` looking for a project marker.
 *
 * Order of precedence:
 *   1. Nearest ancestor containing `.a1rc.json`
 *   2. Nearest ancestor whose `package.json` lists `agent-one` in deps/devDeps
 *
 * Returns `null` if no marker is found.
 */
export async function findProjectRoot(
  startDir: string = process.cwd()
): Promise<ResolvedProject | null> {
  let current = path.resolve(startDir);
  const root = path.parse(current).root;

  // First pass: look for .a1rc.json (preferred marker)
  let rcMatch: { dir: string; rcPath: string } | null = null;
  // Second pass fallback: nearest package.json with a1 dep
  let pkgMatch: { dir: string } | null = null;

  // Walk up once, recording the first hit of each type
  while (true) {
    const rcPath = path.join(current, A1_RC_FILENAME);
    if (!rcMatch && (await fs.pathExists(rcPath))) {
      rcMatch = { dir: current, rcPath };
      break; // rc file wins outright
    }

    if (!pkgMatch) {
      const pkgPath = path.join(current, 'package.json');
      if (await fs.pathExists(pkgPath)) {
        try {
          const pkg = await fs.readJson(pkgPath);
          const hasA1 =
            (pkg.dependencies && pkg.dependencies['agent-one']) ||
            (pkg.devDependencies && pkg.devDependencies['agent-one']);
          if (hasA1) {
            pkgMatch = { dir: current };
          }
        } catch {
          // malformed package.json — ignore and keep walking
        }
      }
    }

    if (current === root) break;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  if (rcMatch) {
    const rc = await readRc(rcMatch.rcPath);
    return {
      projectRoot: rcMatch.dir,
      rcPath: rcMatch.rcPath,
      rc,
      discoveredViaPackageJson: false,
    };
  }

  if (pkgMatch) {
    return {
      projectRoot: pkgMatch.dir,
      rcPath: null,
      rc: null,
      discoveredViaPackageJson: true,
    };
  }

  return null;
}

async function readRc(rcPath: string): Promise<A1RcFile> {
  const raw = await fs.readFile(rcPath, 'utf-8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse ${A1_RC_FILENAME} at ${rcPath}: ${err}`);
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Invalid ${A1_RC_FILENAME} at ${rcPath}`);
  }
  return parsed as A1RcFile;
}

/**
 * Build the full Config from a resolved project. Derives projectRoot, aiDirectory,
 * and a default sessionsBase. Throws if required fields are missing.
 */
export function buildConfig(resolved: ResolvedProject): Config {
  const { projectRoot, rc, discoveredViaPackageJson } = resolved;

  const defaultCli = rc?.defaultCli as CliTool | undefined;
  if (!defaultCli) {
    if (discoveredViaPackageJson) {
      throw new Error(
        `Found agent-one dependency in package.json at ${projectRoot}, but no ${A1_RC_FILENAME}. Run "a1 init" to create one.`
      );
    }
    throw new Error(
      `${A1_RC_FILENAME} at ${projectRoot} is missing required field "defaultCli".`
    );
  }

  const sessionsBase = rc?.sessionsBase
    ? resolveRelative(projectRoot, rc.sessionsBase)
    : defaultSessionsBase(projectRoot);

  return {
    projectRoot,
    aiDirectory: path.join(projectRoot, '.ai'),
    defaultCli,
    sessionsBase,
  };
}

export function defaultSessionsBase(projectRoot: string): string {
  const parent = path.dirname(projectRoot);
  const name = path.basename(projectRoot);
  return path.join(parent, `${name}-a1-sessions`);
}

function resolveRelative(projectRoot: string, p: string): string {
  if (p.startsWith('~/')) {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    return path.join(home, p.slice(2));
  }
  if (path.isAbsolute(p)) return p;
  return path.resolve(projectRoot, p);
}
