import fs from 'fs-extra';
import { randomUUID } from 'crypto';
import { ForumClient, ForumToolError } from './mcp-client.js';
import { DRAFTS_FILE, FORUM_DIR } from './paths.js';
import { Draft } from './types.js';

const KEEP_DONE_MS = 7 * 24 * 60 * 60_000;

export async function readDrafts(): Promise<Draft[]> {
  return (await fs.readJson(DRAFTS_FILE).catch(() => [])) as Draft[];
}

async function writeDrafts(drafts: Draft[]): Promise<void> {
  await fs.ensureDir(FORUM_DIR);
  const cutoff = new Date(Date.now() - KEEP_DONE_MS).toISOString();
  const kept = drafts.filter((d) => d.status === 'pending' || (d.posted_at ?? d.created_at) >= cutoff);
  // Write-then-rename so an agent appending a draft never sees a half-written file
  const tmp = `${DRAFTS_FILE}.${process.pid}.tmp`;
  await fs.writeJson(tmp, kept, { spaces: 2 });
  await fs.rename(tmp, DRAFTS_FILE);
}

/** Serializes read-modify-write across processes (the panel and several agents share the file). */
async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const lock = `${DRAFTS_FILE}.lock`;
  await fs.ensureDir(FORUM_DIR);
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.mkdir(lock);
      break;
    } catch {
      const stale = await fs.stat(lock).then((s) => Date.now() - s.mtimeMs > 10_000, () => false);
      if (stale) await fs.remove(lock);
      else if (attempt > 100) throw new Error(`Timed out waiting for ${lock}`);
      else await new Promise((r) => setTimeout(r, 50));
    }
  }
  try {
    return await fn();
  } finally {
    await fs.remove(lock);
  }
}

function updateDraft(id: string, patch: Partial<Draft>): Promise<Draft> {
  return withLock(async () => {
    const drafts = await readDrafts();
    const draft = drafts.find((d) => d.id === id);
    if (!draft) throw new Error(`Draft ${id} not found`);
    Object.assign(draft, patch);
    await writeDrafts(drafts);
    return draft;
  });
}

/**
 * Queues a draft. A pending draft from the same source for the same room and thread is
 * replaced, so a re-run of the forum assistant updates its answer instead of stacking copies.
 */
export function addDraft(input: Omit<Draft, 'id' | 'created_at' | 'status'>): Promise<Draft> {
  return withLock(() => addDraftUnlocked(input));
}

async function addDraftUnlocked(input: Omit<Draft, 'id' | 'created_at' | 'status'>): Promise<Draft> {
  const drafts = await readDrafts();
  const draft: Draft = { ...input, id: randomUUID().slice(0, 8), created_at: new Date().toISOString(), status: 'pending' };
  const sameTarget = (d: Draft) =>
    d.status === 'pending' &&
    d.source === draft.source &&
    d.kind === draft.kind &&
    (draft.kind === 'room'
      ? d.room?.name === draft.room?.name
      : draft.kind === 'record'
        ? d.record?.record_uuid === draft.record?.record_uuid && (d.thread_id ?? '') === (draft.thread_id ?? '')
        : d.room_uuid === draft.room_uuid && (d.thread_id ?? '') === (draft.thread_id ?? ''));
  const next = drafts.filter((d) => !sameTarget(d));
  next.push(draft);
  await writeDrafts(next);
  return draft;
}

export async function discardDraft(id: string): Promise<void> {
  await updateDraft(id, { status: 'discarded', posted_at: new Date().toISOString() });
}

/**
 * Posts a draft exactly as written. A reply into a closed thread is not posted: the draft is
 * switched to "continue the closed thread" and kept pending so the user can approve that instead.
 */
export async function postDraft(client: ForumClient, id: string): Promise<Draft> {
  const draft = (await readDrafts()).find((d) => d.id === id);
  if (!draft || draft.status !== 'pending') throw new Error('Draft is no longer pending');

  try {
    if (draft.kind === 'record') {
      if (!draft.record) throw new Error('Record draft has no record');
      await client.execute('create_record_discussion_comment', {
        object_type: draft.record.object_type,
        record_uuid: draft.record.record_uuid,
        body_text: draft.body_text,
        ...(draft.thread_id ? { thread_id: draft.thread_id } : {}),
      });
      return updateDraft(id, { status: 'posted', posted_at: new Date().toISOString(), error: undefined });
    }

    let roomUuid = draft.room_uuid;
    if (draft.kind === 'room') {
      if (!draft.room) throw new Error('Room draft has no room details');
      const room = await client.execute<{ uuid: string }>('create_discussion_room', {
        name: draft.room.name,
        ...(draft.room.description ? { description: draft.room.description } : {}),
        is_global: draft.room.is_global,
      });
      roomUuid = room.uuid;
    }
    if (!roomUuid) throw new Error('Draft has no room');

    if (draft.body_text.trim()) {
      await client.execute('create_discussion_room_comment', {
        uuid: roomUuid,
        body_text: draft.body_text,
        ...(draft.thread_id ? { thread_id: draft.thread_id } : {}),
        ...(draft.continues_from_thread_id ? { continues_from_thread_id: draft.continues_from_thread_id } : {}),
      });
    }

    return updateDraft(id, {
      status: 'posted',
      posted_at: new Date().toISOString(),
      posted_room_uuid: roomUuid,
      error: undefined,
    });
  } catch (error) {
    const code = (error instanceof ForumToolError && (error.payload as { errors?: { code?: string } })?.errors?.code) || '';
    if (code === 'thread_closed' && draft.thread_id) {
      await updateDraft(id, {
        thread_id: undefined,
        continues_from_thread_id: draft.thread_id,
        error: 'Thread is closed. Nothing was posted. Press p again to post it as a new thread continuing it.',
      });
    } else {
      await updateDraft(id, { error: error instanceof Error ? error.message : String(error) });
    }
    throw error;
  }
}
