import { fenTurn, START_KEY, type Color, type Ply } from '../lib/chess';
import { pliesFromSans, START_FEN } from '../lib/chess';
import type { PgnGame } from '../lib/pgn';

// A repertoire is a position graph: transpositions share the same node.

export interface RepMove {
  uci: string;
  san: string;
  /** Key of the position reached. */
  to: string;
  source: 'manual' | 'import' | 'pgn';
  addedAt: number;
}

export interface RepNode {
  moves: RepMove[];
  comment?: string;
}

/** Spaced repetition state of a position where the repertoire owner is to move. */
export interface Card {
  due: number;
  interval: number; // days
  ease: number;
  reps: number;
  lapses: number;
  last?: number;
}

export interface Repertoire {
  color: Color;
  nodes: Record<string, RepNode>;
  cards: Record<string, Card>;
  updatedAt: number;
}

export function emptyRepertoire(color: Color): Repertoire {
  return { color, nodes: { [START_KEY]: { moves: [] } }, cards: {}, updatedAt: Date.now() };
}

export function repMoves(rep: Repertoire, key: string): RepMove[] {
  return rep.nodes[key]?.moves ?? [];
}

export function inRepertoire(rep: Repertoire, key: string): boolean {
  return key in rep.nodes;
}

export function hasMove(rep: Repertoire, key: string, uci: string): boolean {
  return repMoves(rep, key).some((m) => m.uci === uci);
}

export function isOwnerTurn(rep: Repertoire, key: string): boolean {
  return fenTurn(key) === rep.color;
}

export function addPly(rep: Repertoire, fromKey: string, ply: Ply, source: RepMove['source']): boolean {
  const node = (rep.nodes[fromKey] ??= { moves: [] });
  rep.nodes[ply.key] ??= { moves: [] };
  if (node.moves.some((m) => m.uci === ply.uci)) return false;
  node.moves.push({ uci: ply.uci, san: ply.san, to: ply.key, source, addedAt: Date.now() });
  rep.updatedAt = Date.now();
  return true;
}

/** Adds every move of a line from the start position, returns the number of new moves. */
export function addLine(rep: Repertoire, plies: Ply[], source: RepMove['source'], startKey = START_KEY): number {
  let key = startKey;
  let added = 0;
  for (const ply of plies) {
    if (addPly(rep, key, ply, source)) added++;
    key = ply.key;
  }
  return added;
}

export function reachable(rep: Repertoire): Set<string> {
  const seen = new Set<string>([START_KEY]);
  const stack = [START_KEY];
  while (stack.length) {
    const key = stack.pop()!;
    for (const m of repMoves(rep, key)) {
      if (!seen.has(m.to)) {
        seen.add(m.to);
        stack.push(m.to);
      }
    }
  }
  return seen;
}

/** Drops positions no longer reachable from the start. Returns how many were removed. */
export function prune(rep: Repertoire): number {
  const keep = reachable(rep);
  let removed = 0;
  for (const key of Object.keys(rep.nodes)) {
    if (!keep.has(key)) {
      delete rep.nodes[key];
      delete rep.cards[key];
      removed++;
    }
  }
  rep.nodes[START_KEY] ??= { moves: [] };
  return removed;
}

export function removeMove(rep: Repertoire, key: string, uci: string): number {
  const node = rep.nodes[key];
  if (!node) return 0;
  node.moves = node.moves.filter((m) => m.uci !== uci);
  rep.updatedAt = Date.now();
  return prune(rep);
}

/** Number of positions that would disappear if this move were removed. */
export function removalCost(rep: Repertoire, key: string, uci: string): number {
  const before = reachable(rep).size;
  const node = rep.nodes[key];
  if (!node) return 0;
  const saved = node.moves;
  node.moves = saved.filter((m) => m.uci !== uci);
  const after = reachable(rep).size;
  node.moves = saved;
  return before - after;
}

/** Puts a move first: it becomes the main line in PGN export and the preferred move. */
export function makeMain(rep: Repertoire, key: string, uci: string) {
  const node = rep.nodes[key];
  if (!node) return;
  const i = node.moves.findIndex((m) => m.uci === uci);
  if (i > 0) node.moves.unshift(...node.moves.splice(i, 1));
  rep.updatedAt = Date.now();
}

export function setComment(rep: Repertoire, key: string, comment: string) {
  const node = (rep.nodes[key] ??= { moves: [] });
  if (comment.trim()) node.comment = comment.trim();
  else delete node.comment;
  rep.updatedAt = Date.now();
}

export interface RepStats {
  positions: number;
  moves: number;
  lines: number;
  cards: number;
  due: number;
}

export function repStats(rep: Repertoire, now = Date.now()): RepStats {
  let moves = 0;
  let lines = 0;
  let cards = 0;
  let due = 0;
  for (const [key, node] of Object.entries(rep.nodes)) {
    moves += node.moves.length;
    if (!node.moves.length) lines++;
    if (node.moves.length && isOwnerTurn(rep, key)) {
      cards++;
      const c = rep.cards[key];
      if (!c || c.due <= now) due++;
    }
  }
  return { positions: Object.keys(rep.nodes).length, moves, lines, cards, due };
}

/** Writes the repertoire as one PGN game with variations. Transpositions are written once. */
export function exportPgn(rep: Repertoire, event: string): string {
  const expanded = new Set<string>();
  const num = (ply: number, force: boolean) =>
    ply % 2 === 0 ? `${ply / 2 + 1}. ` : force ? `${(ply + 1) / 2}... ` : '';
  const commentOf = (key: string) => {
    const c = rep.nodes[key]?.comment;
    return c ? [`{${c.replace(/[{}]/g, '')}}`] : [];
  };

  const line = (key: string, ply: number, force: boolean): string[] => {
    const node = rep.nodes[key];
    if (!node?.moves.length) return [];
    if (expanded.has(key)) return ['{Transposition}'];
    expanded.add(key);
    const [main, ...alts] = node.moves;
    const mainComment = commentOf(main.to);
    // Main continuation first so that transpositions favour the main line.
    const cont = line(main.to, ply + 1, alts.length > 0 || mainComment.length > 0);
    const out = [num(ply, force) + main.san, ...mainComment];
    for (const alt of alts) {
      const altTokens = [num(ply, true) + alt.san, ...commentOf(alt.to), ...line(alt.to, ply + 1, false)];
      out.push(`(${altTokens.join(' ')})`);
    }
    return out.concat(cont);
  };

  const tokens = [...commentOf(START_KEY), ...line(START_KEY, 0, false), '*'];
  const wrapped: string[] = [];
  let cur = '';
  for (const t of tokens) {
    if (cur && cur.length + t.length + 1 > 90) {
      wrapped.push(cur);
      cur = t;
    } else cur = cur ? `${cur} ${t}` : t;
  }
  if (cur) wrapped.push(cur);
  const headers = [
    `[Event "${event}"]`,
    `[Site "Chess Openings Trainer"]`,
    `[Date "${new Date().toISOString().slice(0, 10).replace(/-/g, '.')}"]`,
    `[White "${rep.color === 'white' ? 'Moi' : '?'}"]`,
    `[Black "${rep.color === 'black' ? 'Moi' : '?'}"]`,
    `[Result "*"]`,
  ];
  return `${headers.join('\n')}\n\n${wrapped.join('\n')}\n`;
}

/** Adds every line of PGN games (variations included). Returns the number of new moves. */
export function importPgnGames(rep: Repertoire, games: PgnGame[]): number {
  let added = 0;
  for (const g of games) {
    if (g.headers.FEN && g.headers.FEN !== START_FEN) continue;
    for (const sans of g.lines) added += addLine(rep, pliesFromSans(sans), 'pgn');
  }
  return added;
}
