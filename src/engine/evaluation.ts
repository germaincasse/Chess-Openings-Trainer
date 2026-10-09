import type { Color } from '../lib/chess';
import type { EngineLine } from './engine';

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
  const v = (l.cp ?? 0) / 100;
  return `${v > 0 ? '+' : ''}${v.toFixed(Math.abs(v) >= 10 ? 0 : 1)}`;
}

export function formatCp(cp: number): string {
  if (Math.abs(cp) >= MATE_CP - 1000) return cp > 0 ? 'mat' : '-mat';
  const v = cp / 100;
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
}
