import { fenTurn, keyToFen, moveLabel, sanOf, START_KEY, type Color } from '../lib/chess';
import { msg, t, type Msg } from '../i18n';
import { pct } from '../lib/util';
import { Engine, type EngineLine } from '../engine/engine';
import { cpFor, formatCp, lineCp, winPct } from '../engine/evaluation';
import { scoreOf, type OpeningTree, type TreeMove, type TreeNode } from '../games/tree';
import { hasMove, inRepertoire, repMoves, type Repertoire } from '../repertoire/model';

export type WeaknessKind = 'engine' | 'results' | 'consistency' | 'gap';

export type WeaknessLevel = 'inaccuracy' | 'mistake' | 'blunder';

export const kindLabel = (k: WeaknessKind) => t(`weak.kind.${k}`);
export const levelLabel = (l: WeaknessLevel) => t(`weak.level.${l}`);

export interface Arrow {
  uci: string;
  brush: 'red' | 'green' | 'yellow' | 'blue';
}

export interface Weakness {
  id: string;
  kind: WeaknessKind;
  color: Color;
  /** Moves from the start to the position concerned. */
  path: string[];
  key: string;
  severity: number;
  games: number;
  /** Stored as messages so a saved report follows the interface language (strings in old reports). */
  title: Msg | string;
  detail: Msg | string;
  arrows: Arrow[];
  level?: WeaknessLevel;
  /** For engine findings: the move played and the engine's choice. */
  played?: string;
  best?: string;
}

export interface WeaknessOptions {
  minGames: number;
  maxPly: number;
  useEngine: boolean;
  depth: number;
  maxPositions: number;
  /** Minimum drop in win percentage to report a move. */
  minWinLoss: number;
}

export const DEFAULT_WEAKNESS: WeaknessOptions = {
  minGames: 3,
  maxPly: 20,
  useEngine: true,
  depth: 14,
  maxPositions: 40,
  minWinLoss: 6,
};

export interface WeaknessReport {
  generatedAt: number;
  options: WeaknessOptions;
  games: number;
  items: Weakness[];
}

export interface EvalStore {
  get(key: string): { depth: number; lines: EngineLine[] } | undefined;
  set(key: string, value: { depth: number; lines: EngineLine[] }): void;
}

export interface AnalysisProgress {
  done: number;
  total: number;
  message: string;
}

const record = (s: { w: number; d: number; l: number }) => `+${s.w} =${s.d} -${s.l}`;

interface Visited {
  key: string;
  path: string[];
  node: TreeNode;
}

/** Positions reached at least minGames times, breadth first, with the route that reaches them. */
function frequentPositions(tree: OpeningTree, opts: WeaknessOptions): Visited[] {
  const out: Visited[] = [];
  const seen = new Set<string>([START_KEY]);
  const queue: { key: string; path: string[] }[] = [{ key: START_KEY, path: [] }];
  while (queue.length) {
    const { key, path } = queue.shift()!;
    const node = tree.nodes.get(key);
    if (!node || node.n < opts.minGames) continue;
    out.push({ key, path, node });
    if (path.length >= opts.maxPly) continue;
    for (const m of node.moves) {
      if (m.n >= opts.minGames && !seen.has(m.to)) {
        seen.add(m.to);
        queue.push({ key: m.to, path: [...path, m.uci] });
      }
    }
  }
  return out;
}

function staticFindings(tree: OpeningTree, rep: Repertoire, positions: Visited[], opts: WeaknessOptions): Weakness[] {
  const color = tree.color;
  const items: Weakness[] = [];
  const repUsed = repMoves(rep, START_KEY).length > 0;

  for (const { key, path, node } of positions) {
    const mine = fenTurn(key) === color;
    const total = node.moves.reduce((s, m) => s + m.n, 0);
    const parentScore = scoreOf(node);
    const ply = path.length;

    // Results: a move after which your score clearly drops.
    for (const m of node.moves) {
      if (m.n < opts.minGames) continue;
      const s = scoreOf(m);
      if (s <= 0.42 && parentScore - s >= 0.08) {
        const label = moveLabel(m.san, ply);
        items.push({
          id: `results:${color}:${key}:${m.uci}`,
          kind: 'results',
          color,
          path,
          key,
          severity: m.n * (parentScore - s),
          games: m.n,
          title: { key: mine ? 'weak.resultsMineTitle' : 'weak.resultsOppTitle', params: { move: label } },
          detail: { key: 'weak.resultsDetail', params: { score: pct(s), count: m.n, record: record(m), before: pct(parentScore) } },
          arrows: [{ uci: m.uci, brush: mine ? 'red' : 'yellow' }],
        });
      }
    }

    if (mine) {
      // Consistency: no settled answer in a frequent position.
      const top = node.moves[0];
      if (top && total >= opts.minGames * 2 && top.n / total < 0.6 && (node.moves[1]?.n ?? 0) >= 2) {
        const used = node.moves.filter((m) => m.n >= 2);
        items.push({
          id: `consistency:${color}:${key}`,
          kind: 'consistency',
          color,
          path,
          key,
          severity: total * (1 - top.n / total) * 0.5,
          games: total,
          title: { key: path.length ? 'weak.noFixedTitle' : 'weak.noFixedFirstTitle' },
          detail: { key: 'weak.noFixedDetail', params: { moves: used.map((m) => `${m.san} (${m.n})`).join(', ') } },
          arrows: used.slice(0, 3).map((m) => ({ uci: m.uci, brush: 'blue' as const })),
        });
      }
      // Deviation from the repertoire you built.
      const planned = repMoves(rep, key);
      if (top && planned.length && top.n >= opts.minGames && !hasMove(rep, key, top.uci)) {
        items.push({
          id: `deviation:${color}:${key}`,
          kind: 'consistency',
          color,
          path,
          key,
          severity: top.n * 0.6,
          games: top.n,
          title: { key: 'weak.deviationTitle', params: { move: moveLabel(top.san, ply) } },
          detail: {
            key: 'weak.deviationDetail',
            params: { planned: planned.map((m) => m.san).join(' / '), played: top.san, count: top.n },
          },
          arrows: [
            ...planned.map((m) => ({ uci: m.uci, brush: 'green' as const })),
            { uci: top.uci, brush: 'red' as const },
          ],
        });
      }
    } else if (repUsed && inRepertoire(rep, key)) {
      // Gaps: frequent opponent replies with nothing prepared.
      for (const m of node.moves) {
        if (m.n < opts.minGames) continue;
        const label = moveLabel(m.san, ply);
        const known = hasMove(rep, key, m.uci);
        if (known && repMoves(rep, m.to).length) continue;
        items.push({
          id: `gap:${color}:${key}:${m.uci}`,
          kind: 'gap',
          color,
          path,
          key,
          severity: m.n * 0.4,
          games: m.n,
          title: { key: known ? 'weak.gapKnownTitle' : 'weak.gapMissingTitle', params: { move: label } },
          detail: { key: 'weak.gapDetail', params: { count: m.n, score: pct(scoreOf(m)) } },
          arrows: [{ uci: m.uci, brush: 'yellow' }],
        });
      }
    }
  }
  return items;
}

async function evaluate(engine: Engine, store: EvalStore, key: string, multiPv: number, depth: number) {
  const cacheKey = `${key}|${multiPv}`;
  const cached = store.get(cacheKey);
  if (cached && cached.depth >= depth) return cached.lines;
  const res = await engine.analyze(keyToFen(key), { multiPv, depth });
  if (res.cancelled) return [];
  const lines = res.lines.filter(Boolean);
  if (lines.length) store.set(cacheKey, { depth, lines });
  return lines;
}

async function engineFindings(
  tree: OpeningTree,
  positions: Visited[],
  opts: WeaknessOptions,
  engine: Engine,
  store: EvalStore,
  onProgress: (p: AnalysisProgress) => void,
  signal: AbortSignal,
  offset: number,
  grandTotal: number,
): Promise<Weakness[]> {
  const color = tree.color;
  const items: Weakness[] = [];
  const minPlayed = Math.max(2, Math.ceil(opts.minGames / 2));
  const candidates = positions
    .filter((p) => fenTurn(p.key) === color && p.node.moves.length)
    .sort((a, b) => b.node.n - a.node.n)
    .slice(0, opts.maxPositions);

  for (let i = 0; i < candidates.length; i++) {
    if (signal.aborted) break;
    const { key, path, node } = candidates[i];
    onProgress({ done: offset + i, total: grandTotal, message: t(color === 'white' ? 'weak.progressWhite' : 'weak.progressBlack') });
    const lines = await evaluate(engine, store, key, 3, opts.depth);
    if (!lines.length) continue;
    const best = lines[0];
    const bestCp = cpFor(lineCp(best), color);
    const bestUci = best.pv[0];
    const played: TreeMove[] = node.moves.filter((m) => m.n >= minPlayed);
    for (const m of played) {
      if (m.uci === bestUci) continue;
      const inPv = lines.find((l) => l.pv[0] === m.uci);
      let cp: number;
      if (inPv) cp = cpFor(lineCp(inPv), color);
      else {
        const after = await evaluate(engine, store, m.to, 1, Math.max(8, opts.depth - 2));
        if (!after.length) continue;
        cp = cpFor(lineCp(after[0]), color);
      }
      const loss = winPct(bestCp) - winPct(cp);
      if (loss < opts.minWinLoss) continue;
      // Lichess thresholds (0.1 / 0.2 / 0.3 of winning chances), in win percentage points.
      const level: WeaknessLevel = loss >= 15 ? 'blunder' : loss >= 10 ? 'mistake' : 'inaccuracy';
      const fen = keyToFen(key);
      const bestSan = sanOf(fen, bestUci);
      items.push({
        id: `engine:${color}:${key}:${m.uci}`,
        kind: 'engine',
        color,
        path,
        key,
        severity: (m.n * loss) / 10,
        games: m.n,
        level,
        played: m.uci,
        best: bestUci,
        title: { key: `weak.engineTitle.${level}`, params: { move: moveLabel(m.san, path.length) } },
        detail: {
          key: 'weak.engineDetail',
          params: {
            count: m.n,
            score: pct(scoreOf(m)),
            best: bestSan,
            bestEval: formatCp(bestCp),
            playedEval: formatCp(cp),
            played: m.san,
            depth: opts.depth,
          },
        },
        arrows: [
          { uci: m.uci, brush: 'red' },
          { uci: bestUci, brush: 'green' },
        ],
      });
    }
  }
  return items;
}

export async function analyzeWeaknesses(
  trees: OpeningTree[],
  reps: Record<Color, Repertoire>,
  games: number,
  opts: WeaknessOptions,
  store: EvalStore,
  onProgress: (p: AnalysisProgress) => void,
  signal: AbortSignal,
): Promise<WeaknessReport> {
  const items: Weakness[] = [];
  const perTree = trees.map((tree) => {
    const positions = frequentPositions(tree, opts);
    items.push(...staticFindings(tree, reps[tree.color], positions, opts));
    return { tree, positions };
  });

  if (opts.useEngine) {
    const counts = perTree.map(
      ({ tree, positions }) =>
        Math.min(opts.maxPositions, positions.filter((p) => fenTurn(p.key) === tree.color && p.node.moves.length).length),
    );
    const grandTotal = counts.reduce((a, b) => a + b, 0);
    const engine = new Engine(64);
    const stop = () => engine.terminate();
    signal.addEventListener('abort', stop);
    try {
      let offset = 0;
      for (let i = 0; i < perTree.length; i++) {
        const { tree, positions } = perTree[i];
        items.push(...(await engineFindings(tree, positions, opts, engine, store, onProgress, signal, offset, grandTotal)));
        offset += counts[i];
      }
      if (engine.error && !signal.aborted) throw new Error(engine.error);
    } finally {
      signal.removeEventListener('abort', stop);
      engine.terminate();
    }
  }

  items.sort((a, b) => b.severity - a.severity);
  return { generatedAt: Date.now(), options: opts, games, items };
}

/** Title and detail in the current language. */
export function describeWeakness(w: Weakness): { title: string; detail: string } {
  return { title: msg(w.title), detail: msg(w.detail) };
}

