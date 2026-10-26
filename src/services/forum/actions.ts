import fs from 'fs-extra';
import path from 'path';
import { spawn, execFile } from 'child_process';
import { promisify } from 'util';
import { Config } from '../../config/types.js';
import { CHECK_LOG_FILE, DRAFTS_FILE, HANDOFF_DIR, PANEL_DIR } from './paths.js';

const execFileAsync = promisify(execFile);

export function inCmux(): boolean {
  return Boolean(process.env.CMUX_SURFACE_ID);
}

export function openUrl(url: string): void {
  spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
}

/** cmux notification inside cmux, a macOS notification otherwise (same as the skill's notify.sh). */
export function notify(title: string, body: string): void {
  const clean = (s: string, n: number) => s.replace(/["\\]/g, '').replace(/\s+/g, ' ').slice(0, n);
  if (inCmux()) {
    spawn('cmux', ['notify', '--title', clean(title, 80), '--body', clean(body, 200)], { stdio: 'ignore' }).on(
      'error',
      () => {}
    );
    return;
  }
  spawn(
    'osascript',
    ['-e', `display notification "${clean(body, 200)}" with title "${clean(title, 80)}" sound name "Glass"`],
    { stdio: 'ignore' }
  ).on('error', () => {});
}

const CHECK_PROMPT = (serverName: string) => `/forum-assistant check

You are running headless for the user's \`a1 panel\` control panel. In this run:
- Do not post, reply, create rooms, upload, or mark anything read. The user approves and posts from the panel.
- Do the normal check and rewrite ~/.forum-assistant/INBOX.md as usual.
- For every item in "Ready to post", also queue it for the panel: write the exact reply text to a temp file under ~/.forum-assistant/panel/, then run
  a1 forum draft --source forum-assistant --room <full room uuid> [--thread <th_… id>] --title "<room name>" --body-file <file>
  Use full room uuids (not the truncated form INBOX.md shows). Re-running replaces your earlier draft for the same thread.
- Write panel summaries to ~/.forum-assistant/panel/summaries.json: one entry per room that needs the user or had new comments this check, keyed by full room uuid. Read the file first and keep other rooms' entries. Each entry:
  { "title": "<=60 chars, what the thread is about, e.g. Review #4763 — feedback v1 API + MCP tools",
    "ask": "<what is being asked of the user, or empty>", "what": "<what the PR or thread does>",
    "risk": "<the main risk or open question, or empty>", "done": "<what is already resolved, or empty>",
    "priority": "high" | "normal", "updated_at": "<ISO time>" }
  One line each, plain text, grounded only in the thread. "high" only when the asker says it is urgent or high priority. Write valid JSON.
- The Valhalla MCP server is "${serverName}".`;

export interface CheckHandle {
  done: Promise<number>;
}

/** Runs one forum-assistant check in a headless Claude session; output goes to check.log. */
export async function runCheck(config: Config, serverName: string): Promise<CheckHandle> {
  await fs.ensureDir(PANEL_DIR);
  const log = await fs.open(CHECK_LOG_FILE, 'w');
  const child = spawn(
    'claude',
    [
      '-p',
      CHECK_PROMPT(serverName),
      '--model',
      config.forum?.checkModel ?? 'haiku',
      // JSON output puts the run's token usage and cost in check.log
      '--output-format',
      'json',
      '--allowedTools',
      `mcp__${serverName}`,
      'Read',
      'Write',
      'Edit',
      'Bash(git log:*)',
      'Bash(gh pr list:*)',
      'Bash(a1 forum draft:*)',
      'Bash(bash *notify.sh*)',
    ],
    { cwd: config.projectRoot, stdio: ['ignore', log, log] }
  );
  const done = new Promise<number>((resolve) => {
    child.on('error', () => resolve(1));
    child.on('exit', (code) => {
      fs.close(log).catch(() => {});
      resolve(code ?? 1);
    });
  });
  return { done };
}

export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .slice(0, 5)
    .join('-');
  return `forum-${slug || 'item'}`.slice(0, 48).replace(/-+$/, '');
}

/**
 * Opens a new terminal (a cmux workspace inside cmux, else a Ghostty tab, else a Ghostty window) running
 * `a1 create <session>` with the forum item as its first task.
 */
export async function startSessionOnItem(
  config: Config,
  session: string,
  brief: string
): Promise<string> {
  await fs.ensureDir(HANDOFF_DIR);
  const briefFile = path.join(HANDOFF_DIR, `${session}.md`);
  await fs.writeFile(
    briefFile,
    `${brief}\n\nWhen you have something to say back in this thread, queue it with \`a1 forum draft --room <room uuid> --thread <thread id> --title "<room name>" --body-file <file>\` (drafts land in ${DRAFTS_FILE}). Do not post it yourself: the user posts from the panel.\n`,
    'utf-8'
  );

  const command = `a1 create ${session} --prompt-file ${JSON.stringify(briefFile)}`;
  if (inCmux()) {
    await execFileAsync('cmux', ['new-workspace', '--name', session, '--cwd', config.projectRoot, '--command', command]);
    return `cmux workspace ${session}`;
  }
  // A tab in the current Ghostty window (Ghostty 1.3+ AppleScript); a new window when that is unavailable
  const quote = (v: string) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  try {
    await execFileAsync('osascript', [
      '-e',
      `tell application "Ghostty" to new tab in front window with configuration {initial working directory:${quote(config.projectRoot)}, initial input:${quote(command)} & linefeed}`,
    ]);
    return `Ghostty tab ${session}`;
  } catch {
    // no Ghostty window, an older Ghostty, or Automation permission denied
  }
  await execFileAsync('open', [
    '-na',
    'Ghostty.app',
    '--args',
    `--working-directory=${config.projectRoot}`,
    '-e',
    '/bin/zsh',
    '-lc',
    command,
  ]);
  return `Ghostty window ${session}`;
}
