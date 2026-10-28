import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { execFile, spawnSync } from 'child_process';
import { promisify } from 'util';
import { Config } from '../config/types.js';

const execFileAsync = promisify(execFile);

/** a1 runs its own tmux server, so it never touches the user's tmux sessions or config. */
const SOCKET = process.env.A1_TMUX_SOCKET || 'a1';
const CONF_FILE = path.join(os.homedir(), '.config', 'a1', 'panel', 'tmux.conf');
export const MANAGER_WIDTH = 46;

export async function tmux(...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('tmux', ['-L', SOCKET, ...args]);
  return stdout.trimEnd();
}

export function hasTmux(): boolean {
  return spawnSync('tmux', ['-V'], { stdio: 'ignore' }).status === 0;
}

/** One tmux session per project: `a1-valhalla`. */
export function tmuxSessionName(config: Config): string {
  return `a1-${path.basename(config.projectRoot)}`.replace(/[.:\s]/g, '-');
}

/** How to run this same a1 build from inside tmux, whatever is on PATH. */
export function a1Command(...args: string[]): string {
  return [process.execPath, process.argv[1], ...args].map(shellQuote).join(' ');
}

export function shellQuote(value: string): string {
  return /^[\w@%+=:,./-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;
}

const PLACEHOLDER = `sh -c ${shellQuote(
  "printf '\\033[?25l\\n\\n   \\033[2mNo session open.\\033[0m\\n\\n   On the left: \\033[1mn\\033[0m new session · \\033[1menter\\033[0m resume · \\033[1mF2\\033[0m forum\\n'; exec tail -f /dev/null"
)}`;

const CONF = `# Written by a1 panel; regenerated on every launch
set -g mouse on
set -sg escape-time 0
set -g focus-events on
set -g history-limit 50000
set -g default-terminal "tmux-256color"
set -as terminal-features ",xterm-ghostty:RGB,xterm-256color:RGB"
set -s extended-keys on
set -as terminal-features ",xterm-ghostty:extkeys,xterm*:extkeys"
set -g allow-passthrough on
set -g set-titles on
set -g set-titles-string "a1 · #{session_name}"
set -g status-position bottom
set -g status-style "bg=#1c2128,fg=#8b949e"
# Two lines: the tabs, then the key bar for whatever has focus. The panel writes @a1_keys;
# a session pane gets a fixed hint, since its keys belong to the agent.
set -g status 2
set -g status-format[1] "#[bg=#161b22]#{?#{==:#{@a1_role},manager},#{@a1_keys},#{@a1_pane_keys}}"
set -g @a1_pane_keys " #[fg=#8b949e]Keys go to the session   #[fg=#e6edf3,bold]F1#[fg=#8b949e,nobold] session list   #[fg=#e6edf3,bold]F2#[fg=#8b949e,nobold] forum   #[fg=#e6edf3,bold]C-\\\\#[fg=#8b949e,nobold] switch pane   #[fg=#e6edf3,bold]click#[fg=#8b949e,nobold] a pane or tab"
set -g window-status-format ""
set -g window-status-current-format ""
set -g status-left-length 120
set -g status-right-length 120
set -g pane-border-status top
set -g pane-border-format " #{?#{@a1_title},#{@a1_title},#{pane_current_command}} "
set -g pane-border-style "fg=#3a4f5c"
set -g pane-active-border-style "fg=#e5b567"
# ctrl-\\ moves between the session list and the open session
bind -n C-\\\\ if -F '#{pane_at_left}' 'select-pane -R' 'select-pane -L'
# F1 / F2 switch tabs from any pane, a session included (the agent never sees them); clicking a tab does the same.
# Both tell the panel (the leftmost pane) which tab: M-1 sessions, M-2 forum
bind -n F1 { select-pane -t '{left}' ; send-keys -t '{left}' M-1 }
bind -n F2 { select-pane -t '{left}' ; send-keys -t '{left}' M-2 }
bind -n MouseDown1Status {
  if -F '#{==:#{mouse_status_range},sessions}' { select-pane -t '{left}' ; send-keys -t '{left}' M-1 }
  if -F '#{==:#{mouse_status_range},forum}' { select-pane -t '{left}' ; send-keys -t '{left}' M-2 }
}
`;

export interface Pane {
  id: string;
  /** the a1 session it runs, for session panes */
  session?: string;
  role?: 'manager' | 'placeholder';
  dead: boolean;
  windowId: string;
}

export async function listPanes(target: string): Promise<Pane[]> {
  const out = await tmux('list-panes', '-s', '-t', target, '-F', '#{pane_id}\t#{@a1_session}\t#{@a1_role}\t#{pane_dead}\t#{window_id}');
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [id, session, role, dead, windowId] = line.split('\t');
      return { id, session: session || undefined, role: (role || undefined) as Pane['role'], dead: dead === '1', windowId };
    });
}

async function setPaneOptions(pane: string, options: Record<string, string>): Promise<void> {
  for (const [key, value] of Object.entries(options)) await tmux('set-option', '-p', '-t', pane, key, value);
}

/**
 * Creates the panel's tmux session (manager on the left, an empty slot on the right) or repairs it,
 * then attaches. Returns when the user detaches.
 */
export async function launchPanel(config: Config): Promise<void> {
  const name = tmuxSessionName(config);
  await fs.ensureDir(path.dirname(CONF_FILE));
  await fs.writeFile(CONF_FILE, CONF, 'utf-8');

  const exists = spawnSync('tmux', ['-L', SOCKET, 'has-session', '-t', `=${name}`], { stdio: 'ignore' }).status === 0;
  if (!exists) {
    const cols = process.stdout.columns ?? 200;
    const rows = process.stdout.rows ?? 50;
    await tmux(
      '-f', CONF_FILE,
      'new-session', '-d', '-s', name, '-n', 'panel', '-x', String(cols), '-y', String(rows - 1), '-c', config.projectRoot,
      '-e', `A1_PANEL_TMUX=${name}`,
      a1Command('panel', '--manager')
    );
  }
  await tmux('source-file', CONF_FILE);

  const panes = await listPanes(name);
  let manager = panes.find((p) => p.role === 'manager');
  if (!manager) {
    // A fresh session: its only pane is the manager
    const id = await tmux('display-message', '-p', '-t', `${name}:panel`, '#{pane_id}');
    await setPaneOptions(id, { '@a1_role': 'manager', '@a1_title': 'a1 sessions', 'remain-on-exit': 'on' });
    manager = { id, role: 'manager', dead: false, windowId: '' };
  } else {
    // Restart the session list on every launch so it runs this build; the sessions keep running
    await tmux('respawn-pane', '-k', '-t', manager.id, a1Command('panel', '--manager'));
  }
  await ensureRightSlot(name, manager.id);
  // Keep the session list a fixed width whatever the terminal size
  await tmux('set-hook', '-t', name, 'client-resized', `resize-pane -t ${manager.id} -x ${MANAGER_WIDTH}`);
  await tmux('resize-pane', '-t', manager.id, '-x', String(MANAGER_WIDTH)).catch(() => {});
  await tmux('select-pane', '-t', manager.id);

  const env = { ...process.env };
  delete env.TMUX; // attaching from inside another tmux nests, which works
  spawnSync('tmux', ['-L', SOCKET, 'attach-session', '-t', `=${name}`], { stdio: 'inherit', env });
}

/** The pane to the right of the manager, recreating it with the placeholder when it is gone. */
export async function ensureRightSlot(name: string, managerPane: string): Promise<string> {
  const inWindow = (await tmux('list-panes', '-t', managerPane, '-F', '#{pane_id}')).split('\n').filter(Boolean);
  const right = inWindow.find((id) => id !== managerPane);
  if (right) return right;
  const panes = await listPanes(name);
  const placeholder = panes.find((p) => p.role === 'placeholder');
  if (placeholder) {
    await tmux('join-pane', '-d', '-h', '-s', placeholder.id, '-t', managerPane);
    await tmux('resize-pane', '-t', managerPane, '-x', String(MANAGER_WIDTH)).catch(() => {});
    return placeholder.id;
  }
  const id = await tmux('split-window', '-h', '-d', '-t', managerPane, '-P', '-F', '#{pane_id}', PLACEHOLDER);
  await setPaneOptions(id, { '@a1_role': 'placeholder', '@a1_title': 'no session' });
  await tmux('resize-pane', '-t', managerPane, '-x', String(MANAGER_WIDTH)).catch(() => {});
  return id;
}

/** Puts `pane` in the right slot. The pane it replaces moves to `pane`'s hidden window, still running. */
export async function showPane(name: string, managerPane: string, pane: string): Promise<void> {
  const right = await ensureRightSlot(name, managerPane);
  if (right !== pane) await tmux('swap-pane', '-d', '-s', pane, '-t', right);
}

export async function showPlaceholder(name: string, managerPane: string): Promise<void> {
  const placeholder = (await listPanes(name)).find((p) => p.role === 'placeholder');
  if (placeholder) await showPane(name, managerPane, placeholder.id);
  else await ensureRightSlot(name, managerPane);
}

/** Runs an a1 command for a session in its own hidden window; returns the pane id. */
export async function startSessionPane(config: Config, session: string, args: string[]): Promise<string> {
  const name = tmuxSessionName(config);
  const id = await tmux(
    'new-window', '-d', '-t', `${name}:`, '-n', session, '-c', config.projectRoot,
    '-e', 'A1_PANEL=1', '-e', `A1_PANEL_TMUX=${name}`,
    '-P', '-F', '#{pane_id}',
    a1Command(...args)
  );
  await setPaneOptions(id, { '@a1_session': session, '@a1_title': session, 'remain-on-exit': 'on' });
  return id;
}

export async function respawnSessionPane(pane: string, args: string[]): Promise<void> {
  await tmux('respawn-pane', '-k', '-t', pane, a1Command(...args));
}

/** Types a prompt into the session and submits it, as if the user pasted it there. */
export async function sendPrompt(pane: string, text: string): Promise<void> {
  await tmux('set-buffer', '-b', 'a1-prompt', '--', text);
  await tmux('paste-buffer', '-p', '-d', '-b', 'a1-prompt', '-t', pane);
  // Claude Code treats an Enter inside the paste burst as a newline; submit after it settles
  await new Promise((resolve) => setTimeout(resolve, 150));
  await tmux('send-keys', '-t', pane, 'Enter');
}

export async function killPane(pane: string): Promise<void> {
  await tmux('kill-pane', '-t', pane);
}

export async function focusPane(pane: string): Promise<void> {
  await tmux('select-pane', '-t', pane);
}

export async function zoomManager(managerPane: string, zoom: boolean): Promise<void> {
  const zoomed = (await tmux('display-message', '-p', '-t', managerPane, '#{window_zoomed_flag}')) === '1';
  if (zoomed !== zoom) await tmux('resize-pane', '-Z', '-t', managerPane);
}

export async function detach(): Promise<void> {
  await tmux('detach-client');
}

/** The tabs line (left and right) and the key bar under it. */
export async function setStatusLine(name: string, left: string, right: string, keys: string): Promise<void> {
  await tmux('set-option', '-t', name, 'status-left', left, ';', 'set-option', '-t', name, 'status-right', right, ';', 'set-option', '-t', name, '@a1_keys', keys);
}

export async function stopPanel(config: Config): Promise<boolean> {
  return spawnSync('tmux', ['-L', SOCKET, 'kill-session', '-t', `=${tmuxSessionName(config)}`], { stdio: 'ignore' }).status === 0;
}
