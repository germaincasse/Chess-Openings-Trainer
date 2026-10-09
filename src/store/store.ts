import { useSyncExternalStore } from 'react';
import { pliesFromUcis, START_FEN, START_KEY, type Color, type Ply } from '../lib/chess';
import type { Arrow, WeaknessReport } from '../analysis/weaknesses';
import type { EngineLine } from '../engine/engine';
import { buildTree, filterGames, type OpeningTree } from '../games/tree';
import type { GameRecord, GameSource, Speed } from '../games/types';
import { addPly, emptyRepertoire, type Repertoire } from '../repertoire/model';
import { loadKey, removeKey, saveKey } from './db';

export type View = 'explorer' | 'repertoire' | 'training' | 'import' | 'analysis' | 'data';

export interface Settings {
  engineOn: boolean;
  multiPv: number;
  depth: number;
  engineArrows: boolean;
  repArrows: boolean;
  sound: boolean;
  /** Repertoire being edited / trained. */
  side: Color;
  /** Explorer edit mode: every move played is added to the repertoire. */
  autoAdd: boolean;
  /** Speeds used for "my games" statistics (null: all). */
  speeds: Speed[] | null;
}

export const DEFAULT_SETTINGS: Settings = {
  engineOn: true,
  multiPv: 3,
  depth: 20,
  engineArrows: true,
  repArrows: true,
  sound: true,
  side: 'white',
  autoAdd: false,
  speeds: null,
};

export interface ExplorerState {
  plies: Ply[];
  cursor: number;
  orientation: Color;
  /** Arrows shown at the end of the line (e.g. opened from a weakness). */
  highlight: Arrow[];
}

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error';
}

export interface AppState {
  loaded: boolean;
  view: View;
  reps: Record<Color, Repertoire>;
  sources: GameSource[];
  settings: Settings;
  report: WeaknessReport | null;
  explorer: ExplorerState;
  /** Training starts from this line when set. */
  trainingRoot: string[];
  toast: Toast | null;
  repsRev: number;
  gamesRev: number;
}

let state: AppState = {
  loaded: false,
  view: 'explorer',
  reps: { white: emptyRepertoire('white'), black: emptyRepertoire('black') },
  sources: [],
  settings: DEFAULT_SETTINGS,
  report: null,
  explorer: { plies: [], cursor: 0, orientation: 'white', highlight: [] },
  trainingRoot: [],
  toast: null,
  repsRev: 0,
  gamesRev: 0,
};

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function getState(): AppState {
  return state;
}

function update(fn: (s: AppState) => void) {
  const next = { ...state };
  fn(next);
  state = next;
  emit();
}

export function useStore(): AppState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

// ---------- persistence ----------

type Part = 'reps' | 'sources' | 'settings' | 'report' | 'evals';
const timers: Partial<Record<Part, number>> = {};

function persist(part: Part) {
  clearTimeout(timers[part]);
  timers[part] = window.setTimeout(() => {
    const value =
      part === 'reps' ? state.reps
      : part === 'sources' ? state.sources
      : part === 'settings' ? state.settings
      : part === 'report' ? state.report
      : evalCache;
    saveKey(part, value).catch((e) => toast(`Sauvegarde impossible : ${(e as Error).message}`, 'error'));
  }, 400);
}

let evalCache: Record<string, { depth: number; lines: EngineLine[] }> = {};

export const evalStore = {
  get: (key: string) => evalCache[key],
  set: (key: string, value: { depth: number; lines: EngineLine[] }) => {
    evalCache[key] = value;
    persist('evals');
  },
};

export async function loadState() {
  const [reps, sources, settings, report, evals] = await Promise.all([
    loadKey<Record<Color, Repertoire>>('reps'),
    loadKey<GameSource[]>('sources'),
    loadKey<Settings>('settings'),
    loadKey<WeaknessReport>('report'),
    loadKey<typeof evalCache>('evals'),
  ]);
  evalCache = evals ?? {};
  const s = { ...DEFAULT_SETTINGS, ...settings };
  update((st) => {
    st.loaded = true;
    if (reps) st.reps = reps;
    if (sources) st.sources = sources;
    st.settings = s;
    st.report = report ?? null;
    st.explorer = { ...st.explorer, orientation: s.side };
    st.repsRev++;
    st.gamesRev++;
  });
}

// ---------- generic ----------

let toastId = 0;
export function toast(text: string, kind: Toast['kind'] = 'info') {
  const id = ++toastId;
  update((s) => (s.toast = { id, text, kind }));
  setTimeout(() => {
    if (state.toast?.id === id) update((s) => (s.toast = null));
  }, kind === 'error' ? 6000 : 3000);
}

export function setView(view: View) {
  update((s) => (s.view = view));
}

export function setSettings(patch: Partial<Settings>) {
  update((s) => (s.settings = { ...s.settings, ...patch }));
  persist('settings');
}

// ---------- explorer ----------

export function explorerFen(e: ExplorerState = state.explorer): string {
  return e.cursor ? e.plies[e.cursor - 1].fen : START_FEN;
}

export function explorerKey(e: ExplorerState = state.explorer): string {
  return e.cursor ? e.plies[e.cursor - 1].key : START_KEY;
}

/** Plays a move after the cursor: follows the existing line or replaces what comes after. */
export function explorerPlay(ply: Ply) {
  const fromKey = explorerKey();
  update((s) => {
    const e = s.explorer;
    const next = e.plies[e.cursor];
    const plies = next?.uci === ply.uci ? e.plies : [...e.plies.slice(0, e.cursor), ply];
    s.explorer = { ...e, plies, cursor: e.cursor + 1, highlight: [] };
  });
  if (state.settings.autoAdd) {
    const rep = state.reps[state.settings.side];
    if (addPly(rep, fromKey, ply, 'manual')) repsChanged();
  }
}

export function explorerGo(cursor: number) {
  update((s) => {
    const e = s.explorer;
    const c = Math.max(0, Math.min(e.plies.length, cursor));
    if (c !== e.cursor) s.explorer = { ...e, cursor: c, highlight: [] };
  });
}

export function explorerFlip() {
  update((s) => (s.explorer = { ...s.explorer, orientation: s.explorer.orientation === 'white' ? 'black' : 'white' }));
}

export function explorerReset() {
  update((s) => (s.explorer = { ...s.explorer, plies: [], cursor: 0, highlight: [] }));
}

export function setSide(side: Color) {
  setSettings({ side });
  update((s) => (s.explorer = { ...s.explorer, orientation: side }));
}

export function openInExplorer(path: string[], side?: Color, highlight: Arrow[] = []) {
  const plies = pliesFromUcis(path);
  if (side) setSide(side);
  update((s) => {
    s.explorer = { ...s.explorer, plies, cursor: plies.length, highlight };
    s.view = 'explorer';
  });
}

// ---------- repertoire ----------

/** Call after mutating a repertoire in place. */
export function repsChanged() {
  update((s) => s.repsRev++);
  persist('reps');
}

export function setRepertoire(color: Color, rep: Repertoire) {
  update((s) => {
    s.reps = { ...s.reps, [color]: rep };
    s.repsRev++;
  });
  persist('reps');
}

export function startTraining(path: string[], side?: Color) {
  if (side) setSide(side);
  update((s) => {
    s.trainingRoot = path;
    s.view = 'training';
  });
}

// ---------- games ----------

export function saveSource(source: GameSource) {
  update((s) => {
    s.sources = [...s.sources.filter((x) => x.id !== source.id), source];
    s.gamesRev++;
  });
  persist('sources');
}

export function removeSource(id: string) {
  update((s) => {
    s.sources = s.sources.filter((x) => x.id !== id);
    s.gamesRev++;
  });
  persist('sources');
}

export function allGames(): GameRecord[] {
  return state.sources.flatMap((s) => s.games);
}

let treeCache: { rev: number; speeds: string; trees: Record<Color, OpeningTree>; games: number } | null = null;

/** Opening trees of all imported games (filtered by the speed setting), cached. */
export function getTrees(): { trees: Record<Color, OpeningTree>; games: number } {
  const speeds = state.settings.speeds;
  const sig = speeds ? speeds.join(',') : '*';
  if (!treeCache || treeCache.rev !== state.gamesRev || treeCache.speeds !== sig) {
    const games = filterGames(allGames(), { speeds: speeds ?? undefined });
    treeCache = {
      rev: state.gamesRev,
      speeds: sig,
      trees: { white: buildTree(games, 'white'), black: buildTree(games, 'black') },
      games: games.length,
    };
  }
  return treeCache;
}

// ---------- analysis ----------

export function setReport(report: WeaknessReport | null) {
  update((s) => (s.report = report));
  persist('report');
}

export function dismissWeakness(id: string) {
  if (!state.report) return;
  setReport({ ...state.report, items: state.report.items.filter((w) => w.id !== id) });
}

// ---------- backup ----------

interface Backup {
  app: 'chess-openings-trainer';
  version: 1;
  exportedAt: number;
  reps: Record<Color, Repertoire>;
  sources: GameSource[];
  settings: Settings;
}

export function exportBackup(): string {
  const b: Backup = {
    app: 'chess-openings-trainer',
    version: 1,
    exportedAt: Date.now(),
    reps: state.reps,
    sources: state.sources,
    settings: state.settings,
  };
  return JSON.stringify(b);
}

export function importBackup(text: string) {
  const b = JSON.parse(text) as Backup;
  if (b.app !== 'chess-openings-trainer' || !b.reps?.white || !b.reps?.black) {
    throw new Error("Ce fichier n'est pas une sauvegarde de Chess Openings Trainer.");
  }
  update((s) => {
    s.reps = b.reps;
    s.sources = b.sources ?? [];
    s.settings = { ...DEFAULT_SETTINGS, ...b.settings };
    s.report = null;
    s.repsRev++;
    s.gamesRev++;
  });
  (['reps', 'sources', 'settings', 'report'] as const).forEach(persist);
}

export async function clearAll() {
  await Promise.all(['reps', 'sources', 'settings', 'report', 'evals'].map(removeKey));
  evalCache = {};
  update((s) => {
    s.reps = { white: emptyRepertoire('white'), black: emptyRepertoire('black') };
    s.sources = [];
    s.settings = DEFAULT_SETTINGS;
    s.report = null;
    s.explorer = { plies: [], cursor: 0, orientation: 'white', highlight: [] };
    s.repsRev++;
    s.gamesRev++;
  });
}

