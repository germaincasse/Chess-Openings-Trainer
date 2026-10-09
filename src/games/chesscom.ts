import { t } from '../i18n';
import { convertSans } from './convert';
import type { GameRecord, ImportOptions, ImportProgress, Result, Speed } from './types';
import { START_FEN, type Color } from '../lib/chess';
import { parseMovetext } from '../lib/pgn';
import { yieldToUi } from '../lib/util';

const DRAWS = new Set(['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient']);

interface ChesscomPlayer {
  username: string;
  rating?: number;
  result: string;
}

interface ChesscomGame {
  url: string;
  uuid?: string;
  pgn?: string;
  end_time: number;
  rated: boolean;
  time_class: string;
  rules: string;
  initial_setup?: string;
  white: ChesscomPlayer;
  black: ChesscomPlayer;
}

const SPEED_OF: Record<string, Speed> = { bullet: 'bullet', blitz: 'blitz', rapid: 'rapid', daily: 'daily' };

function movetextOf(pgn: string): string {
  // Headers are one per line at the top; movetext follows the first blank line.
  const i = pgn.search(/\r?\n\r?\n/);
  return i >= 0 ? pgn.slice(i) : pgn;
}

function toRecord(g: ChesscomGame, user: string): GameRecord | null {
  if (g.rules !== 'chess' || !g.pgn) return null;
  if (g.initial_setup && g.initial_setup !== START_FEN) return null;
  const color: Color = g.white.username.toLowerCase() === user ? 'white' : 'black';
  const me = g[color];
  const opp = g[color === 'white' ? 'black' : 'white'];
  const result: Result = me.result === 'win' ? 'win' : DRAWS.has(me.result) ? 'draw' : 'loss';
  const conv = convertSans(parseMovetext(movetextOf(g.pgn)).main);
  if (!conv.ucis.length) return null;
  return {
    id: `chesscom:${g.uuid ?? g.url}`,
    site: 'chesscom',
    url: g.url,
    playedAt: g.end_time * 1000,
    speed: SPEED_OF[g.time_class] ?? 'blitz',
    rated: g.rated,
    color,
    result,
    opponent: opp.username,
    opponentRating: opp.rating,
    myRating: me.rating,
    ...conv,
  };
}

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { signal });
    if (res.status === 429 && attempt < 3) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    if (res.status === 404) throw new Error('404');
    if (!res.ok) throw new Error(t('common.httpError', { site: 'Chess.com', status: res.status }));
    return res.json() as Promise<T>;
  }
}

export async function fetchChesscomGames(
  opts: ImportOptions,
  onProgress: (p: ImportProgress) => void,
  signal: AbortSignal,
): Promise<GameRecord[]> {
  const user = opts.username.trim().toLowerCase();
  let archives: string[];
  try {
    archives = (await getJson<{ archives: string[] }>(
      `https://api.chess.com/pub/player/${encodeURIComponent(user)}/games/archives`,
      signal,
    )).archives;
  } catch (e) {
    if ((e as Error).message === '404') throw new Error(t('common.accountNotFound', { site: 'Chess.com', user: opts.username }));
    throw e;
  }

  const games: GameRecord[] = [];
  let fetched = 0;
  // Archives are monthly and listed oldest first.
  for (const url of [...archives].reverse()) {
    if (games.length >= opts.maxGames) break;
    const month = url.split('/').slice(-2).join('/');
    onProgress({ fetched, kept: games.length, message: t('common.chesscomMonth', { month }) });
    const { games: monthGames } = await getJson<{ games: ChesscomGame[] }>(url, signal);
    monthGames.sort((a, b) => b.end_time - a.end_time);
    for (const g of monthGames) {
      fetched++;
      if (!opts.speeds.includes(SPEED_OF[g.time_class])) continue;
      if (opts.ratedOnly && !g.rated) continue;
      const rec = toRecord(g, user);
      if (!rec || (opts.colors !== 'both' && rec.color !== opts.colors)) continue;
      games.push(rec);
      if (games.length >= opts.maxGames) break;
    }
    onProgress({ fetched, kept: games.length, message: t('common.chesscomKept', { count: games.length }) });
    await yieldToUi();
  }
  return games;
}
