import fs from 'fs';
import os from 'os';
import path from 'path';

/** What a Claude Code session is doing, written by its hooks (see hooks/session-hook.ts). */
export type ActivityState = 'starting' | 'working' | 'waiting' | 'permission' | 'ended';

export interface Activity {
  state: ActivityState;
  /** the hook event that set it */
  event: string;
  /** Claude Code's notification text, e.g. "Claude needs your permission to use Bash" */
  message?: string;
  /** Claude Code's conversation id, so a restart resumes this conversation */
  claude_session_id?: string;
  at: string;
}

export const ACTIVITY_DIR = path.join(os.homedir(), '.config', 'a1', 'panel', 'activity');

export function activityFile(session: string): string {
  return path.join(ACTIVITY_DIR, `${session}.json`);
}

export function readActivity(session: string): Activity | undefined {
  try {
    return JSON.parse(fs.readFileSync(activityFile(session), 'utf-8')) as Activity;
  } catch {
    return undefined;
  }
}
