/**
 * Claude Code hook for a1 sessions: records what the session is doing so `a1 panel` can show it.
 * Runs on every prompt, tool call and stop, so it imports nothing beyond Node built-ins.
 *
 *   node session-hook.js <EventName>   (hook input JSON on stdin)
 */
import fs from 'fs';
import { ACTIVITY_DIR, Activity, ActivityState, activityFile } from '../services/activity.js';

const STATE: Record<string, ActivityState> = {
  SessionStart: 'waiting',
  UserPromptSubmit: 'working',
  PostToolUse: 'working',
  Stop: 'waiting',
  SessionEnd: 'ended',
};

function main(): void {
  const session = process.env.A1_SESSION;
  const event = process.argv[2] ?? '';
  if (!session) return;

  let input: { session_id?: string; message?: string } = {};
  try {
    input = JSON.parse(fs.readFileSync(0, 'utf-8') || '{}');
  } catch {
    // no input is fine
  }

  // Notification covers both "needs your permission" and "waiting for your input"
  const state: ActivityState | undefined =
    event === 'Notification' ? (/permission/i.test(input.message ?? '') ? 'permission' : 'waiting') : STATE[event];
  if (!state) return;

  const activity: Activity = {
    state,
    event,
    ...(event === 'Notification' && input.message ? { message: input.message } : {}),
    ...(input.session_id ? { claude_session_id: input.session_id } : {}),
    at: new Date().toISOString(),
  };
  fs.mkdirSync(ACTIVITY_DIR, { recursive: true });
  const file = activityFile(session);
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(activity));
  fs.renameSync(`${file}.tmp`, file);
}

try {
  main();
} catch {
  // A status hook must never block the session
}
