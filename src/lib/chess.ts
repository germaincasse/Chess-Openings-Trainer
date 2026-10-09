import { Chess, type Move } from 'chess.js';
import type { Key } from 'chessground/types';

export type Color = 'white' | 'black';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** Position identity: placement, side to move, castling, en passant (chess.js only emits a legal ep square). */
export function fenKey(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

export const START_KEY = fenKey(START_FEN);

export function keyToFen(key: string): string {
  return `${key} 0 1`;
}

export function fenTurn(fenOrKey: string): Color {
  return fenOrKey.split(' ')[1] === 'b' ? 'black' : 'white';
}

export const opposite = (c: Color): Color => (c === 'white' ? 'black' : 'white');

export const colorLabel = (c: Color) => (c === 'white' ? 'Blancs' : 'Noirs');

/** One half-move, with the position reached after it. */
export interface Ply {
  uci: string;
  san: string;
  fen: string;
  key: string;
}

export function moveUci(m: { from: string; to: string; promotion?: string }): string {
  return m.from + m.to + (m.promotion ?? '');
}

export function parseUci(uci: string): { from: string; to: string; promotion?: string } {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] };
}

export function toPly(m: Move): Ply {
  return { uci: moveUci(m), san: m.san, fen: m.after, key: fenKey(m.after) };
}

/** Plays a UCI move, returns null when illegal (chess.js throws on illegal moves). */
export function playUci(chess: Chess, uci: string): Move | null {
  try {
    return chess.move(parseUci(uci));
  } catch {
    return null;
  }
}

export function playSan(chess: Chess, san: string): Move | null {
  try {
    return chess.move(san);
  } catch {
    return null;
  }
}

/** Replays UCI moves from a position, stopping at the first illegal one. */
export function pliesFromUcis(ucis: string[], startFen = START_FEN): Ply[] {
  const chess = new Chess(startFen);
  const plies: Ply[] = [];
  for (const uci of ucis) {
    const m = playUci(chess, uci);
    if (!m) break;
    plies.push(toPly(m));
  }
  return plies;
}

export function pliesFromSans(sans: string[], startFen = START_FEN): Ply[] {
  const chess = new Chess(startFen);
  const plies: Ply[] = [];
  for (const san of sans) {
    const m = playSan(chess, san);
    if (!m) break;
    plies.push(toPly(m));
  }
  return plies;
}

/** Plays a single UCI move from a FEN. */
export function plyFrom(fen: string, uci: string): Ply | null {
  const m = playUci(new Chess(fen), uci);
  return m ? toPly(m) : null;
}

export function sanOf(fen: string, uci: string): string {
  return plyFrom(fen, uci)?.san ?? uci;
}

export function legalDests(chess: Chess): Map<Key, Key[]> {
  const dests = new Map<Key, Key[]>();
  for (const m of chess.moves({ verbose: true })) {
    const list = dests.get(m.from as Key);
    if (list) {
      if (!list.includes(m.to as Key)) list.push(m.to as Key);
    } else dests.set(m.from as Key, [m.to as Key]);
  }
  return dests;
}

/** Converts an engine PV (UCI) to SAN, stopping at the first illegal move. */
export function pvToSan(fen: string, pv: string[], max = 14): string[] {
  const chess = new Chess(fen);
  const out: string[] = [];
  for (const uci of pv.slice(0, max)) {
    const m = playUci(chess, uci);
    if (!m) break;
    out.push(m.san);
  }
  return out;
}

/** "1. e4 e5 2. Nf3" style text; startPly is the number of half-moves already played. */
export function formatLine(sans: string[], startPly = 0): string {
  const parts: string[] = [];
  sans.forEach((san, i) => {
    const ply = startPly + i;
    const num = Math.floor(ply / 2) + 1;
    if (ply % 2 === 0) parts.push(`${num}. ${san}`);
    else parts.push(i === 0 ? `${num}... ${san}` : san);
  });
  return parts.join(' ');
}

/** Label for a single move given the number of plies played before it. */
export function moveLabel(san: string, plyBefore: number): string {
  const num = Math.floor(plyBefore / 2) + 1;
  return plyBefore % 2 === 0 ? `${num}. ${san}` : `${num}... ${san}`;
}

export function plyCountOfFen(fen: string): number {
  const parts = fen.split(' ');
  const full = Number(parts[5] ?? 1);
  return (full - 1) * 2 + (parts[1] === 'b' ? 1 : 0);
}
