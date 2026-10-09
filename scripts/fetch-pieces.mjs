// Downloads the SVG piece sets offered in the appearance menu from the lichess repository
// (lichess-org/lila, public/piece/<set>/) into public/pieces/<set>/. Re-runnable.
// Only sets whose license allows redistribution in this GPL-3.0 project are listed
// (see lila's COPYING.md, and src/theme/themes.ts for the credits shown in the app).
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = 'https://raw.githubusercontent.com/lichess-org/lila/master/public/piece/';

const SETS = [
  'cburnett', // Colin M.L. Burnett, GPLv2+
  'merida', // Armando Hernandez Marroquin, GPLv2+
  'chessnut', // Alexis Luengas, Apache 2.0
  'mpchess', // Maxime Chupin, GPLv3+
  'spatial', // Maurizio Monge, MIT
  'fantasy', // Maurizio Monge, MIT
  'celtic', // Maurizio Monge, MIT
  'rhosgfx', // RhosGFX, CC0 1.0
];

const FILES = ['wP', 'wN', 'wB', 'wR', 'wQ', 'wK', 'bP', 'bN', 'bB', 'bR', 'bQ', 'bK'];

async function download(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (!text.includes('<svg')) throw new Error('pas un SVG');
      return text;
    } catch (e) {
      if (attempt >= 3) throw new Error(`${url} : ${e.message}`);
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
}

let count = 0;
for (const set of SETS) {
  const dir = new URL(`../public/pieces/${set}/`, import.meta.url);
  mkdirSync(dir, { recursive: true });
  const svgs = await Promise.all(FILES.map((f) => download(`${BASE}${set}/${f}.svg`)));
  FILES.forEach((f, i) => writeFileSync(new URL(`${f}.svg`, dir), svgs[i]));
  count += FILES.length;
  console.log(`${set} : ${FILES.length} fichiers`);
}
console.log(`${SETS.length} jeux de pieces, ${count} fichiers dans public/pieces/`);
