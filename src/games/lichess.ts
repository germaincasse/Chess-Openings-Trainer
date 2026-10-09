import { convertSans } from './convert';
import type { GameRecord, ImportOptions, ImportProgress, Result, Speed } from './types';
import type { Color } from '../lib/chess';
import { yieldToUi } from '../lib/util';

const PERF: Partial<Record<Speed, string>> = {
  ultrabullet: 'ultraBullet',
  bullet: 'bullet',
  blitz: 'blitz',
  rapid: 'rapid',
  classical: 'classical',
  daily: 'correspondence',
};

const SPEED_OF: Record<string, Speed> = {
  ultraBullet: 'ultrabullet',
  bullet: 'bullet',
  blitz: 'blitz',
  rapid: 'rapid',
  classical: 'classical',
  correspondence: 'daily',
};

const UNFINISHED = new Set(['created', 'started', 'aborted', 'noStart', 'unknownFinish']);

interface LichessPlayer {
  user?: { name: string; id: string };
  rating?: number;
  aiLevel?: number;
}

interface LichessGame {
  id: string;
  rated: boolean;
  variant: string;
  speed: string;
  createdAt: number;
  status: string;
  initialFen?: string;
  players: { white: LichessPlayer; black: LichessPlayer };
  winner?: Color;
  moves?: string;
}

function toRecord(g: LichessGame, userId: string): GameRecord | null {
  if (g.variant !== 'standard' || g.initialFen || UNFINISHED.has(g.status) || !g.moves) return null;
  const color: Color = g.players.white.user?.id === userId ? 'white' : 'black';
  const me = g.players[color];
  const opp = g.players[color === 'white' ? 'black' : 'white'];
  const result: Result = g.winner ? (g.winner === color ? 'win' : 'loss') : 'draw';
  const conv = convertSans(g.moves.split(' '));
  if (!conv.ucis.length) return null;
  return {
    id: `lichess:${g.id}`,
    site: 'lichess',
    url: `https://lichess.org/${g.id}${color === 'black' ? '/black' : ''}`,
    playedAt: g.createdAt,
    speed: SPEED_OF[g.speed] ?? 'blitz',
    rated: g.rated,
    color,
    result,
    opponent: opp.user?.name ?? (opp.aiLevel ? `Stockfish niveau ${opp.aiLevel}` : 'Anonyme'),
    opponentRating: opp.rating,
    myRating: me.rating,
    ...conv,
  };
}

export async function fetchLichessGames(
  opts: ImportOptions,
  onProgress: (p: ImportProgress) => void,
  signal: AbortSignal,
): Promise<GameRecord[]> {
  const userId = opts.username.trim().toLowerCase();
  const params = new URLSearchParams({
    max: String(opts.maxGames),
    moves: 'true',
    clocks: 'false',
    evals: 'false',
    opening: 'false',
    perfType: opts.speeds.map((s) => PERF[s]).filter(Boolean).join(','),
  });
  if (opts.ratedOnly) params.set('rated', 'true');
  if (opts.colors !== 'both') params.set('color', opts.colors);

  const res = await fetch(`https://lichess.org/api/games/user/${encodeURIComponent(userId)}?${params}`, {
    headers: { Accept: 'application/x-ndjson' },
    signal,
  });
  if (res.status === 404) throw new Error(`Compte Lichess "${opts.username}" introuvable.`);
  if (res.status === 429) throw new Error('Lichess limite les requêtes : réessaie dans une minute.');
  if (!res.ok || !res.body) throw new Error(`Erreur Lichess (${res.status}).`);

  const games: GameRecord[] = [];
  const seen = new Set<string>();
  let fetched = 0;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const handle = (line: string) => {
    if (!line.trim() || games.length >= opts.maxGames) return;
    fetched++;
    const rec = toRecord(JSON.parse(line) as LichessGame, userId);
    if (rec && !seen.has(rec.id)) {
      seen.add(rec.id);
      games.push(rec);
    }
  };
  while (games.length < opts.maxGames) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    lines.forEach(handle);
    onProgress({ fetched, kept: games.length, message: `${fetched} parties reçues de Lichess` });
    await yieldToUi();
  }
  handle(buffer);
  reader.cancel().catch(() => {});
  onProgress({ fetched, kept: games.length, message: `${fetched} parties reçues de Lichess` });
  return games;
}
