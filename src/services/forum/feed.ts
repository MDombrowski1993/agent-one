import fs from 'fs-extra';
import { ForumClient } from './mcp-client.js';
import { PANEL_DIR, PANEL_STATE_FILE, PROFILE_FILE } from './paths.js';
import { ForumComment, ForumNotification, ForumRoom, RoomActivity } from './types.js';

const ROOMS_TTL_MS = 5 * 60_000;
const ACTIVITY_WINDOW_MS = 24 * 60 * 60_000;
const MAX_PAGES = 5;
const MAX_SEEN = 3000;
const UUID_MENTION = /@([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/g;

/** The user's forum identity from the forum assistant's profile: their name, emails and user uuid. */
async function readIdentity(): Promise<{ uuids: Set<string>; emails: Set<string> }> {
  const profile = await fs.readFile(PROFILE_FILE, 'utf-8').catch(() => '');
  return {
    uuids: new Set(profile.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) ?? []),
    emails: new Set((profile.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? []).map((e) => e.toLowerCase())),
  };
}

interface PanelState {
  last_poll?: string;
  seen_comment_uuids: string[];
  notified_ids: string[];
  /** uuids the user dismissed from the activity list */
  dismissed_rooms: Record<string, string>;
}

export interface FeedSnapshot {
  notifications: ForumNotification[];
  activity: RoomActivity[];
  rooms: Map<string, ForumRoom>;
  /** notifications that appeared since the last poll; the panel alerts on these */
  newNotifications: ForumNotification[];
  newCommentCount: number;
  polledAt: string;
}

async function readState(): Promise<PanelState> {
  const state = (await fs.readJson(PANEL_STATE_FILE).catch(() => ({}))) as Partial<PanelState>;
  return {
    last_poll: state.last_poll,
    seen_comment_uuids: state.seen_comment_uuids ?? [],
    notified_ids: state.notified_ids ?? [],
    dismissed_rooms: state.dismissed_rooms ?? {},
  };
}

async function writeState(state: PanelState): Promise<void> {
  await fs.ensureDir(PANEL_DIR);
  await fs.writeJson(PANEL_STATE_FILE, state, { spaces: 2 });
}

/**
 * Polls the forum without an AI in the loop: unread notifications (what needs the user) plus
 * every comment since the last poll, grouped by room. Triage beyond that is the forum
 * assistant's job; its INBOX.md is shown alongside.
 */
export class ForumFeed {
  private rooms = new Map<string, ForumRoom>();
  private roomsFetchedAt = 0;
  private comments: ForumComment[] = [];
  private people = new Map<string, string>();
  private me: { uuids: Set<string>; emails: Set<string> } = { uuids: new Set(), emails: new Set() };

  constructor(
    private readonly client: ForumClient,
    private readonly ignoreRooms: RegExp[]
  ) {}

  async poll(): Promise<FeedSnapshot> {
    const state = await readState();
    const now = new Date();
    this.me = await readIdentity();

    if (Date.now() - this.roomsFetchedAt > ROOMS_TTL_MS) {
      const rooms = await this.client.execute<ForumRoom[]>('list_discussion_rooms', {});
      this.rooms = new Map(rooms.map((r) => [r.uuid, r]));
      this.roomsFetchedAt = Date.now();
    }

    const notifications = await this.client.execute<{ items: ForumNotification[] }>(
      'list_my_notifications',
      { unread_only: 'true', limit: 50 }
    );

    // A fresh panel (or one with an in-memory gap) reloads the last 24h; otherwise only since the last poll
    const windowStart = new Date(now.getTime() - ACTIVITY_WINDOW_MS).toISOString();
    const since =
      this.comments.length > 0 && state.last_poll && state.last_poll > windowStart
        ? new Date(new Date(state.last_poll).getTime() - 1000).toISOString()
        : windowStart;
    const fetched = await this.fetchComments(since);

    const seen = new Set(state.seen_comment_uuids);
    const known = new Set(this.comments.map((c) => c.uuid));
    let newCommentCount = 0;
    for (const comment of fetched) {
      if (known.has(comment.uuid)) continue;
      this.comments.push(comment);
      known.add(comment.uuid);
      if (!seen.has(comment.uuid)) {
        newCommentCount++;
        seen.add(comment.uuid);
      }
    }
    this.comments = this.comments.filter((c) => c.created_dt >= windowStart);

    for (const author of [...fetched.map((c) => c.author), ...notifications.items.map((n) => n.preview?.author)]) {
      if (!author?.uuid || !author.name) continue;
      this.people.set(author.uuid, author.name);
      if (author.email && this.me.emails.has(author.email.toLowerCase())) this.me.uuids.add(author.uuid);
    }

    const notified = new Set(state.notified_ids);
    const newNotifications = notifications.items.filter((n) => !notified.has(n.id));

    // Re-read dismissals: the user may have dismissed a room while this poll was in flight
    const dismissed = pruneDismissed((await readState()).dismissed_rooms, windowStart);
    await writeState({
      last_poll: now.toISOString(),
      seen_comment_uuids: [...seen].slice(-MAX_SEEN),
      notified_ids: [...new Set([...state.notified_ids, ...newNotifications.map((n) => n.id)])].slice(-500),
      dismissed_rooms: dismissed,
    });

    return {
      notifications: notifications.items,
      activity: this.groupActivity(dismissed),
      rooms: this.rooms,
      newNotifications: state.last_poll ? newNotifications : [],
      newCommentCount: state.last_poll ? newCommentCount : 0,
      polledAt: now.toISOString(),
    };
  }

  roomName(uuid: string | null | undefined): string {
    if (!uuid) return 'Record discussion';
    return this.rooms.get(uuid)?.name ?? `Room ${uuid.slice(0, 8)}`;
  }

  /** Mentions arrive as `@<user uuid>`; show the person's name, and "you" for the user. */
  humanize(text: string): string {
    return text.replace(UUID_MENTION, (match, uuid: string) =>
      this.me.uuids.has(uuid) ? '@you' : this.people.has(uuid) ? `@${this.people.get(uuid)}` : match
    );
  }

  mentionsMe(text: string): boolean {
    const lower = text.toLowerCase();
    return [...this.me.uuids].some((u) => lower.includes(`@${u}`)) || [...this.me.emails].some((e) => lower.includes(`@${e}`));
  }

  /** Expands a truncated `79439599…` room id (as INBOX.md writes them) to the full uuid. */
  resolveRoomPrefix(prefix: string): string | undefined {
    const clean = prefix.replace(/…$/, '');
    const matches = [...this.rooms.keys()].filter((uuid) => uuid.startsWith(clean));
    return matches.length === 1 ? matches[0] : undefined;
  }

  private async fetchComments(since: string): Promise<ForumComment[]> {
    const all: ForumComment[] = [];
    let args: Record<string, unknown> = { since, limit: 500 };
    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await this.client.execute<{ items: ForumComment[]; next_cursor?: string | null }>(
        'list_discussion_comments',
        args
      );
      all.push(...result.items);
      if (!result.next_cursor) break;
      args = { after: result.next_cursor, limit: 500 };
    }
    return all;
  }

  private groupActivity(dismissed: Record<string, string>): RoomActivity[] {
    const byRoom = new Map<string, ForumComment[]>();
    for (const comment of this.comments) {
      const dismissedAt = dismissed[comment.room_uuid];
      if (dismissedAt && comment.created_dt <= dismissedAt) continue;
      const list = byRoom.get(comment.room_uuid) ?? [];
      list.push(comment);
      byRoom.set(comment.room_uuid, list);
    }

    return [...byRoom.entries()]
      .map(([roomUuid, comments]) => {
        const room = this.rooms.get(roomUuid);
        comments.sort((a, b) => a.created_dt.localeCompare(b.created_dt));
        return {
          roomUuid,
          roomName: room?.name ?? `Room ${roomUuid.slice(0, 8)}`,
          scope: room?.scope ?? '?',
          comments,
          lastAt: comments[comments.length - 1].created_dt,
          mentionsMe: comments.some((c) => this.mentionsMe(c.body_text)),
        };
      })
      .filter((a) => !this.ignoreRooms.some((re) => re.test(a.roomName)))
      .sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  }
}

/** Hides a room's current comments from the activity list until someone posts again. */
export async function dismissRoom(roomUuid: string, lastAt: string): Promise<void> {
  const state = await readState();
  state.dismissed_rooms[roomUuid] = lastAt;
  await writeState(state);
}

function pruneDismissed(dismissed: Record<string, string>, windowStart: string): Record<string, string> {
  return Object.fromEntries(Object.entries(dismissed).filter(([, at]) => at >= windowStart));
}
