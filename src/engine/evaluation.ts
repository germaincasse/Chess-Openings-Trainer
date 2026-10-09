import type { Color } from '../lib/chess';
import type { EngineLine } from './engine';

export type MoveClass = 'best' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

const MATE_CP = 10000;

/** Centipawns from White's point of view, mates mapped to large values. */
export function lineCp(l: Pick<EngineLine, 'cp' | 'mate'>): number {
  if (l.mate !== undefined) {
    if (l.mate === 0) return 0;
    return Math.sign(l.mate) * (MATE_CP - Math.abs(l.mate) * 10);
  }
  return l.cp ?? 0;
}

export function cpFor(cpWhite: number, color: Color): number {
  return color === 'white' ? cpWhite : -cpWhite;
}

/** Lichess win-chance model, -1..1 from the cp point of view. */
export function winChance(cp: number): number {
  const c = Math.max(-1500, Math.min(1500, cp));
  return 2 / (1 + Math.exp(-0.00368208 * c)) - 1;
}

/** Win percentage 0..100. */
export function winPct(cp: number): number {
  return 50 + 50 * winChance(cp);
}

export function formatEval(l: Pick<EngineLine, 'cp' | 'mate'> | undefined): string {
  if (!l) return '';
  if (l.mate !== undefined) return l.mate === 0 ? '#' : `#${l.mate > 0 ? '' : '-'}${Math.abs(l.mate)}`;
  const digits = Math.abs((l.cp ?? 0) / 100) >= 10 ? 0 : 1;
  return signed(Number(((l.cp ?? 0) / 100).toFixed(digits)), digits);
}

export function formatCp(cp: number): string {
  if (Math.abs(cp) >= MATE_CP - 1000) return cp > 0 ? '#' : '-#';
  return signed(Number((cp / 100).toFixed(1)), 1);
}

/** "+0.3", "-1.2", and "0.0" rather than "-0.0". */
function signed(v: number, digits: number): string {
  if (v === 0) return (0).toFixed(digits);
  return `${v > 0 ? '+' : ''}${v.toFixed(digits)}`;
}

/** Drop in win percentage (0..100) of playing a move instead of the best one, for the side that moves. */
export function winLoss(bestCpWhite: number, moveCpWhite: number, mover: Color): number {
  return Math.max(0, winPct(cpFor(bestCpWhite, mover)) - winPct(cpFor(moveCpWhite, mover)));
}

/** chess.com-like move quality; inaccuracy / mistake / blunder follow the Lichess thresholds. */
export function classifyLoss(loss: number, isBest: boolean): MoveClass {
  if (isBest || loss < 1) return 'best';
  if (loss < 2.5) return 'excellent';
  if (loss < 5) return 'good';
  if (loss < 10) return 'inaccuracy';
  if (loss < 15) return 'mistake';
  return 'blunder';
}
