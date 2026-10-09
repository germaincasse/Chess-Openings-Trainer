import { keyToFen, pliesFromUcis, plyFrom, sanOf, type Ply } from '../lib/chess';
import { addLine, addPly, hasMove, makeMain, reachable, removalCost, removeMove, type Repertoire } from '../repertoire/model';
import { evalStore } from '../store/store';
import type { Weakness } from './weaknesses';

/** Engine moves added after the corrected move (ends on one of your moves). */
const CONTINUATION_PLIES = 6;

/** The repertoire plays the engine move here and no longer the faulty one. */
export function isFixed(rep: Repertoire, w: Weakness): boolean {
  return !!w.best && hasMove(rep, w.key, w.best) && !(w.played && hasMove(rep, w.key, w.played));
}

export interface FixPlan {
  best: Ply;
  /** SAN of the faulty move when the repertoire currently has it. */
  playedSan?: string;
  /** Positions that disappear with the faulty move. */
  removes: number;
  /** The line leading to the position must be added first. */
  addsPath: boolean;
  /** Engine continuation after the best move, from the cached analysis. */
  continuation: Ply[];
}

/** What correcting an engine finding would change, so the caller can ask for confirmation. */
export function planFix(rep: Repertoire, w: Weakness): FixPlan | null {
  if (!w.best) return null;
  const fen = keyToFen(w.key);
  const best = plyFrom(fen, w.best);
  if (!best) return null;
  const hasPlayed = !!w.played && hasMove(rep, w.key, w.played);
  const pv = evalStore.get(`${w.key}|3`)?.lines.find((l) => l.pv[0] === w.best)?.pv ?? [];
  let continuation = pliesFromUcis(pv.slice(1, 1 + CONTINUATION_PLIES), best.fen);
  if (continuation.length % 2) continuation = continuation.slice(0, -1);
  return {
    best,
    playedSan: hasPlayed ? sanOf(fen, w.played!) : undefined,
    removes: hasPlayed ? removalCost(rep, w.key, w.played!) : 0,
    addsPath: !reachable(rep).has(w.key),
    continuation,
  };
}

/** Replaces the faulty move by the engine move (plus its continuation). Call repsChanged() afterwards. */
export function applyFix(rep: Repertoire, w: Weakness, plan: FixPlan) {
  if (plan.addsPath) addLine(rep, pliesFromUcis(w.path), 'manual');
  if (w.played && hasMove(rep, w.key, w.played)) removeMove(rep, w.key, w.played);
  addPly(rep, w.key, plan.best, 'engine');
  makeMain(rep, w.key, plan.best.uci);
  addLine(rep, plan.continuation, 'engine', plan.best.key);
  // The corrected position comes back first in review.
  const card = rep.cards[w.key];
  rep.cards[w.key] = { interval: 0, ease: card?.ease ?? 2.5, lapses: card?.lapses ?? 0, reps: 0, due: Date.now() };
}
