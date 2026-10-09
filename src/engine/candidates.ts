import { useSyncExternalStore } from 'react';
import { Chess } from 'chess.js';
import { fenTurn } from '../lib/chess';
import { loadKey, removeKey, saveKey } from '../store/db';
import { Engine } from './engine';
import { classifyLoss, lineCp, winLoss, type MoveClass } from './evaluation';

// Evaluates given moves of a position (repertoire moves, moves from your games, moves of the
// displayed line) with a second engine, so each move can show its evaluation and quality.
// Results are cached per position and kept in IndexedDB.

export interface PositionEval {
  depth: number;
  best: string;
  /** Centipawns from White's point of view. */
  bestCp: number;
  moves: Record<string, number>;
}

export interface Target {
  key: string;
  fen: string;
  moves: string[];
}

export const CANDIDATE_DEPTH = 16;
const STORE_KEY = 'moveEvals';

let cache: Record<string, PositionEval> = {};
let loaded: Promise<void> | null = null;
let engine: Engine | null = null;
let queue: Target[] = [];
let busy = false;
let version = 0;
let saveTimer = 0;
const listeners = new Set<() => void>();

function emit() {
  version++;
  for (const l of listeners) l();
}

function persist() {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => saveKey(STORE_KEY, cache).catch(() => {}), 1500);
}

function load(): Promise<void> {
  return (loaded ??= loadKey<Record<string, PositionEval>>(STORE_KEY).then((c) => {
    cache = { ...c, ...cache };
    emit();
  }));
}

function missing(t: Target): string[] {
  const e = cache[t.key];
  if (!e || e.depth < CANDIDATE_DEPTH) return t.moves;
  return t.moves.filter((m) => e.moves[m] === undefined);
}

function isDone(t: Target): boolean {
  const e = cache[t.key];
  return !!e && e.depth >= CANDIDATE_DEPTH && missing(t).length === 0;
}

async function pump() {
  if (busy) return;
  busy = true;
  await load();
  try {
    engine ??= new Engine(16);
    for (let target = queue.shift(); target; target = queue.shift()) {
      if (isDone(target) || engine.error) continue;
      let e = cache[target.key];
      if (!e || e.depth < CANDIDATE_DEPTH) {
        const res = await engine.analyze(target.fen, { multiPv: 1, depth: CANDIDATE_DEPTH });
        const line = res.lines[0];
        if (res.cancelled || !line?.pv[0]) continue;
        e = { depth: CANDIDATE_DEPTH, best: line.pv[0], bestCp: lineCp(line), moves: { [line.pv[0]]: lineCp(line) } };
        cache[target.key] = e;
        emit();
      }
      const todo = missing(target);
      if (todo.length) {
        const res = await engine.analyze(target.fen, { multiPv: todo.length, depth: CANDIDATE_DEPTH, searchMoves: todo });
        if (res.cancelled) continue;
        const sign = fenTurn(target.fen) === 'white' ? 1 : -1;
        for (const l of res.lines) {
          const uci = l?.pv[0];
          if (!uci) continue;
          const cp = lineCp(l);
          e.moves[uci] = cp;
          // A restricted search can find a move the first search ranked lower.
          if (cp * sign > e.bestCp * sign) {
            e.best = uci;
            e.bestCp = cp;
          }
        }
        emit();
      }
      persist();
    }
  } finally {
    busy = false;
  }
}

/** Replaces the pending work: the first target is evaluated first. */
export function requestEvals(targets: Target[]) {
  queue = targets.filter((t) => t.moves.length && !isDone(t) && !new Chess(t.fen).isGameOver());
  void pump();
}

export function stopEvals() {
  queue = [];
  engine?.stop();
}

export function getPositionEval(key: string): PositionEval | undefined {
  return cache[key];
}

/** Evaluation (White's point of view) and quality of a move, when known. */
export function moveQuality(key: string, uci: string): { cp: number; cls: MoveClass } | undefined {
  const e = cache[key];
  const cp = e?.moves[uci];
  if (!e || cp === undefined) return undefined;
  return { cp, cls: classifyLoss(winLoss(e.bestCp, cp, fenTurn(key)), uci === e.best) };
}

/** Re-renders when new evaluations arrive. */
export function useCandidateEvals(): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );
}

export async function clearCandidateEvals() {
  cache = {};
  await removeKey(STORE_KEY);
  emit();
}
