import path from 'path';
import { homedir } from 'os';

// Shared with the forum-assistant skill, which owns INBOX.md, state.json and profile.md.
// The panel only reads those; everything it writes lives under panel/, drafts.json and sessions/.
export const FORUM_DIR = path.join(homedir(), '.forum-assistant');
export const INBOX_FILE = path.join(FORUM_DIR, 'INBOX.md');
export const PROFILE_FILE = path.join(FORUM_DIR, 'profile.md');
export const DRAFTS_FILE = path.join(FORUM_DIR, 'drafts.json');
export const SESSIONS_DIR = path.join(FORUM_DIR, 'sessions');
export const PANEL_DIR = path.join(FORUM_DIR, 'panel');
export const PANEL_STATE_FILE = path.join(PANEL_DIR, 'state.json');
export const CHECK_LOG_FILE = path.join(PANEL_DIR, 'check.log');
export const HANDOFF_DIR = path.join(PANEL_DIR, 'handoff');

export const APP_URL = 'https://app.gnosisfreight.com';

export function roomUrl(roomUuid: string): string {
  return `${APP_URL}/discussions?uuid=${roomUuid}`;
}
