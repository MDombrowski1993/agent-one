import fs from 'fs-extra';
import path from 'path';
import { Config } from '../../config/types.js';
import { SESSIONS_DIR } from './paths.js';
import { SessionStatus } from './types.js';

export interface SessionView extends SessionStatus {
  /** a worktree exists for it on disk */
  live: boolean;
  /** the session has written a status (a1 create or the agent) */
  reported: boolean;
}

function sessionsRoot(config: Config): string {
  return path.join(config.sessionsBase, path.basename(config.projectRoot));
}

/** The a1 session the current process runs in: `A1_SESSION`, else the session dir under the cwd. */
export function currentSessionName(config: Config, cwd = process.cwd()): string | undefined {
  if (process.env.A1_SESSION) return process.env.A1_SESSION;
  const rel = path.relative(sessionsRoot(config), cwd);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return undefined;
  return rel.split(path.sep)[0];
}

async function readBranch(worktree: string): Promise<string | undefined> {
  // A worktree's .git is a file pointing at its gitdir, whose HEAD names the branch
  try {
    const gitFile = await fs.readFile(path.join(worktree, '.git'), 'utf-8');
    const gitDir = gitFile.match(/^gitdir:\s*(.+)$/m)?.[1]?.trim();
    if (!gitDir) return undefined;
    const head = await fs.readFile(path.join(gitDir, 'HEAD'), 'utf-8');
    return head.match(/^ref: refs\/heads\/(.+)$/m)?.[1]?.trim();
  } catch {
    return undefined;
  }
}

export async function writeSessionStatus(
  config: Config,
  name: string,
  patch: Partial<SessionStatus>
): Promise<SessionStatus> {
  await fs.ensureDir(SESSIONS_DIR);
  const file = path.join(SESSIONS_DIR, `${name}.json`);
  const existing = (await fs.readJson(file).catch(() => ({}))) as Partial<SessionStatus>;
  const worktree = path.join(sessionsRoot(config), name);
  const rooms = [...new Set([...(existing.rooms ?? []), ...(patch.rooms ?? [])])];
  const status: SessionStatus = {
    state: 'working',
    ...existing,
    ...patch,
    session: name,
    path: worktree,
    branch: (await readBranch(worktree)) ?? existing.branch,
    rooms,
    updated_at: new Date().toISOString(),
  };
  await fs.writeJson(file, status, { spaces: 2 });
  return status;
}

/** Every session with a worktree or a status file, most recently updated first. */
export async function listSessionViews(config: Config): Promise<SessionView[]> {
  const root = sessionsRoot(config);
  const dirs = (await fs.readdir(root, { withFileTypes: true }).catch(() => []))
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  const files = (await fs.readdir(SESSIONS_DIR).catch(() => [] as string[]))
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''));

  const names = [...new Set([...dirs, ...files])];
  const views = await Promise.all(
    names.map(async (name): Promise<SessionView> => {
      const status = (await fs.readJson(path.join(SESSIONS_DIR, `${name}.json`)).catch(() => null)) as SessionStatus | null;
      const live = dirs.includes(name);
      const worktree = path.join(root, name);
      const updated_at =
        status?.updated_at ?? (live ? (await fs.stat(worktree)).mtime.toISOString() : new Date(0).toISOString());
      return {
        state: live ? 'working' : 'ended',
        ...status,
        session: name,
        path: worktree,
        branch: live ? ((await readBranch(worktree)) ?? status?.branch) : status?.branch,
        updated_at,
        live,
        reported: Boolean(status),
        // A status file for a removed worktree is history, whatever it last said
        ...(live ? {} : { state: 'ended' as const }),
      };
    })
  );

  return views.sort((a, b) => Number(b.live) - Number(a.live) || b.updated_at.localeCompare(a.updated_at));
}
