// Minimal PGN reader: headers, main line and every variation as a full line of SAN moves.

export interface PgnGame {
  headers: Record<string, string>;
  main: string[];
  /** Every leaf line (main line included), each from the start position. */
  lines: string[][];
}

const TOKEN_RE = /\{[^}]*\}|;[^\n]*|\(|\)|\$\d+|1-0|0-1|1\/2-1\/2|\*|[^\s(){};]+/g;
const RESULT_RE = /^(1-0|0-1|1\/2-1\/2|\*)$/;

function cleanSan(token: string): string {
  return token
    .replace(/^\d+\.+/, '') // "12.e4" or "12...e5"
    .replace(/[!?]+$/, '')
    .replace(/^0-0-0/, 'O-O-O')
    .replace(/^0-0/, 'O-O');
}

export function parseMovetext(text: string): { main: string[]; lines: string[][] } {
  let cur: string[] = [];
  const stack: string[][] = [];
  const lines: string[][] = [];
  for (const raw of text.match(TOKEN_RE) ?? []) {
    if (raw[0] === '{' || raw[0] === ';' || raw[0] === '$') continue;
    if (raw === '(') {
      stack.push(cur);
      cur = cur.slice(0, -1);
      continue;
    }
    if (raw === ')') {
      if (cur.length) lines.push(cur);
      cur = stack.pop() ?? [];
      continue;
    }
    if (RESULT_RE.test(raw) || /^\d+\.+$/.test(raw)) continue;
    const san = cleanSan(raw);
    if (san) cur.push(san);
  }
  if (cur.length) lines.push(cur);
  return { main: cur, lines };
}

export function parsePgn(text: string): PgnGame[] {
  const games: PgnGame[] = [];
  let headerText = '';
  let moveText = '';
  let inMoves = false;
  const flush = () => {
    if (!headerText && !moveText.trim()) return;
    const headers: Record<string, string> = {};
    for (const m of headerText.matchAll(/\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]/g)) headers[m[1]] = m[2];
    const { main, lines } = parseMovetext(moveText);
    games.push({ headers, main, lines });
    headerText = '';
    moveText = '';
    inMoves = false;
  };
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith('[') && t.endsWith(']')) {
      if (inMoves) flush();
      headerText += t + '\n';
    } else if (t) {
      inMoves = true;
      moveText += ' ' + t;
    }
  }
  flush();
  return games;
}
