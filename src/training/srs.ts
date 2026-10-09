import { START_KEY } from '../lib/chess';
import { DAY } from '../lib/util';
import { isOwnerTurn, type Card, type RepMove, type Repertoire } from '../repertoire/model';

// Simplified SM-2: each position where you must find your move is a card.

export function isDue(card: Card | undefined, now: number): boolean {
  return !card || card.due <= now;
}

export function review(card: Card | undefined, ok: boolean, now = Date.now()): Card {
  const c: Card = card ? { ...card } : { due: now, interval: 0, ease: 2.5, reps: 0, lapses: 0 };
  c.last = now;
  if (ok) {
    c.reps++;
    c.interval = c.reps === 1 ? 1 : c.reps === 2 ? 3 : Math.round(c.interval * c.ease);
    c.ease = Math.min(3, c.ease + 0.05);
    c.due = now + c.interval * DAY;
  } else {
    c.reps = 0;
    c.lapses++;
    c.interval = 0;
    c.ease = Math.max(1.3, c.ease - 0.2);
    c.due = now + 10 * 60 * 1000;
  }
  return c;
}

/** Number of due cards reachable below each position (memoized, transposition safe). */
export function dueCounter(rep: Repertoire, now = Date.now()) {
  const memo = new Map<string, number>();
  const onPath = new Set<string>();
  const count = (key: string): number => {
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    if (onPath.has(key)) return 0;
    onPath.add(key);
    const node = rep.nodes[key];
    let n = 0;
    if (node?.moves.length) {
      if (isOwnerTurn(rep, key) && isDue(rep.cards[key], now)) n++;
      for (const m of node.moves) n += count(m.to);
    }
    onPath.delete(key);
    memo.set(key, n);
    return n;
  };
  return count;
}

export type TrainingMode = 'review' | 'free';

/** Picks the opponent reply: in review mode, lines with due positions are favoured. */
export function pickReply(moves: RepMove[], mode: TrainingMode, due: (key: string) => number): RepMove {
  const weights = moves.map((m) => (mode === 'review' ? due(m.to) : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return moves[Math.floor(Math.random() * moves.length)];
  let r = Math.random() * total;
  for (let i = 0; i < moves.length; i++) {
    r -= weights[i];
    if (r < 0) return moves[i];
  }
  return moves[moves.length - 1];
}

export function totalDue(rep: Repertoire, rootKey = START_KEY): number {
  return dueCounter(rep)(rootKey);
}
