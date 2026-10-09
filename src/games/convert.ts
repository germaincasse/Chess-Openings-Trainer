import { Chess } from 'chess.js';
import { fenKey, moveUci, playSan } from '../lib/chess';
import { MAX_STORED_PLIES } from './types';

/** Replays the opening SAN moves once at import time so the tree can be built without chess logic. */
export function convertSans(sans: string[]): { ucis: string[]; sans: string[]; keys: string[] } {
  const chess = new Chess();
  const out = { ucis: [] as string[], sans: [] as string[], keys: [] as string[] };
  for (const san of sans.slice(0, MAX_STORED_PLIES)) {
    const m = playSan(chess, san);
    if (!m) break;
    out.ucis.push(moveUci(m));
    out.sans.push(m.san);
    out.keys.push(fenKey(m.after));
  }
  return out;
}
