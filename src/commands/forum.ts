import chalk from 'chalk';
import fs from 'fs-extra';
import { loadConfig } from '../config/manager.js';
import { Config } from '../config/types.js';
import { addDraft, readDrafts } from '../services/forum/drafts.js';
import { currentSessionName, writeSessionStatus } from '../services/forum/sessions.js';
import { SessionState } from '../services/forum/types.js';

const STATES: SessionState[] = ['starting', 'working', 'blocked', 'review', 'done', 'ended'];

async function requireConfig(): Promise<Config> {
  const config = await loadConfig();
  if (!config) {
    console.error(chalk.red('Error: Not initialized. Run "a1 init" first.'));
    process.exit(1);
  }
  return config;
}

export interface ForumStatusOptions {
  session?: string;
  state?: string;
  summary?: string;
  pr?: string;
  linear?: string;
  room?: string[];
}

export async function forumStatusCommand(options: ForumStatusOptions): Promise<void> {
  const config = await requireConfig();
  const session = options.session ?? currentSessionName(config);
  if (!session) {
    console.error(chalk.red('Error: not inside an a1 session. Pass --session <name>.'));
    process.exit(1);
  }
  if (options.state && !STATES.includes(options.state as SessionState)) {
    console.error(chalk.red(`Error: --state must be one of ${STATES.join(', ')}`));
    process.exit(1);
  }

  const status = await writeSessionStatus(config, session, {
    ...(options.state ? { state: options.state as SessionState } : {}),
    ...(options.summary ? { summary: options.summary } : {}),
    ...(options.pr ? { pr: options.pr.replace(/^#/, '') } : {}),
    ...(options.linear ? { linear: options.linear } : {}),
    ...(options.room ? { rooms: options.room } : {}),
  });
  console.log(chalk.green(`✓ ${status.session}: ${status.state}${status.summary ? ` · ${status.summary}` : ''}`));
}

export interface ForumDraftOptions {
  room?: string;
  thread?: string;
  newRoom?: string;
  description?: string;
  tenant?: boolean;
  title?: string;
  body?: string;
  bodyFile?: string;
  source?: string;
}

export async function forumDraftCommand(options: ForumDraftOptions): Promise<void> {
  const config = await requireConfig();
  const body = options.bodyFile ? await fs.readFile(options.bodyFile, 'utf-8') : (options.body ?? '');

  if (!options.room && !options.newRoom) {
    console.error(chalk.red('Error: pass --room <uuid> (reply) or --new-room "<title>" (new forum post).'));
    process.exit(1);
  }
  if (options.room && !body.trim()) {
    console.error(chalk.red('Error: a reply needs --body or --body-file.'));
    process.exit(1);
  }
  if (/\bvk_[A-Za-z0-9_-]{8,}/.test(body)) {
    console.error(chalk.red('Error: the draft contains an API key. Remove it.'));
    process.exit(1);
  }

  const session = currentSessionName(config);
  const source = options.source ?? (session ? `a1:${session}` : 'cli');
  const draft = options.newRoom
    ? await addDraft({
        kind: 'room',
        title: options.newRoom,
        body_text: body.trim(),
        room: { name: options.newRoom, description: options.description, is_global: !options.tenant },
        source,
      })
    : await addDraft({
        kind: 'comment',
        title: options.title ?? 'Reply',
        body_text: body.trim(),
        room_uuid: options.room,
        thread_id: options.thread,
        source,
      });

  if (session && draft.kind === 'comment' && draft.room_uuid) {
    await writeSessionStatus(config, session, { rooms: [draft.room_uuid] });
  }
  console.log(chalk.green(`✓ Draft ${draft.id} queued for approval in \`a1 panel\` (nothing was posted)`));
}

export async function forumDraftsCommand(): Promise<void> {
  const pending = (await readDrafts()).filter((d) => d.status === 'pending');
  if (pending.length === 0) {
    console.log(chalk.dim('No pending drafts.'));
    return;
  }
  for (const d of pending) {
    console.log(`${chalk.cyan(d.id)}  ${d.kind === 'room' ? 'new post' : 'reply'}  ${d.title}  ${chalk.dim(d.source)}`);
  }
}
