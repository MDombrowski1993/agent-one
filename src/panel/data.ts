import fs from 'fs-extra';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { ForumClient } from '../services/forum/mcp-client.js';
import { PANEL_DIR } from '../services/forum/paths.js';
import { ForumComment } from '../services/forum/types.js';

const execFileAsync = promisify(execFile);

export const SUMMARIES_FILE = path.join(PANEL_DIR, 'summaries.json');
const HIDDEN_FILE = path.join(PANEL_DIR, 'hidden.json');
const PR_TTL_MS = 2 * 60_000;
const THREAD_TTL_MS = 60_000;

// --- AI summaries (written by the headless forum-assistant check) ---

export interface RoomSummary {
  title?: string;
  ask?: string;
  what?: string;
  risk?: string;
  done?: string;
  priority?: 'high' | 'normal';
  updated_at?: string;
}

export async function readSummaries(): Promise<Record<string, RoomSummary>> {
  // Written by an agent: tolerate a missing or malformed file
  return ((await fs.readJson(SUMMARIES_FILE).catch(() => ({}))) ?? {}) as Record<string, RoomSummary>;
}

// --- Done / snoozed items (panel-local; nothing is marked read on the forum) ---

export interface HiddenEntry {
  /** snoozed until */
  until?: string;
  /** done: stays hidden while the item's marker (notified_at, last comment, text) is unchanged */
  marker?: string;
}

export async function readHidden(): Promise<Record<string, HiddenEntry>> {
  return (await fs.readJson(HIDDEN_FILE).catch(() => ({}))) as Record<string, HiddenEntry>;
}

export async function hideItem(key: string, entry: HiddenEntry): Promise<void> {
  const hidden = await readHidden();
  hidden[key] = entry;
  const now = new Date().toISOString();
  // Expired snoozes are dropped; done markers are kept (they are small)
  const kept = Object.fromEntries(Object.entries(hidden).filter(([, e]) => !e.until || e.until > now));
  await fs.ensureDir(PANEL_DIR);
  await fs.writeJson(HIDDEN_FILE, kept, { spaces: 2 });
}

export function isHidden(hidden: Record<string, HiddenEntry>, key: string, marker: string): boolean {
  const entry = hidden[key];
  if (!entry) return false;
  if (entry.until) return entry.until > new Date().toISOString();
  return entry.marker === marker;
}

// --- Pull request status via gh ---

export interface PrInfo {
  number: number;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  head: string;
  review: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | '' | null;
  ci: 'pass' | 'fail' | 'pending' | 'none';
  bugbot: 'pass' | 'fail' | 'pending' | 'none';
  repo: string;
}

type Check = { name?: string; context?: string; conclusion?: string | null; state?: string | null; status?: string };

function rollup(checks: Check[]): PrInfo['ci'] {
  const relevant = checks.filter((c) => !['SKIPPED', 'NEUTRAL'].includes(String(c.conclusion ?? c.state)));
  if (relevant.length === 0) return 'none';
  const outcome = (c: Check) => String(c.conclusion || c.state || c.status || 'PENDING');
  if (relevant.some((c) => ['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED'].includes(outcome(c)))) return 'fail';
  if (relevant.some((c) => !['SUCCESS'].includes(outcome(c)))) return 'pending';
  return 'pass';
}

const prCache = new Map<number, { at: number; info: PrInfo | null }>();

export async function fetchPr(number: number, repo = 'gnosisfreight/valhalla'): Promise<PrInfo | null> {
  const cached = prCache.get(number);
  if (cached && Date.now() - cached.at < PR_TTL_MS) return cached.info;
  try {
    const { stdout } = await execFileAsync(
      'gh',
      ['pr', 'view', String(number), '-R', repo, '--json', 'number,state,headRefOid,reviewDecision,statusCheckRollup'],
      { timeout: 15_000 }
    );
    const pr = JSON.parse(stdout) as {
      number: number;
      state: PrInfo['state'];
      headRefOid: string;
      reviewDecision: PrInfo['review'];
      statusCheckRollup: Check[];
    };
    const checks = pr.statusCheckRollup ?? [];
    const info: PrInfo = {
      number: pr.number,
      state: pr.state,
      head: pr.headRefOid.slice(0, 9),
      review: pr.reviewDecision,
      ci: rollup(checks.filter((c) => !/bugbot/i.test(c.name ?? c.context ?? ''))),
      bugbot: rollup(checks.filter((c) => /bugbot/i.test(c.name ?? c.context ?? ''))),
      repo: repo.split('/')[1],
    };
    prCache.set(number, { at: Date.now(), info });
    return info;
  } catch {
    prCache.set(number, { at: Date.now(), info: null });
    return null;
  }
}

// --- Full thread history for the detail pane ---

const threadCache = new Map<string, { at: number; comments: ForumComment[] }>();

export type ThreadTarget =
  | { kind: 'room'; roomUuid: string }
  | { kind: 'record'; objectType: string; recordUuid: string };

export async function fetchRoomComments(client: ForumClient, target: ThreadTarget): Promise<ForumComment[]> {
  const key = target.kind === 'room' ? target.roomUuid : `${target.objectType}:${target.recordUuid}`;
  const cached = threadCache.get(key);
  if (cached && Date.now() - cached.at < THREAD_TTL_MS) return cached.comments;
  const result =
    target.kind === 'room'
      ? await client.execute<{ items?: ForumComment[] } | ForumComment[]>('list_discussion_room_comments', { uuid: target.roomUuid })
      : await client.execute<{ items?: ForumComment[] } | ForumComment[]>('list_record_discussion_comments', {
          object_type: target.objectType,
          record_uuid: target.recordUuid,
        });
  const comments = Array.isArray(result) ? result : (result.items ?? []);
  threadCache.set(key, { at: Date.now(), comments });
  return comments;
}
