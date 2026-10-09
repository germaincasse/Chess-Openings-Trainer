import { fenTurn, keyToFen, START_KEY } from '../lib/chess';
import type { OpeningTree } from '../games/tree';
import { addPly, emptyRepertoire, isOwnerTurn, type Repertoire } from './model';

export interface GenerateOptions {
  /** Depth of the generated repertoire, in half-moves. */
  maxPly: number;
  /** Your moves: minimum number of games... */
  minGamesMine: number;
  /** ...and minimum share among your moves in that position (0..1). */
  minShareMine: number;
  /** Opponent replies: minimum number of games to be prepared. */
  minGamesOpp: number;
}

export const DEFAULT_GENERATE: GenerateOptions = { maxPly: 16, minGamesMine: 2, minShareMine: 0.25, minGamesOpp: 3 };

/** Builds the "usual repertoire" of a color from the games tree. */
export function generateFromTree(tree: OpeningTree, opts: GenerateOptions): Repertoire {
  const rep = emptyRepertoire(tree.color);
  const seen = new Set<string>([START_KEY]);
  const queue: [string, number][] = [[START_KEY, 0]];
  while (queue.length) {
    const [key, depth] = queue.shift()!;
    if (depth >= opts.maxPly) continue;
    const node = tree.nodes.get(key);
    if (!node?.moves.length) continue;
    const total = node.moves.reduce((s, m) => s + m.n, 0);
    let picked;
    if (fenTurn(key) === tree.color) {
      picked = node.moves.filter((m) => m.n >= opts.minGamesMine && m.n / total >= opts.minShareMine);
      if (!picked.length && node.moves[0].n >= opts.minGamesMine) picked = [node.moves[0]];
    } else {
      picked = node.moves.filter((m) => m.n >= opts.minGamesOpp);
    }
    for (const m of picked) {
      addPly(rep, key, { uci: m.uci, san: m.san, key: m.to, fen: keyToFen(m.to) }, 'import');
      if (!seen.has(m.to)) {
        seen.add(m.to);
        queue.push([m.to, depth + 1]);
      }
    }
  }
  trimOpponentLeaves(rep);
  return rep;
}

/** Lines should end on one of your moves: an opponent reply with no prepared answer teaches nothing. */
function trimOpponentLeaves(rep: Repertoire) {
  for (const [key, node] of Object.entries(rep.nodes)) {
    if (isOwnerTurn(rep, key)) continue;
    node.moves = node.moves.filter((m) => rep.nodes[m.to]?.moves.length);
  }
  // Removing moves can orphan positions.
  const keep = new Set<string>([START_KEY]);
  const stack = [START_KEY];
  while (stack.length) {
    for (const m of rep.nodes[stack.pop()!]?.moves ?? []) {
      if (!keep.has(m.to)) {
        keep.add(m.to);
        stack.push(m.to);
      }
    }
  }
  for (const key of Object.keys(rep.nodes)) if (!keep.has(key)) delete rep.nodes[key];
}

/** Copies every move of `src` into `dst` (keeps dst's own moves, comments and training state). */
export function mergeRepertoire(dst: Repertoire, src: Repertoire): number {
  let added = 0;
  for (const [key, node] of Object.entries(src.nodes)) {
    for (const m of node.moves) {
      if (addPly(dst, key, { uci: m.uci, san: m.san, key: m.to, fen: keyToFen(m.to) }, m.source)) added++;
    }
  }
  return added;
}
