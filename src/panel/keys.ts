import { C, fg } from './theme.js';

/** One entry in the key bar: the key, then what it does here. */
export type KeyHint = [key: string, label: string];

/** The key bar for one view: keys for what is focused on the left, keys that work everywhere on the right. */
export interface KeyBar {
  context: KeyHint[];
  global: KeyHint[];
}

const SEP = '   ';

/** The bar as styled text for an Ink line `width` columns wide (the forum's own screen, outside tmux). */
export function inkBar(bar: KeyBar, width: number): string {
  const render = (hints: KeyHint[]) => hints.map(([k, label]) => `${fg(C.bright)(k)} ${fg(C.dim)(label)}`).join(SEP);
  const right = render(bar.global);
  const context = fitContext(bar, width);
  return render(context) + ' '.repeat(Math.max(1, width - plain(context).length - plain(bar.global).length)) + right;
}

/** The bar as a tmux format: the bottom line of the panel, `width` columns when known. */
export function tmuxBar(bar: KeyBar, width?: number): string {
  const render = (hints: KeyHint[]) =>
    hints.map(([k, label]) => `#[fg=${C.bright},bold]${esc(k)}#[fg=${C.dim},nobold] ${esc(label)}`).join(SEP);
  const context = width ? fitContext(bar, width - 3) : bar.context;
  return ` ${render(context)}#[align=right]${render(bar.global)} #[default]`;
}

const plain = (hints: KeyHint[]) => hints.map(([k, label]) => `${k} ${label}`).join(SEP);

/** Context keys that fit beside the global ones; the last ones drop first (help lists them all). */
function fitContext(bar: KeyBar, width: number): KeyHint[] {
  const room = width - plain(bar.global).length - SEP.length;
  const context = [...bar.context];
  while (context.length && plain(context).length > room) context.pop();
  return context;
}

const esc = (s: string) => s.replace(/#/g, '##');
