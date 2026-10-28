import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { Config } from '../config/types.js';
import { getSessionPath } from '../services/session.js';
import { isGitRepo } from '../utils/validation.js';
import { activityFile } from '../services/activity.js';
import { HANDOFF_DIR, SESSIONS_DIR } from '../services/forum/paths.js';

const execFileAsync = promisify(execFile);
const PROMPTS_DIR = path.join(os.homedir(), '.config', 'a1', 'panel', 'prompts');

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', cwd, ...args]);
  return stdout.trim();
}

/** What deleting a session would lose, shown before asking. */
export interface DeleteCheck {
  worktree?: string;
  branch?: string;
  /** uncommitted files (`git status --porcelain` lines) */
  dirty: string[];
  /** commits on the branch that no remote has */
  unpushed: number;
}

export async function checkDelete(config: Config, name: string): Promise<DeleteCheck> {
  const worktree = getSessionPath(config, name);
  if (!(await fs.pathExists(worktree))) return { dirty: [], unpushed: 0 };
  if (!(await isGitRepo(config.projectRoot))) return { worktree, dirty: [], unpushed: 0 };
  const [branch, status, unpushed] = await Promise.all([
    git(worktree, 'branch', '--show-current').catch(() => ''),
    git(worktree, 'status', '--porcelain').catch(() => ''),
    git(worktree, 'rev-list', '--count', 'HEAD', '--not', '--remotes').catch(() => '0'),
  ]);
  return { worktree, branch: branch || undefined, dirty: status ? status.split('\n') : [], unpushed: Number(unpushed) || 0 };
}

/**
 * Removes the worktree, and the local branch when every commit on it is on a remote. A branch with
 * unpushed commits is kept, so deleting never loses a commit. Then clears the panel's files for it.
 */
export async function deleteSession(config: Config, name: string, check: DeleteCheck): Promise<string> {
  if (check.worktree) {
    if (await isGitRepo(config.projectRoot)) await git(config.projectRoot, 'worktree', 'remove', '--force', check.worktree);
    else await fs.remove(check.worktree);
  }
  let branchNote = '';
  if (check.branch) {
    if (check.unpushed === 0) {
      await git(config.projectRoot, 'branch', '-D', check.branch).catch(() => {});
    } else branchNote = ` Branch ${check.branch} kept: ${check.unpushed} commit(s) are not on GitHub.`;
  }
  const handoffs = (await fs.readdir(HANDOFF_DIR).catch(() => [] as string[])).filter((f) => f.startsWith(`${name}.`));
  await Promise.all([
    fs.remove(path.join(SESSIONS_DIR, `${name}.json`)),
    fs.remove(activityFile(name)),
    fs.remove(path.join(PROMPTS_DIR, `${name}.md`)),
    ...handoffs.map((f) => fs.remove(path.join(HANDOFF_DIR, f))),
  ]);
  return `Deleted ${name}.${branchNote}`;
}
