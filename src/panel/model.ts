import { ForumFeed, FeedSnapshot } from '../services/forum/feed.js';
import { Inbox, InboxItem } from '../services/forum/inbox.js';
import { Draft, ForumNotification, RoomActivity } from '../services/forum/types.js';
import { HiddenEntry, RoomSummary, isHidden } from './data.js';
import { firstName, oneLine, prNumberIn, roomKind, shortTitle } from './format.js';

const STALE_DAYS = 14;

export type SectionId = 'needs' | 'post' | 'triage' | 'fyi';
export type Group = 'reviews' | 'threads' | 'logs';

export const SECTION_LABEL: Record<SectionId, string> = {
  needs: 'NEEDS YOU',
  post: 'TO POST',
  triage: 'AI TRIAGE',
  fyi: 'FYI · LAST 24H',
};

const GROUP_ORDER: Group[] = ['reviews', 'threads', 'logs'];
const GROUP_OF = { rev: 'reviews', thr: 'threads', err: 'logs' } as const;

export type ItemSource =
  | { kind: 'notification'; item: ForumNotification; triage?: InboxItem }
  | { kind: 'draft'; item: Draft }
  | { kind: 'triage'; item: InboxItem }
  | { kind: 'activity'; item: RoomActivity };

export interface ListItem {
  key: string;
  section: SectionId;
  group?: Group;
  /** @me · box · rev · thr · err · post · ai */
  tag: string;
  at?: string;
  title: string;
  flag?: 'high' | 'stale' | 'error';
  from: string;
  newCount: number | null;
  roomUuid?: string;
  roomName: string;
  threadId?: string;
  record?: { objectType: string; recordUuid: string; number?: string };
  pr?: number;
  summary?: RoomSummary;
  /** what "done" compares against: the item reappears when this changes */
  marker: string;
  source: ItemSource;
}

export interface Model {
  items: ListItem[];
  counts: Record<SectionId, number>;
}

export function buildModel(input: {
  feed: ForumFeed;
  snapshot: FeedSnapshot | null;
  inbox: Inbox;
  drafts: Draft[];
  summaries: Record<string, RoomSummary>;
  hidden: Record<string, HiddenEntry>;
  filter: string;
}): Model {
  const { feed, snapshot, inbox, drafts, summaries, hidden } = input;
  const items: ListItem[] = [];
  const activityByRoom = new Map((snapshot?.activity ?? []).map((a) => [a.roomUuid, a]));
  const triageByThread = new Map(inbox.items.filter((i) => i.threadId).map((i) => [i.threadId!, i]));
  const staleBefore = new Date(Date.now() - STALE_DAYS * 86400_000).toISOString();

  // NEEDS YOU: unread notifications, newest first
  const needsRooms = new Set<string>();
  for (const n of snapshot?.notifications ?? []) {
    const roomUuid = n.room.uuid ?? undefined;
    const roomName = roomUuid
      ? feed.roomName(roomUuid)
      : `${n.room.object_type ?? 'record'} ${n.room.record_number ?? ''}`.trim();
    const summary = roomUuid ? summaries[roomUuid] : undefined;
    const activity = roomUuid ? activityByRoom.get(roomUuid) : undefined;
    const inThread = activity?.comments.filter((c) => c.thread_id === n.thread_id).length;
    if (roomUuid) needsRooms.add(roomUuid);
    const body = n.preview?.body_text ?? '';
    items.push({
      key: `n:${n.id}`,
      section: 'needs',
      tag: n.room.kind === 'record_discussion' ? (n.room.object_type === 'container' ? 'box' : n.room.object_type?.slice(0, 3) ?? 'rec') : feed.mentionsMe(body) ? '@me' : roomKind(roomName),
      at: n.notified_at,
      title: summary?.title ?? (n.room.kind === 'record_discussion' ? `${capitalize(n.room.object_type ?? 'record')} ${n.room.record_number ?? ''}` : shortTitle(roomName)),
      flag: summary?.priority === 'high' ? 'high' : n.notified_at < staleBefore ? 'stale' : undefined,
      from: firstName(n.preview?.author?.name),
      newCount: inThread || null,
      roomUuid,
      roomName,
      threadId: n.thread_id,
      record:
        n.room.kind === 'record_discussion' && n.room.object_type && n.room.record_uuid
          ? { objectType: n.room.object_type, recordUuid: n.room.record_uuid, number: n.room.record_number ?? undefined }
          : undefined,
      // Message text names other PRs in passing; only review rooms take their PR from it
      pr: prNumberIn(summary?.title, roomName, roomKind(roomName) === 'rev' ? body : undefined),
      summary,
      marker: n.notified_at,
      source: { kind: 'notification', item: n, triage: triageByThread.get(n.thread_id) },
    });
  }

  // TO POST: drafts waiting for approval
  for (const d of drafts.filter((x) => x.status === 'pending')) {
    const roomName = d.kind === 'room' ? (d.room?.name ?? d.title) : d.kind === 'record' ? `record ${d.record?.number ?? ''}` : feed.roomName(d.room_uuid);
    items.push({
      key: `d:${d.id}`,
      section: 'post',
      tag: 'post',
      at: d.created_at,
      title: d.kind === 'room' ? `new · ${shortTitle(d.title)}` : `reply · ${shortTitle(roomName)}`,
      flag: d.error ? 'error' : undefined,
      from: d.source.replace(/^a1:/, ''),
      newCount: null,
      roomUuid: d.room_uuid ?? d.posted_room_uuid,
      roomName,
      threadId: d.thread_id,
      pr: prNumberIn(d.title, d.body_text),
      marker: d.id,
      source: { kind: 'draft', item: d },
    });
  }

  // AI TRIAGE: the forum assistant's open items not already shown above
  const notifiedThreads = new Set((snapshot?.notifications ?? []).map((n) => n.thread_id));
  const draftThreads = new Set(drafts.filter((d) => d.status === 'pending' && d.thread_id).map((d) => d.thread_id!));
  inbox.items.forEach((t, i) => {
    if (t.section === 'Needs you' || t.section === 'Ready to post') return;
    if (t.threadId && (notifiedThreads.has(t.threadId) || draftThreads.has(t.threadId))) return;
    const roomUuid = t.roomPrefix ? feed.resolveRoomPrefix(t.roomPrefix) : undefined;
    items.push({
      key: `t:${i}:${t.title}`,
      section: 'triage',
      tag: 'ai',
      at: inbox.mtime?.toISOString(),
      title: `${t.text.includes('✦') ? '✦ ' : ''}${oneLine(t.title)}`,
      from: t.section.replace(/^Needs /, ''),
      newCount: null,
      roomUuid,
      roomName: roomUuid ? feed.roomName(roomUuid) : t.title,
      threadId: t.threadId,
      pr: prNumberIn(t.title, t.text),
      summary: roomUuid ? summaries[roomUuid] : undefined,
      marker: t.text,
      source: { kind: 'triage', item: t },
    });
  });

  // FYI: rooms with new comments, grouped reviews / threads / logs
  const fyi = (snapshot?.activity ?? [])
    .filter((a) => !needsRooms.has(a.roomUuid))
    .map((a): ListItem => {
      const last = a.comments[a.comments.length - 1];
      const kind = roomKind(a.roomName);
      const summary = summaries[a.roomUuid];
      return {
        key: `a:${a.roomUuid}`,
        // Anything addressed to the user belongs in NEEDS YOU, even without an unread notification
        section: a.mentionsMe ? 'needs' : 'fyi',
        group: a.mentionsMe ? undefined : GROUP_OF[kind],
        tag: a.mentionsMe ? '@me' : kind,
        at: a.lastAt,
        title: summary?.title ?? shortTitle(a.roomName),
        flag: summary?.priority === 'high' ? 'high' : undefined,
        from: firstName(last.author?.name),
        newCount: a.comments.length,
        roomUuid: a.roomUuid,
        roomName: a.roomName,
        threadId: last.thread_id,
        pr: prNumberIn(summary?.title, a.roomName, kind === 'rev' ? last.body_text : undefined),
        summary,
        marker: a.lastAt,
        source: { kind: 'activity', item: a },
      };
    })
    .sort((x, y) => GROUP_ORDER.indexOf(x.group!) - GROUP_ORDER.indexOf(y.group!) || (y.at ?? '').localeCompare(x.at ?? ''));
  items.push(...fyi.filter((it) => it.section === 'fyi'));
  // Mentions found in activity join the notifications, newest first
  const mentioned = fyi.filter((it) => it.section === 'needs');
  const firstNonNeeds = items.findIndex((it) => it.section !== 'needs');
  items.splice(firstNonNeeds === -1 ? items.length : firstNonNeeds, 0, ...mentioned);
  const needs = items.filter((it) => it.section === 'needs').sort((x, y) => (y.at ?? '').localeCompare(x.at ?? ''));
  items.splice(0, needs.length, ...needs);

  const query = input.filter.trim().toLowerCase();
  const visible = items.filter(
    (it) =>
      (it.section === 'post' || !isHidden(hidden, it.key, it.marker)) &&
      (!query || `${it.title} ${it.roomName} ${it.from} ${it.tag}`.toLowerCase().includes(query))
  );

  const counts = { needs: 0, post: 0, triage: 0, fyi: 0 } as Record<SectionId, number>;
  for (const it of visible) counts[it.section]++;
  return { items: visible, counts };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
}
