// Copies the single-threaded lite Stockfish build (no COOP/COEP headers needed,
// so it runs on GitHub Pages) from node_modules into public/engine/.
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';

const src = new URL('../node_modules/stockfish/bin/', import.meta.url);
const dst = new URL('../public/engine/', import.meta.url);
const js = readdirSync(src).find((f) => /-lite-single\.js$/.test(f));
if (!js) throw new Error('Stockfish lite-single introuvable dans node_modules/stockfish/bin');

mkdirSync(dst, { recursive: true });
copyFileSync(new URL(js, src), new URL('stockfish.js', dst));
copyFileSync(new URL(js.replace(/\.js$/, '.wasm'), src), new URL('stockfish.wasm', dst));
console.log(`Moteur copie : ${js}`);
