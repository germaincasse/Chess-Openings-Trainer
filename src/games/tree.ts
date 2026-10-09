import { START_KEY, type Color } from '../lib/chess';
import { openingAt, openingFamily } from '../lib/openings';
import type { GameRecord, Result, Speed } from './types';

export interface Stats {
  n: number;
  w: number;
  d: number;
  l: number;
}

export interface TreeMove extends Stats {
  uci: string;
  san: string;
  to: string;
  last: number;
}

export interface TreeNode extends Stats {
  /** Smallest ply at which the position was reached. */
  ply: number;
  moves: TreeMove[];
  /** Most common shortest route to this position: [parent key, uci]. */
  parent?: [string, string];
}

/** Aggregate of the owner's games with one color: every position reached and the moves played from it. */
export interface OpeningTree {
  color: Color;
  nodes: Map<string, TreeNode>;
}

export interface TreeFilter {
  speeds?: Speed[];
  since?: number;
}

export const emptyStats = (): Stats => ({ n: 0, w: 0, d: 0, l: 0 });

export function addResult(s: Stats, r: Result) {
  s.n++;
  if (r === 'win') s.w++;
  else if (r === 'draw') s.d++;
  else s.l++;
}

/** Score from the owner's point of view, 0..1. */
export function scoreOf(s: Stats): number {
  return s.n ? (s.w + s.d / 2) / s.n : 0;
}

export function filterGames(games: GameRecord[], f: TreeFilter): GameRecord[] {
  return games.filter((g) => (!f.speeds || f.speeds.includes(g.speed)) && (!f.since || g.playedAt >= f.since));
}

export function buildTree(games: GameRecord[], color: Color): OpeningTree {
  const nodes = new Map<string, TreeNode>();
  const nodeAt = (key: string, ply: number) => {
    let node = nodes.get(key);
    if (!node) {
      node = { ...emptyStats(), ply, moves: [] };
      nodes.set(key, node);
    } else if (ply < node.ply) node.ply = ply;
    return node;
  };

  for (const g of games) {
    if (g.color !== color) continue;
    let node = nodeAt(START_KEY, 0);
    addResult(node, g.result);
    for (let i = 0; i < g.ucis.length; i++) {
      let move = node.moves.find((m) => m.uci === g.ucis[i]);
      if (!move) {
        move = { ...emptyStats(), uci: g.ucis[i], san: g.sans[i], to: g.keys[i], last: 0 };
        node.moves.push(move);
      }
      addResult(move, g.result);
      if (g.playedAt > move.last) move.last = g.playedAt;
      node = nodeAt(g.keys[i], i + 1);
      addResult(node, g.result);
    }
  }

  // Parent links follow the most played edge among the shortest routes, so paths never loop.
  const best = new Map<string, number>();
  for (const [key, node] of nodes) {
    node.moves.sort((a, b) => b.n - a.n);
    for (const m of node.moves) {
      const child = nodes.get(m.to)!;
      if (child.ply === node.ply + 1 && m.n > (best.get(m.to) ?? 0)) {
        best.set(m.to, m.n);
        child.parent = [key, m.uci];
      }
    }
  }
  return { color, nodes };
}

/** UCI moves leading from the start to a position of the tree. */
export function treePath(tree: OpeningTree, key: string): string[] {
  const path: string[] = [];
  let cur = tree.nodes.get(key);
  while (cur?.parent) {
    path.unshift(cur.parent[1]);
    cur = tree.nodes.get(cur.parent[0]);
  }
  return path;
}

export interface OpeningUsage extends Stats {
  name: string;
  eco: string;
  family: string;
  /** A representative game route, to open it on the board. */
  ucis: string[];
}

/** Groups the owner's games by named opening (deepest named position within the first 24 plies). */
export function openingUsage(games: GameRecord[], color: Color, byFamily: boolean): OpeningUsage[] {
  const map = new Map<string, OpeningUsage>();
  for (const g of games) {
    if (g.color !== color) continue;
    const keys = g.keys.slice(0, 24);
    let depth = keys.length;
    while (depth > 0 && !openingAt(keys[depth - 1])) depth--;
    const op = depth ? openingAt(keys[depth - 1]) : undefined;
    const name = op ? (byFamily ? openingFamily(op.name) : op.name) : 'Ouverture non répertoriée';
    let u = map.get(name);
    if (!u) {
      const family = op ? openingFamily(op.name) : name;
      u = { ...emptyStats(), name, eco: op?.eco ?? '', family, ucis: g.ucis.slice(0, depth || 2) };
      map.set(name, u);
    }
    addResult(u, g.result);
  }
  return [...map.values()].sort((a, b) => b.n - a.n);
}
