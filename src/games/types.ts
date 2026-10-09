import type { Color } from '../lib/chess';

export type Site = 'lichess' | 'chesscom';
export type Speed = 'ultrabullet' | 'bullet' | 'blitz' | 'rapid' | 'classical' | 'daily';
export type Result = 'win' | 'draw' | 'loss';

export const SPEEDS: { id: Speed; label: string; sites: Site[] }[] = [
  { id: 'ultrabullet', label: 'UltraBullet', sites: ['lichess'] },
  { id: 'bullet', label: 'Bullet', sites: ['lichess', 'chesscom'] },
  { id: 'blitz', label: 'Blitz', sites: ['lichess', 'chesscom'] },
  { id: 'rapid', label: 'Rapide', sites: ['lichess', 'chesscom'] },
  { id: 'classical', label: 'Classique', sites: ['lichess'] },
  { id: 'daily', label: 'Par correspondance', sites: ['lichess', 'chesscom'] },
];

export const SITE_LABEL: Record<Site, string> = { lichess: 'Lichess', chesscom: 'Chess.com' };

/** Opening part of a game, from the account owner's point of view. */
export interface GameRecord {
  id: string;
  site: Site;
  url: string;
  playedAt: number;
  speed: Speed;
  rated: boolean;
  color: Color;
  result: Result;
  opponent: string;
  opponentRating?: number;
  myRating?: number;
  /** First plies only (see MAX_STORED_PLIES). */
  ucis: string[];
  sans: string[];
  /** Position key after each ply. */
  keys: string[];
}

export const MAX_STORED_PLIES = 40;

export interface ImportOptions {
  site: Site;
  username: string;
  maxGames: number;
  speeds: Speed[];
  ratedOnly: boolean;
  colors: 'both' | Color;
}

export interface GameSource {
  id: string; // `${site}:${username}`
  site: Site;
  username: string;
  importedAt: number;
  options: ImportOptions;
  games: GameRecord[];
}

export interface ImportProgress {
  fetched: number;
  kept: number;
  message: string;
}
