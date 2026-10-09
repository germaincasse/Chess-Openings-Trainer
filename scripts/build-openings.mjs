// Downloads the Lichess chess-openings dataset (CC0) and writes public/openings.json,
// a map from position key (first 4 FEN fields) to [eco, name].
import { writeFileSync } from 'node:fs';
import { Chess } from 'chess.js';

const BASE = 'https://raw.githubusercontent.com/lichess-org/chess-openings/master/';
const FILES = ['a.tsv', 'b.tsv', 'c.tsv', 'd.tsv', 'e.tsv'];

const fenKey = (fen) => fen.split(' ').slice(0, 4).join(' ');

const entries = [];
for (const file of FILES) {
  const text = await (await fetch(BASE + file)).text();
  for (const row of text.trim().split('\n').slice(1)) {
    const [eco, name, pgn] = row.split('\t');
    entries.push({ eco, name, pgn });
  }
}

const out = {};
for (const { eco, name, pgn } of entries) {
  const chess = new Chess();
  chess.loadPgn(pgn);
  const key = fenKey(chess.fen());
  const plies = chess.history().length;
  // On transpositions keep the name reached by the shortest move order.
  if (!out[key] || out[key][2] > plies) out[key] = [eco, name, plies];
}
for (const k of Object.keys(out)) out[k].length = 2;

writeFileSync(new URL('../public/openings.json', import.meta.url), JSON.stringify(out));
console.log(`${entries.length} lignes, ${Object.keys(out).length} positions`);
