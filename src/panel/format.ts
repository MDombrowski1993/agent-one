import stringWidth from 'string-width';

export function ago(iso: string | undefined): string {
  if (!iso) return '–';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return '<1m';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/** Truncates to a display width, ending with … when cut. */
export function truncate(text: string, width: number): string {
  if (width <= 0) return '';
  if (stringWidth(text) <= width) return text;
  let out = '';
  for (const ch of text) {
    if (stringWidth(out + ch) > width - 1) break;
    out += ch;
  }
  return `${out}…`;
}

/** Truncates or pads to exactly `width` columns. */
export function fit(text: string, width: number, align: 'left' | 'right' = 'left'): string {
  const cut = truncate(text, width);
  const pad = ' '.repeat(Math.max(0, width - stringWidth(cut)));
  return align === 'right' ? pad + cut : cut + pad;
}

export function firstName(name: string | undefined): string {
  return name?.trim().split(/\s+/)[0] ?? '';
}

export function oneLine(text: string): string {
  return text.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
}

export type RoomKind = 'rev' | 'thr' | 'err';

export function roomKind(name: string): RoomKind {
  if (/^\[log\]/i.test(name)) return 'err';
  if (/^(review|pr review|pr approval|can you review)/i.test(name) || /\breview request\b/i.test(name)) return 'rev';
  return 'thr';
}

/**
 * Forum room names are long and formulaic; the list shows the part that differs:
 * "Review request: valhalla PR #4704 (FE-2348, blank custom columns…)" → "#4704 FE-2348 · blank custom columns…",
 * "[log] Error · Invalid `prisma.$queryRaw()` invocation: · none · Gnosis Freight Test" → "Invalid prisma.$queryRaw() invocation · Gnosis Freight Test".
 */
export function shortTitle(name: string): string {
  let t = name.trim();
  const pr = t.match(/^(?:review request|review|pr review)[^#]*#(\d+)\s*(?:\(([^)]*)\))?\s*(.*)$/i);
  if (pr) {
    const [, number, inner = '', rest] = pr;
    const ticket = inner.match(/^([A-Z]+-\d+),\s*(.*)$/);
    const desc = ticket ? ticket[2] : inner || rest;
    return [`#${number}`, ticket?.[1], desc ? `· ${desc}` : ''].filter(Boolean).join(' ');
  }
  if (/^\[log\]/i.test(t)) {
    t = t
      .replace(/^\[log\]\s*/i, '')
      .replace(/^(error|warn(ing)?|info)\s*·\s*/i, '')
      .replace(/`/g, '')
      .replace(/:\s*·/g, ' ·')
      .replace(/\s*·\s*none\b/gi, '');
    return t;
  }
  return t.replace(/^([^:]{2,40}):\s+/, '$1 · ');
}

export function prNumberIn(...texts: (string | undefined)[]): number | undefined {
  for (const text of texts) {
    if (!text) continue;
    const m = text.match(/\/pull\/(\d+)/) ?? text.match(/(?:^|[\s(])#(\d{3,5})\b/);
    if (m) return Number(m[1]);
  }
  return undefined;
}

export function linearIdsIn(text: string): string[] {
  return [...new Set(text.match(/\b(?:FE|BACK|GNO|DE)-\d+\b/g) ?? [])];
}
