import { t } from '../i18n';
import type { Color } from '../lib/chess';

export type Site = 'lichess' | 'chesscom';
export type Speed = 'ultrabullet' | 'bullet' | 'blitz' | 'rapid' | 'classical' | 'daily';
export type Result = 'win' | 'draw' | 'loss';

export const speedLabel = (s: Speed) => t(`common.speed.${s}`);

const speed = (id: Speed, sites: Site[]) => ({
  id,
  sites,
  /** Translated on read. */
  get label() {
    return speedLabel(id);
  },
});

export const SPEEDS: { id: Speed; readonly label: string; sites: Site[] }[] = [
  speed('ultrabullet', ['lichess']),
  speed('bullet', ['lichess', 'chesscom']),
  speed('blitz', ['lichess', 'chesscom']),
  speed('rapid', ['lichess', 'chesscom']),
  speed('classical', ['lichess']),
  speed('daily', ['lichess', 'chesscom']),
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
