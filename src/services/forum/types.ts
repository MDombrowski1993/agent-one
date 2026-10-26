export interface ForumAuthor {
  uuid?: string;
  name?: string;
  email?: string;
}

export interface ForumRoom {
  uuid: string;
  name: string;
  scope: 'global' | 'public' | 'private';
  comment_count?: number;
  last_comment_dt?: string | null;
}

export interface ForumComment {
  uuid: string;
  room_uuid: string;
  thread_id: string;
  thread_ref?: string;
  thread_closed?: boolean;
  body_text: string;
  author?: ForumAuthor;
  created_dt: string;
}

export interface ForumNotification {
  id: string;
  notified_at: string;
  read_at: string | null;
  room: {
    kind: 'forum_post' | 'record_discussion';
    uuid: string | null;
    object_type: string | null;
    record_uuid: string | null;
    record_number: string | null;
  };
  thread_id: string;
  preview?: { uuid: string; author?: ForumAuthor; body_text: string; created_dt: string };
}

/** New comments in one room since the panel last looked. */
export interface RoomActivity {
  roomUuid: string;
  roomName: string;
  scope: string;
  comments: ForumComment[];
  lastAt: string;
  /** one of the comments @mentions the user */
  mentionsMe: boolean;
}

export type DraftStatus = 'pending' | 'posted' | 'discarded';

/**
 * A post waiting for approval in the panel. Written by `a1 forum draft` (agents, the
 * forum-assistant check) and posted only when the user presses `p` and confirms.
 */
export interface Draft {
  id: string;
  kind: 'comment' | 'room' | 'record';
  title: string;
  body_text: string;
  /** comment: the room to post in */
  room_uuid?: string;
  /** comment: reply into this thread (th_… or #ref); omitted = the room's main thread */
  thread_id?: string;
  /** comment: start a new thread continuing this closed one */
  continues_from_thread_id?: string;
  /** record: reply on a record's discussion (container, mbl, task, purchase_order, booking) */
  record?: { object_type: string; record_uuid: string; number?: string };
  /** room: create a new forum post; body_text becomes its first comment */
  room?: { name: string; description?: string; is_global: boolean };
  /** forum-assistant | a1:<session> | panel */
  source: string;
  created_at: string;
  status: DraftStatus;
  posted_at?: string;
  posted_room_uuid?: string;
  error?: string;
}

export type SessionState = 'starting' | 'working' | 'blocked' | 'review' | 'done' | 'ended';

/** What an a1 session reports about itself (`a1 forum status`), one file per session. */
export interface SessionStatus {
  session: string;
  path?: string;
  branch?: string;
  state: SessionState;
  summary?: string;
  pr?: string;
  linear?: string;
  rooms?: string[];
  updated_at: string;
}
