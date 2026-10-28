import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { Config } from '../config/types.js';
import { ForumClient } from '../services/forum/mcp-client.js';
import { SessionView, listSessionViews } from '../services/forum/sessions.js';
import { Activity, readActivity } from '../services/activity.js';
import { validateBranchName } from '../utils/validation.js';
import { App } from '../panel/App.js';
import { C, fg } from '../panel/theme.js';
import { ago, truncate } from '../panel/format.js';
import stringWidth from 'string-width';
import wrapAnsi from 'wrap-ansi';
import { KeyBar, tmuxBar } from '../panel/keys.js';
import { isMouseInput, useMouse } from '../panel/mouse.js';
import * as tm from './tmux.js';
import { DeleteCheck, checkDelete, deleteSession } from './delete.js';

const REFRESH_MS = 1000;
const HEADER_LINES = 2;
const ROW_LINES = 3;
/** The prompt box grows with the text up to this many lines, then scrolls */
const MAX_BOX_LINES = 10;
const PROMPTS_DIR = path.join(os.homedir(), '.config', 'a1', 'panel', 'prompts');

type Status = 'working' | 'waiting' | 'permission' | 'starting' | 'running' | 'exited' | 'stopped';

const STATUS: Record<Status, { glyph: string; label: string; color: string }> = {
  working: { glyph: '◐', label: 'working', color: C.blue },
  waiting: { glyph: '●', label: 'your turn', color: C.accent },
  permission: { glyph: '▲', label: 'needs ok', color: C.red },
  starting: { glyph: '◌', label: 'starting', color: C.dim },
  running: { glyph: '○', label: 'running', color: C.muted },
  exited: { glyph: '✕', label: 'exited', color: C.dim },
  stopped: { glyph: '·', label: 'stopped', color: C.faint },
};
const SPINNER = ['◐', '◓', '◑', '◒'];

interface Row {
  name: string;
  /** the tmux pane running it; none when only the worktree exists */
  pane?: tm.Pane;
  view?: SessionView;
  activity?: Activity;
  status: Status;
}

type Mode =
  | { kind: 'normal' }
  | { kind: 'new-name'; text: string }
  | { kind: 'new-task'; name: string; text: string }
  | { kind: 'prompt'; row: Row; text: string }
  | { kind: 'confirm-stop'; row: Row }
  | { kind: 'confirm-delete'; row: Row; check: DeleteCheck }
  | { kind: 'forum' }
  | { kind: 'help' };

function statusOf(pane: tm.Pane | undefined, activity: Activity | undefined): Status {
  if (!pane) return 'stopped';
  if (pane.dead) return 'exited';
  if (!activity || activity.state === 'ended') return 'running';
  return activity.state;
}

async function loadRows(config: Config, tmuxSession: string): Promise<Row[]> {
  const [panes, views] = await Promise.all([tm.listPanes(tmuxSession), listSessionViews(config)]);
  const viewByName = new Map(views.map((v) => [v.session, v]));
  // Open sessions in the order they were started, then worktrees with nothing running, most recent first
  const open = panes.filter((p) => p.session).sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
  const openNames = new Set(open.map((p) => p.session!));
  const rows: Row[] = open.map((pane) => {
    const activity = pane.dead ? undefined : readActivity(pane.session!);
    return { name: pane.session!, pane, view: viewByName.get(pane.session!), activity, status: statusOf(pane, activity) };
  });
  for (const view of views) {
    if (view.live && !openNames.has(view.session)) rows.push({ name: view.session, view, status: 'stopped' });
  }
  return rows;
}

export function Manager({
  config,
  client,
  tmuxSession,
  managerPane,
}: {
  config: Config;
  client: ForumClient | null;
  tmuxSession: string;
  managerPane: string;
}) {
  const { stdout } = useStdout();
  const [size, setSize] = useState({ cols: stdout.columns ?? tm.MANAGER_WIDTH, rows: stdout.rows ?? 40 });
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<string | undefined>();
  const [mode, setMode] = useState<Mode>({ kind: 'normal' });
  const [message, setMessage] = useState('');
  const [tick, setTick] = useState(0);
  const [forumKeys, setForumKeys] = useState<KeyBar>({ context: [], global: [] });
  const shown = useRef<string | undefined>(undefined);
  const listStart = useRef(0);

  useEffect(() => {
    const onResize = () => setSize({ cols: stdout.columns, rows: stdout.rows });
    stdout.on('resize', onResize);
    return () => {
      stdout.off('resize', onResize);
    };
  }, [stdout]);

  const refresh = useCallback(async () => {
    try {
      setRows(await loadRows(config, tmuxSession));
    } catch (error) {
      setMessage(`tmux: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [config, tmuxSession]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const anyWorking = rows.some((r) => r.status === 'working');
  useEffect(() => {
    if (!anyWorking) return;
    const timer = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(timer);
  }, [anyWorking]);

  const index = Math.max(0, rows.findIndex((r) => r.name === selected));
  const current = rows[index];

  // The selected session is always the one on the right
  const target = current?.pane?.id ?? 'placeholder';
  useEffect(() => {
    if (mode.kind === 'forum' || shown.current === target) return;
    shown.current = target;
    const show = target === 'placeholder' ? tm.showPlaceholder(tmuxSession, managerPane) : tm.showPane(tmuxSession, managerPane, target);
    show.catch((error) => setMessage(`tmux: ${error instanceof Error ? error.message : String(error)}`));
  }, [target, mode.kind, tmuxSession, managerPane]);

  // The tmux status line is the full-width bottom bar: tabs on the left, keys on the right
  const needYou = rows.filter((r) => r.status === 'waiting' || r.status === 'permission').length;
  useEffect(() => {
    const tab = (id: string, label: string, active: boolean) =>
      `#[range=user|${id}]` +
      (active ? `#[fg=#1c2128,bg=#e5b567,bold] ${label} #[default]` : `#[fg=#c9d1d9] ${label} #[default]`) +
      '#[norange]';
    const project = path.basename(config.projectRoot);
    const left =
      `#[fg=#e5b567,bold] a1 #[fg=#8b949e,nobold]${project}   ` +
      tab('sessions', `Sessions ${rows.filter((r) => r.pane && !r.pane.dead).length}`, mode.kind !== 'forum') +
      ' ' +
      tab('forum', client ? 'Forum' : 'Forum (not set up)', mode.kind === 'forum') +
      (needYou ? `   #[fg=#e5b567]● ${needYou} your turn#[default]` : '');
    const keys = mode.kind === 'forum' ? forumKeys : sessionKeys(mode, current);
    tm.setStatusLine(tmuxSession, left, '', tmuxBar(keys, mode.kind === 'forum' ? size.cols : undefined)).catch(() => {});
  }, [rows, mode, current, forumKeys, needYou, client, config.projectRoot, tmuxSession, size.cols]);

  const act = useCallback(
    async (label: string, fn: () => Promise<string | void>) => {
      try {
        const done = await fn();
        if (done) setMessage(done);
        await refresh();
      } catch (error) {
        setMessage(`${label} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    [refresh]
  );

  const resume = useCallback(
    (row: Row) =>
      act('Resume', async () => {
        if (row.pane) await tm.respawnSessionPane(row.pane.id, ['resume', row.name]);
        else await tm.startSessionPane(config, row.name, ['resume', row.name]);
        shown.current = undefined;
        return `Resumed ${row.name}`;
      }),
    [act, config]
  );

  const openForum = useCallback(() => {
    if (!client) return setMessage('Forum needs the Valhalla MCP at user scope (see README: Forum setup)');
    void tm.zoomManager(managerPane, true).then(() => setMode({ kind: 'forum' }));
  }, [client, managerPane]);

  const backFromForum = useCallback(() => {
    setMode({ kind: 'normal' });
    shown.current = undefined;
    void tm.zoomManager(managerPane, false).catch(() => {});
  }, [managerPane]);

  useInput(
    (input, key) => {
      if (isMouseInput(input)) return;
      setMessage('');
      if (mode.kind === 'help') return setMode({ kind: 'normal' });
      // F2 or a click on the Forum tab (tmux sends M-2 for both) opens the forum; tab too, outside a text box
      const typing = mode.kind === 'new-name' || mode.kind === 'new-task' || mode.kind === 'prompt';
      if ((key.meta && input === '2') || (key.tab && !typing)) return openForum();
      if (key.meta && input === '1') return;

      if (mode.kind === 'new-name' || mode.kind === 'new-task' || mode.kind === 'prompt') {
        if (key.escape) return setMode({ kind: 'normal' });
        if (key.return) {
          const text = mode.text.trim();
          if (mode.kind === 'new-name') {
            if (!text || !validateBranchName(text)) return setMessage(`"${text}" is not a valid branch name`);
            if (rows.some((r) => r.name === text)) return setMessage(`${text} already exists; select it and press r`);
            return setMode({ kind: 'new-task', name: text, text: '' });
          }
          setMode({ kind: 'normal' });
          if (mode.kind === 'new-task') {
            const name = mode.name;
            return void act('Start', async () => {
              const args = ['create', name];
              if (text) {
                await fs.ensureDir(PROMPTS_DIR);
                const file = path.join(PROMPTS_DIR, `${name}.md`);
                await fs.writeFile(file, text, 'utf-8');
                args.push('--prompt-file', file);
              }
              await tm.startSessionPane(config, name, args);
              setSelected(name);
              return `Started ${name} · enter to open it`;
            });
          }
          if (!text) return;
          const row = mode.row;
          return void act('Send', async () => {
            await tm.sendPrompt(row.pane!.id, text);
            return `Sent to ${row.name}`;
          });
        }
        if (key.backspace || key.delete) return setMode({ ...mode, text: mode.text.slice(0, -1) });
        if (input && !key.ctrl && !key.meta) return setMode({ ...mode, text: mode.text + input.replace(/[\r\n]+/g, ' ') });
        return;
      }

      if (mode.kind === 'confirm-stop') {
        if (input === 'y') {
          const row = mode.row;
          setMode({ kind: 'normal' });
          void act('Stop', async () => {
            if (shown.current === row.pane!.id) {
              await tm.showPlaceholder(tmuxSession, managerPane);
              shown.current = 'placeholder';
            }
            await tm.killPane(row.pane!.id);
            return `Stopped ${row.name}. The worktree stays; r resumes it.`;
          });
        } else if (input === 'n' || key.escape) setMode({ kind: 'normal' });
        return;
      }

      if (mode.kind === 'confirm-delete') {
        if (input === 'y') {
          const { row, check } = mode;
          setMode({ kind: 'normal' });
          void act('Delete', async () => {
            if (row.pane) {
              if (shown.current === row.pane.id) {
                await tm.showPlaceholder(tmuxSession, managerPane);
                shown.current = 'placeholder';
              }
              await tm.killPane(row.pane.id);
            }
            return deleteSession(config, row.name, check);
          });
        } else if (input === 'n' || key.escape) setMode({ kind: 'normal' });
        return;
      }

      const delta = key.downArrow || input === 'j' ? 1 : key.upArrow || input === 'k' ? -1 : 0;
      if (delta && rows.length) {
        const next = rows[Math.max(0, Math.min(rows.length - 1, index + delta))];
        return setSelected(next.name);
      }
      if (input === 'q') return void tm.detach().catch(() => {});
      if (input === '?') return setMode({ kind: 'help' });
      if (input === 'n') return setMode({ kind: 'new-name', text: '' });
      if (input === 'f') return openForum();
      if (!current) return;
      const alive = current.pane && !current.pane.dead;
      if (key.rightArrow || input === 'l') {
        if (alive) return void tm.focusPane(current.pane!.id).catch(() => {});
        return setMessage('Not running; enter resumes it');
      }
      if (key.return) {
        if (alive) return void tm.focusPane(current.pane!.id).catch(() => {});
        return void resume(current);
      }
      if (input === 'r') return alive ? setMessage(`${current.name} is already running`) : void resume(current);
      if (input === 'p') return alive ? setMode({ kind: 'prompt', row: current, text: '' }) : setMessage('Not running; r resumes it');
      if (input === 'x') return current.pane ? setMode({ kind: 'confirm-stop', row: current }) : setMessage('Not running');
      if (input === 'd') {
        if (alive) return setMessage(`Stop ${current.name} first (x)`);
        const row = current;
        return void checkDelete(config, row.name)
          .then((check) => setMode({ kind: 'confirm-delete', row, check }))
          .catch((error) => setMessage(`Delete failed: ${error instanceof Error ? error.message : String(error)}`));
      }
    },
    { isActive: mode.kind !== 'forum' }
  );

  // Click a session to select it; the wheel moves the selection
  useMouse((event) => {
    if (mode.kind !== 'normal' || rows.length === 0) return;
    if (event.button !== 'left') {
      const next = rows[Math.max(0, Math.min(rows.length - 1, index + (event.button === 'wheel-down' ? 1 : -1)))];
      return setSelected(next.name);
    }
    const offset = event.y - 1 - HEADER_LINES;
    if (offset < 0 || offset % ROW_LINES === ROW_LINES - 1) return;
    const row = rows[listStart.current + Math.floor(offset / ROW_LINES)];
    if (row) setSelected(row.name);
  }, mode.kind !== 'forum');

  if (mode.kind === 'forum' && client) {
    return (
      <App
        config={config}
        client={client}
        embedded={{
          onQuit: backFromForum,
          onDetach: () => void tm.detach().catch(() => {}),
          onKeys: setForumKeys,
          onSessionStarted: (name) => {
            setSelected(name);
            backFromForum();
          },
        }}
      />
    );
  }

  const width = size.cols;
  const footer = footerLines(mode, width);
  const header = [
    fg(C.accent).bold('SESSIONS') + fg(C.dim)(`  ${rows.filter((r) => r.pane && !r.pane.dead).length} open`),
    ' ',
  ];
  const listHeight = Math.max(2, size.rows - header.length - footer.length - (message ? 2 : 1));
  const visible = Math.max(1, Math.floor(listHeight / ROW_LINES));
  const start = Math.max(0, Math.min(index - Math.floor(visible / 2), rows.length - visible));
  listStart.current = start;
  const body: string[] = [];
  if (rows.length === 0) body.push(fg(C.dim)('No sessions yet. Press n to start one.'));
  rows.slice(start, start + visible).forEach((row, i) => {
    body.push(...rowLines(row, start + i === index, width, tick), ' ');
  });
  while (body.length < listHeight) body.push(' ');

  return (
    <Box flexDirection="column" width={width} height={size.rows}>
      {[...header, ...body.slice(0, listHeight), ...(message ? [' ', fg(C.muted)(truncate(message, width))] : [' ']), ...footer].map((line, i) => (
        <Text key={i} wrap="truncate">
          {line}
        </Text>
      ))}
    </Box>
  );
}

function rowLines(row: Row, isSelected: boolean, width: number, tick: number): string[] {
  const s = STATUS[row.status];
  const glyph = row.status === 'working' ? SPINNER[tick % SPINNER.length] : s.glyph;
  const marker = isSelected ? fg(C.accent)('› ') : '  ';
  const label = fg(s.color)(s.label);
  const nameWidth = width - 4 - s.label.length - 1;
  const shortName = truncate(row.name, nameWidth);
  const name = (isSelected ? fg(C.bright).bold(shortName) : fg(C.text)(shortName)) + ' '.repeat(Math.max(0, nameWidth - stringWidth(shortName)));
  const line1 = marker + fg(s.color)(glyph) + ' ' + name + ' ' + label;

  const at = row.activity?.at ?? row.view?.updated_at;
  const detail =
    row.status === 'permission' && row.activity?.message
      ? row.activity.message
      : [row.view?.summary, row.view?.pr ? `#${row.view.pr}` : '', row.view?.branch && row.view.branch !== row.name ? row.view.branch : '']
          .filter(Boolean)
          .join(' · ') || (row.pane ? '' : 'worktree only');
  const line2 = '    ' + fg(C.dim)(truncate([at ? ago(at) : '', detail].filter(Boolean).join(' · '), width - 4));
  return [line1, line2];
}

/** What the bottom bar lists for the sessions tab. */
function sessionKeys(mode: Mode, current: Row | undefined): KeyBar {
  const global: KeyBar['global'] = [['F2', 'forum'], ['?', 'help'], ['q', 'detach']];
  switch (mode.kind) {
    case 'new-name':
      return { context: [['type', 'a branch name'], ['enter', 'next'], ['esc', 'cancel']], global: [] };
    case 'new-task':
      return { context: [['type', 'the first prompt (optional)'], ['enter', 'start the session'], ['esc', 'cancel']], global: [] };
    case 'prompt':
      return { context: [['type', `a prompt for ${current?.name ?? 'the session'}`], ['enter', 'send'], ['esc', 'cancel']], global: [] };
    case 'confirm-stop':
      return { context: [['y', 'stop it (the worktree stays)'], ['n', 'keep it']], global: [] };
    case 'confirm-delete':
      return { context: [['y', 'delete it'], ['n', 'keep it']], global: [] };
    case 'help':
      return { context: [['any key', 'closes help']], global: [] };
    default: {
      const alive = current?.pane && !current.pane.dead;
      const context: KeyBar['context'] = [['↑↓', 'select'], ['click', 'select']];
      if (alive) context.push(['→ enter', 'open it'], ['p', 'prompt it'], ['x', 'stop']);
      else if (current) context.push(['enter', 'resume'], ['d', 'delete']);
      context.push(['n', 'new session'], ['C-\\', 'switch pane']);
      return { context, global };
    }
  }
}

/** A text box that wraps, so a long prompt stays readable while it is typed. */
function inputBox(label: string, text: string, width: number): string[] {
  const inner = Math.max(10, width - 4);
  const border = fg(C.accent);
  const wrapped = wrapAnsi(text + '▌', inner, { hard: true, trim: false }).split('\n');
  const shown = wrapped.slice(-MAX_BOX_LINES);
  const top = ` ${label} `;
  return [
    border(`╭─${top}${'─'.repeat(Math.max(0, width - 3 - stringWidth(top)))}╮`),
    ...(wrapped.length > shown.length ? [border('│ ') + fg(C.dim)(`↑ ${wrapped.length - shown.length} more line(s)`.padEnd(inner)) + border(' │')] : []),
    ...shown.map((line) => border('│ ') + fg(C.bright)(line) + ' '.repeat(Math.max(0, inner - stringWidth(line))) + border(' │')),
    border(`╰${'─'.repeat(Math.max(0, width - 2))}╯`),
  ];
}

function footerLines(mode: Mode, width: number): string[] {
  const key = (k: string, d: string) => fg(C.bright)(k.padEnd(9)) + fg(C.dim)(d);
  switch (mode.kind) {
    case 'new-name':
      return inputBox('new session · branch name', mode.text, width);
    case 'new-task':
      return inputBox(`${truncate(mode.name, width - 20)} · first prompt`, mode.text, width);
    case 'prompt':
      return inputBox(`prompt ${truncate(mode.row.name, width - 14)}`, mode.text, width);
    case 'confirm-stop':
      return [fg(C.red)(`Stop ${truncate(mode.row.name, width - 6)}?`)];
    case 'confirm-delete': {
      const { check } = mode;
      const lines = [fg(C.red).bold(`Delete ${truncate(mode.row.name, width - 8)}?`)];
      if (check.worktree) lines.push(fg(C.dim)('Removes its worktree and panel status.'));
      if (check.dirty.length) lines.push(fg(C.red)(`${check.dirty.length} uncommitted change(s) will be lost:`), ...check.dirty.slice(0, 4).map((l) => fg(C.red)(`  ${truncate(l, width - 2)}`)));
      if (check.branch && check.unpushed) lines.push(fg(C.accent)(`Branch ${truncate(check.branch, width - 40)} is kept: ${check.unpushed} commit(s) not on GitHub.`));
      else if (check.branch) lines.push(fg(C.dim)(`Branch ${truncate(check.branch, width - 34)} deleted too (all on GitHub).`));
      return lines.flatMap((l) => wrapAnsi(l, width, { hard: true }).split('\n'));
    }
    case 'help':
      return [
        fg(C.bright).bold('Keys'),
        key('↑↓ j k', 'select; it shows on the right'),
        key('click', 'select · wheel moves'),
        key('→ enter', 'open it (enter resumes if stopped)'),
        key('C-\\', 'back here from a session'),
        key('p', 'send a prompt without opening it'),
        key('n', 'new session'),
        key('r / x', 'resume / stop'),
        key('d', 'delete a stopped session (asks first)'),
        key('F1 / F2', 'sessions / forum, even from a session'),
        key('q', 'detach; sessions keep running'),
      ];
    default:
      return [];
  }
}
