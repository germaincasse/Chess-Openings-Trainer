import { useSyncExternalStore } from 'react';
import { applyFix, isFixed, planFix, type FixPlan } from '../analysis/fix';
import type { Weakness, WeaknessReport } from '../analysis/weaknesses';
import { t } from '../i18n';
import { colorLabel, formatLine, pliesFromUcis, type Color } from '../lib/chess';
import { repMoves, type Repertoire } from '../repertoire/model';
import { getState, repsChanged, startTraining, toast } from '../store/store';

// "My mistakes": theory mistakes found by Stockfish in your own games, and positions
// where you play something else than your repertoire.

export function isMistake(w: Weakness): boolean {
  return w.kind === 'engine' || w.id.startsWith('deviation:');
}

/** Mistakes of one side, most costly first. */
export function mistakesOf(report: WeaknessReport | null, color: Color): Weakness[] {
  if (!report) return [];
  return report.items.filter((w) => w.color === color && isMistake(w)).sort((a, b) => b.severity - a.severity);
}

/** UCI of the move played in your games (deviations only keep it as the red arrow). */
export function playedUci(w: Weakness): string | undefined {
  return w.played ?? w.arrows.find((a) => a.brush === 'red')?.uci;
}

/** Moves accepted at the mistake position: the engine move and your repertoire moves, never the faulty one. */
export function acceptedMoves(rep: Repertoire, w: Weakness): string[] {
  const out: string[] = w.kind === 'engine' && w.best ? [w.best] : [];
  for (const m of repMoves(rep, w.key)) if (!out.includes(m.uci)) out.push(m.uci);
  if (!out.length) for (const a of w.arrows) if (a.brush === 'green' && !out.includes(a.uci)) out.push(a.uci);
  const played = playedUci(w);
  return out.filter((u) => u !== played);
}

/** The engine finding is drilled without correcting the repertoire. */
export function isQuiz(rep: Repertoire, w: Weakness): boolean {
  return w.kind === 'engine' && !isFixed(rep, w);
}

// ---------- mastered lines (remembered in this browser) ----------

const DRILLED_KEY = 'cot.training.drilled';
const listeners = new Set<() => void>();

function loadDrilled(): Record<string, number> {
  try {
    const raw = localStorage.getItem(DRILLED_KEY);
    const value: unknown = raw ? JSON.parse(raw) : null;
    return value && typeof value === 'object' ? (value as Record<string, number>) : {};
  } catch {
    return {};
  }
}

let drilled = loadDrilled();

/** The focused line was replayed with the right move found on the first try. */
export function markDrilled(id: string) {
  drilled = { ...drilled, [id]: Date.now() };
  try {
    localStorage.setItem(DRILLED_KEY, JSON.stringify(drilled));
  } catch {
    // Not remembered after a reload.
  }
  for (const l of listeners) l();
}

/** Forgets every mastered line (for a full data reset). */
export function clearDrilled() {
  drilled = {};
  try {
    localStorage.removeItem(DRILLED_KEY);
  } catch {
    // Nothing stored.
  }
  for (const l of listeners) l();
}

export function getDrilled(): Record<string, number> {
  return drilled;
}

export function useDrilled(): Record<string, number> {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => drilled,
  );
}

export interface MistakeState {
  /** Engine finding: the repertoire now plays the engine move. */
  fixed: boolean;
  drilled: boolean;
  /** Nothing left to do: fixed (engine findings) and mastered. */
  done: boolean;
}

export function mistakeState(rep: Repertoire, w: Weakness, marks: Record<string, number> = drilled): MistakeState {
  const fixed = w.kind === 'engine' && isFixed(rep, w);
  const d = !!marks[w.id];
  return { fixed, drilled: d, done: d && (w.kind !== 'engine' || fixed) };
}

// ---------- repertoire fix ----------

function fixMessage(w: Weakness, plan: FixPlan): string {
  const color = colorLabel(w.color);
  const best = plan.best.san;
  const parts = [
    plan.playedSan
      ? t('training.fixReplace', { played: plan.playedSan, best, color })
      : t('training.fixAdd', { best, color }),
  ];
  if (plan.playedSan) {
    parts.push(
      plan.removes > 0
        ? t('training.fixRemoves', { played: plan.playedSan, count: plan.removes })
        : t('training.fixRemovesNone', { played: plan.playedSan }),
    );
  }
  if (plan.addsPath && w.path.length) {
    parts.push(t('training.fixAddsPath', { line: formatLine(pliesFromUcis(w.path).map((p) => p.san)) }));
  }
  if (plan.continuation.length) {
    const line = formatLine(
      plan.continuation.map((p) => p.san),
      w.path.length + 1,
    );
    parts.push(t('training.fixContinuation', { best, count: plan.continuation.length, line }));
  }
  parts.push(t('training.fixChoice'));
  return parts.join('\n\n');
}

/** Engine finding not corrected yet: offers to fix the repertoire. Returns true when it was fixed. */
export function offerFix(w: Weakness): boolean {
  if (w.kind !== 'engine' || !w.best) return false;
  const rep = getState().reps[w.color];
  if (isFixed(rep, w)) return false;
  const plan = planFix(rep, w);
  if (!plan) {
    toast(t('training.fixInvalid'), 'error');
    return false;
  }
  if (!confirm(fixMessage(w, plan))) return false;
  applyFix(rep, w, plan);
  repsChanged();
  toast(t('training.fixedToast', { best: plan.best.san, color: colorLabel(w.color) }));
  return true;
}

// ---------- opening a mistake from another view ----------

let pending: Weakness | null = null;

export function peekPendingMistake(): Weakness | null {
  return pending;
}

export function takePendingMistake(): Weakness | null {
  const w = pending;
  pending = null;
  return w;
}

/** Offers the fix, then opens the training view on the focused drill of this mistake. */
export function trainMistake(w: Weakness) {
  offerFix(w);
  pending = w;
  startTraining([], w.color);
}
