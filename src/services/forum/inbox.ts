import fs from 'fs-extra';
import { INBOX_FILE } from './paths.js';

/** Sections of the forum assistant's INBOX.md worth acting on, in display order. */
export const INBOX_SECTIONS = [
  'Needs you',
  'Ready to post',
  'Needs investigation',
  'Needs work (global)',
  'Needs work (tenant)',
] as const;

export interface InboxItem {
  section: string;
  /** the bold title, or the first line when there is none */
  title: string;
  text: string;
  roomPrefix?: string;
  threadId?: string;
}

export interface Inbox {
  items: InboxItem[];
  /** the trailing "_Last checked …_" line */
  lastChecked?: string;
  mtime?: Date;
}

/**
 * Parses the forum assistant's INBOX.md. Items are `- ` or `1. ` lines plus their indented
 * continuation lines; `_None …_` placeholders are skipped.
 */
export async function readInbox(): Promise<Inbox> {
  if (!(await fs.pathExists(INBOX_FILE))) return { items: [] };
  const [raw, stat] = await Promise.all([fs.readFile(INBOX_FILE, 'utf-8'), fs.stat(INBOX_FILE)]);

  const items: InboxItem[] = [];
  let section = '';
  let current: string[] | null = null;
  let lastChecked: string | undefined;

  const flush = () => {
    if (current && (INBOX_SECTIONS as readonly string[]).includes(section)) {
      items.push(toItem(section, current.join('\n')));
    }
    current = null;
  };

  for (const line of raw.split('\n')) {
    const heading = line.match(/^##\s+(.*)$/);
    if (heading) {
      flush();
      section = heading[1].trim();
      continue;
    }
    const checked = line.match(/^_(Last checked.*)_\s*$/);
    if (checked) {
      flush();
      lastChecked = checked[1];
      continue;
    }
    if (/^(- |\d+\. )/.test(line)) {
      flush();
      current = [line.replace(/^(- |\d+\. )/, '')];
    } else if (current && /^\s+\S/.test(line)) {
      current.push(line.trim());
    } else if (current && line.trim() === '') {
      flush();
    }
  }
  flush();

  return { items, lastChecked, mtime: stat.mtime };
}

function toItem(section: string, text: string): InboxItem {
  const title = text.match(/\*\*(.+?)\*\*/)?.[1] ?? text.split('\n')[0].slice(0, 80);
  return {
    section,
    title,
    text,
    roomPrefix: text.match(/room `([0-9a-f-]+)…?`/)?.[1],
    threadId: text.match(/thread `(th_[\w-]+)`/)?.[1],
  };
}
