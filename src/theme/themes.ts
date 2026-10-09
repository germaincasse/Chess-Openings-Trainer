import type { TKey } from '../i18n';

// Board colours and piece sets. Piece SVGs live in public/pieces/<set>/ (downloaded from the
// lichess repository by scripts/fetch-pieces.mjs); every set below allows redistribution in a
// GPL-3.0 project.

export interface PieceSet {
  id: string;
  name: string;
  author: string;
  license: string;
  licenseUrl: string;
}

export interface BoardTheme {
  id: string;
  name: TKey;
  light: string;
  dark: string;
}

export const DEFAULT_BOARD_THEME = 'green';
export const DEFAULT_PIECE_SET = 'cburnett';

export const PIECE_SETS: PieceSet[] = [
  {
    id: 'cburnett',
    name: 'Cburnett',
    author: 'Colin M.L. Burnett',
    license: 'GPLv2+',
    licenseUrl: 'https://www.gnu.org/licenses/gpl-2.0.txt',
  },
  {
    id: 'merida',
    name: 'Merida',
    author: 'Armando Hernandez Marroquin',
    license: 'GPLv2+',
    licenseUrl: 'https://www.gnu.org/licenses/gpl-2.0.txt',
  },
  {
    id: 'chessnut',
    name: 'Chessnut',
    author: 'Alexis Luengas',
    license: 'Apache 2.0',
    licenseUrl: 'https://github.com/LexLuengas/chessnut-pieces/blob/master/LICENSE.txt',
  },
  {
    id: 'mpchess',
    name: 'MPChess',
    author: 'Maxime Chupin',
    license: 'GPLv3+',
    licenseUrl: 'https://www.gnu.org/licenses/gpl-3.0.txt',
  },
  {
    id: 'spatial',
    name: 'Spatial',
    author: 'Maurizio Monge',
    license: 'MIT',
    licenseUrl: 'https://github.com/maurimo/chess-art/blob/main/LICENSE',
  },
  {
    id: 'fantasy',
    name: 'Fantasy',
    author: 'Maurizio Monge',
    license: 'MIT',
    licenseUrl: 'https://github.com/maurimo/chess-art/blob/main/LICENSE',
  },
  {
    id: 'celtic',
    name: 'Celtic',
    author: 'Maurizio Monge',
    license: 'MIT',
    licenseUrl: 'https://github.com/maurimo/chess-art/blob/main/LICENSE',
  },
  {
    id: 'rhosgfx',
    name: 'RhosGFX',
    author: 'RhosGFX',
    license: 'CC0 1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
];

export const BOARD_THEMES: BoardTheme[] = [
  { id: 'green', name: 'appearance.theme.green', light: '#ebecd0', dark: '#739552' },
  { id: 'brown', name: 'appearance.theme.brown', light: '#f0d9b5', dark: '#b58863' },
  { id: 'blue', name: 'appearance.theme.blue', light: '#dee3e6', dark: '#8ca2ad' },
  { id: 'purple', name: 'appearance.theme.purple', light: '#efedf4', dark: '#8877b7' },
  { id: 'slate', name: 'appearance.theme.slate', light: '#d9dde1', dark: '#7a8593' },
  { id: 'walnut', name: 'appearance.theme.walnut', light: '#e4c9a2', dark: '#966542' },
  { id: 'teal', name: 'appearance.theme.teal', light: '#d8e8e3', dark: '#5d958c' },
];

export const PIECE_FILES = ['wP', 'wN', 'wB', 'wR', 'wQ', 'wK', 'bP', 'bN', 'bB', 'bR', 'bQ', 'bK'] as const;
export type PieceFile = (typeof PIECE_FILES)[number];

const ROLES = { P: 'pawn', N: 'knight', B: 'bishop', R: 'rook', Q: 'queen', K: 'king' } as const;

export function boardTheme(id: string): BoardTheme {
  return BOARD_THEMES.find((t) => t.id === id) ?? BOARD_THEMES.find((t) => t.id === DEFAULT_BOARD_THEME)!;
}

export function pieceSet(id: string): PieceSet {
  return PIECE_SETS.find((p) => p.id === id) ?? PIECE_SETS.find((p) => p.id === DEFAULT_PIECE_SET)!;
}

export function pieceUrl(set: string, file: PieceFile): string {
  return `${import.meta.env.BASE_URL}pieces/${set}/${file}.svg`;
}

const STYLE_ID = 'piece-set';

/** Applies the board colours (CSS variables) and the piece set (an injected stylesheet). */
export function applyAppearance(boardThemeId: string, pieceSetId: string) {
  const theme = boardTheme(boardThemeId);
  const root = document.documentElement.style;
  root.setProperty('--light-sq', theme.light);
  root.setProperty('--dark-sq', theme.dark);

  const set = pieceSet(pieceSetId);
  // The default set is already embedded by chessground.cburnett.css: no override, no download.
  const css =
    set.id === DEFAULT_PIECE_SET
      ? ''
      : PIECE_FILES.map((f) => {
          const color = f[0] === 'w' ? 'white' : 'black';
          const role = ROLES[f[1] as keyof typeof ROLES];
          return `.cg-wrap piece.${role}.${color} { background-image: url('${pieceUrl(set.id, f)}'); }`;
        }).join('\n');

  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
  }
  // Same selectors as the bundled cburnett rules: being last in <head> makes these win
  // (this also covers the promotion picker, a .cg-wrap holding <piece> elements).
  if (style !== document.head.lastElementChild) document.head.appendChild(style);
  if (style.textContent !== css) style.textContent = css;
}
