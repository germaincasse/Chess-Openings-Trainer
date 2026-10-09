import { useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { useT } from '../i18n';
import { colorLabel, formatLine, START_KEY, type Color } from '../lib/chess';
import { openingAt, type OpeningName } from '../lib/openings';
import { parsePgn } from '../lib/pgn';
import { downloadText } from '../lib/util';
import {
  emptyRepertoire,
  exportPgn,
  importPgnGames,
  isOwnerTurn,
  repStats,
  type RepMove,
  type Repertoire,
} from '../repertoire/model';
import {
  openInExplorer,
  repsChanged,
  setRepertoire,
  setSettings,
  setSide,
  setView,
  startTraining,
  toast,
  useStore,
} from '../store/store';
import '../styles/repertoire.css';

// ---------- graph index ----------

interface Edge {
  from: string;
  uci: string;
  san: string;
}

/**
 * First edge reaching each position in display order (depth-first, main move first).
 * A position is expanded only under that edge: any other way in is a transposition,
 * which also protects against cycles.
 */
interface RepIndex {
  first: Map<string, Edge | null>;
  order: string[];
}

function indexRepertoire(rep: Repertoire): RepIndex {
  const first = new Map<string, Edge | null>([[START_KEY, null]]);
  const order = [START_KEY];
  const stack: (Edge & { to: string })[] = [];
  const pushChildren = (key: string) => {
    const moves = rep.nodes[key]?.moves ?? [];
    for (let i = moves.length - 1; i >= 0; i--) {
      const m = moves[i];
      stack.push({ from: key, uci: m.uci, san: m.san, to: m.to });
    }
  };
  pushChildren(START_KEY);
  while (stack.length) {
    const e = stack.pop()!;
    if (first.has(e.to)) continue;
    first.set(e.to, { from: e.from, uci: e.uci, san: e.san });
    order.push(e.to);
    pushChildren(e.to);
  }
  return { first, order };
}

function isCanonical(idx: RepIndex, from: string, m: RepMove): boolean {
  const e = idx.first.get(m.to);
  return !!e && e.from === from && e.uci === m.uci;
}

function pathTo(idx: RepIndex, key: string): Edge[] {
  const edges: Edge[] = [];
  let e = idx.first.get(key);
  while (e) {
    edges.push(e);
    e = idx.first.get(e.from);
  }
  return edges.reverse();
}

// ---------- rows ----------

/** A chain of single continuations shown on one line, ending at a leaf, a branch point or a transposition. */
interface Row {
  moves: { m: RepMove; from: string }[];
  end: string;
  transposition: boolean;
  branches: RepMove[];
}

function buildRow(rep: Repertoire, idx: RepIndex, from: string, first: RepMove): Row {
  const moves: Row['moves'] = [];
  let key = from;
  let m = first;
  for (;;) {
    moves.push({ m, from: key });
    if (!isCanonical(idx, key, m)) {
      const more = (rep.nodes[m.to]?.moves.length ?? 0) > 0;
      return { moves, end: m.to, transposition: more, branches: [] };
    }
    const next = rep.nodes[m.to]?.moves ?? [];
    key = m.to;
    if (next.length !== 1) return { moves, end: key, transposition: false, branches: next };
    m = next[0];
  }
}

type Expand = 'default' | 'all' | 'none';

function defaultOpen(mode: Expand, depth: number): boolean {
  if (mode === 'all') return true;
  if (mode === 'none') return depth === 0;
  return depth < 2;
}

interface TreeCtx {
  rep: Repertoire;
  idx: RepIndex;
  side: Color;
  mode: Expand;
}

interface BranchProps {
  ctx: TreeCtx;
  from: string;
  move: RepMove;
  base: string[];
  /** Number of branch points above the one ending this row. */
  depth: number;
  parentName?: string;
}

function Branch({ ctx, from, move, base, depth, parentName }: BranchProps) {
  const t = useT();
  const [open, setOpen] = useState(() => defaultOpen(ctx.mode, depth));
  const { rep, side } = ctx;
  const row = buildRow(rep, ctx.idx, from, move);
  const ucis = row.moves.map((x) => x.m.uci);
  const path = [...base, ...ucis];
  const hasBranches = row.branches.length > 1;
  const trainable = row.moves.length > 1 || hasBranches || row.transposition;

  let name: OpeningName | undefined;
  for (let i = row.moves.length - 1; i >= 0 && !name; i--) name = openingAt(row.moves[i].m.to);
  const label = name && name.name !== parentName ? name : undefined;

  return (
    <div className="rt-branch">
      <div className="rt-row">
        {hasBranches ? (
          <button
            className={`rt-toggle ${open ? 'open' : ''}`}
            onClick={() => setOpen(!open)}
            title={t(open ? 'repertoire.collapse' : 'repertoire.expand')}
            aria-expanded={open}
          >
            <Icon name="next" size={14} />
          </button>
        ) : (
          <span className="rt-toggle-spacer" />
        )}
        <div className="rt-line">
          {label && (
            <span className="rt-opening">
              <span className="eco">{label.eco}</span>
              {label.name}
            </span>
          )}
          {row.moves.map(({ m, from: k }, i) => {
            const ply = base.length + i;
            const num = ply % 2 === 0 ? `${ply / 2 + 1}.` : i === 0 ? `${(ply + 1) / 2}...` : '';
            const comment = rep.nodes[m.to]?.comment;
            return (
              <span className="rt-step" key={i}>
                {num && <span className="rt-num">{num}</span>}
                <button
                  className={`rt-mv ${isOwnerTurn(rep, k) ? 'own' : 'opp'}`}
                  onClick={() => openInExplorer([...base, ...ucis.slice(0, i + 1)], side)}
                  title={t('repertoire.openInExplorer')}
                >
                  {m.san}
                </button>
                {comment && <span className="rt-comment">{comment}</span>}
              </span>
            );
          })}
          {row.transposition && (
            <span className="tag blue rt-tag" title={t('repertoire.transpositionTitle')}>
              {t('repertoire.transposition')}
            </span>
          )}
          {hasBranches && !open && (
            <button className="tag rt-tag rt-more" onClick={() => setOpen(true)}>
              {t('repertoire.branches', { count: row.branches.length })}
            </button>
          )}
        </div>
        {trainable && (
          <button
            className="icon-btn small rt-train"
            title={t('repertoire.trainLine')}
            onClick={() => startTraining([...base, move.uci], side)}
          >
            <Icon name="play" size={13} />
          </button>
        )}
      </div>
      {hasBranches && open && (
        <div className="rt-children">
          {row.branches.map((m) => (
            <Branch
              key={m.uci}
              ctx={ctx}
              from={row.end}
              move={m}
              base={path}
              depth={depth + 1}
              parentName={label?.name ?? parentName}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Tree({ ctx }: { ctx: TreeCtx }) {
  const root = ctx.rep.nodes[START_KEY];
  const moves = root?.moves ?? [];
  return (
    <div className="rt-tree">
      {root?.comment && <p className="rt-comment">{root.comment}</p>}
      {moves.length === 1 ? (
        <Branch ctx={ctx} from={START_KEY} move={moves[0]} base={[]} depth={0} />
      ) : (
        moves.map((m) => <Branch key={m.uci} ctx={ctx} from={START_KEY} move={m} base={[]} depth={1} />)
      )}
    </div>
  );
}

// ---------- search ----------

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

interface SearchHit {
  key: string;
  opening: OpeningName;
  path: Edge[];
}

function searchOpenings(idx: RepIndex, query: string, limit = 60): SearchHit[] {
  const q = normalize(query.trim());
  const hits: SearchHit[] = [];
  const names = new Set<string>();
  for (const key of idx.order) {
    const o = openingAt(key);
    if (!o || names.has(o.name)) continue;
    if (!normalize(`${o.eco} ${o.name}`).includes(q)) continue;
    names.add(o.name);
    hits.push({ key, opening: o, path: pathTo(idx, key) });
    if (hits.length >= limit) break;
  }
  return hits;
}

function SearchResults({ idx, query, side }: { idx: RepIndex; query: string; side: Color }) {
  const t = useT();
  const hits = useMemo(() => searchOpenings(idx, query), [idx, query]);
  if (!hits.length) return <p className="muted small">{t('repertoire.noSearchHit')}</p>;
  return (
    <div className="rt-results">
      {hits.map((h) => {
        const ucis = h.path.map((e) => e.uci);
        return (
          <div className="rt-result" key={h.key}>
            <button
              className="rt-result-main"
              onClick={() => openInExplorer(ucis, side)}
              title={t('repertoire.openInExplorer')}
            >
              <span className="rt-opening">
                <span className="eco">{h.opening.eco}</span>
                {h.opening.name}
              </span>
              <span className="rt-result-line">{formatLine(h.path.map((e) => e.san))}</span>
            </button>
            <button className="icon-btn small" title={t('repertoire.trainLine')} onClick={() => startTraining(ucis, side)}>
              <Icon name="play" size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ---------- PGN import ----------

function PgnImport({ rep, side, onClose }: { rep: Repertoire; side: Color; onClose: () => void }) {
  const t = useT();
  const [text, setText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const run = (pgn: string) => {
    const games = parsePgn(pgn);
    if (!games.some((g) => g.lines.length)) {
      toast(t('repertoire.pgnNoMoves'), 'error');
      return;
    }
    const added = importPgnGames(rep, games);
    if (!added) {
      toast(t('repertoire.pgnNothingNew'));
      return;
    }
    repsChanged();
    toast(t('repertoire.pgnAdded', { count: added, color: colorLabel(side) }));
    setText('');
    onClose();
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      run(await file.text());
    } catch (e) {
      toast(t('repertoire.readFailed', { error: (e as Error).message }), 'error');
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <h3 className="grow">{t('repertoire.pgnTitle', { color: colorLabel(side) })}</h3>
        <button className="icon-btn small" onClick={onClose} title={t('repertoire.close')}>
          <Icon name="x" size={14} />
        </button>
      </div>
      <p className="muted small">{t('repertoire.pgnHelp')}</p>
      <div className="row">
        <button className="btn" onClick={() => fileRef.current?.click()}>
          <Icon name="upload" size={16} /> {t('repertoire.pgnChooseFile')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".pgn,application/x-chess-pgn,text/plain"
          hidden
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        <span className="muted small">{t('repertoire.pgnOrPaste')}</span>
      </div>
      <textarea
        rows={6}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="1. e4 e5 2. Nf3 Nc6 3. Bb5 (3. Bc4 Bc5) a6 *"
        spellCheck={false}
      />
      <div className="row">
        <button className="btn primary" disabled={!text.trim()} onClick={() => run(text)}>
          {t('repertoire.pgnImportText')}
        </button>
      </div>
    </div>
  );
}

// ---------- view ----------

function EmptyRepertoire({ side, onPgn }: { side: Color; onPgn: () => void }) {
  const t = useT();
  return (
    <div className="panel">
      <div className="empty-state">
        <h3>{t('repertoire.emptyTitle', { color: colorLabel(side) })}</h3>
        <p>{t('repertoire.emptyWays')}</p>
        <div className="rt-ways">
          <div className="rt-way">
            <strong>{t('repertoire.wayExplorer')}</strong>
            <p className="small">{t('repertoire.wayExplorerHelp', { button: t('explorer.addLine') })}</p>
            <button
              className="btn small"
              onClick={() => {
                setSettings({ autoAdd: true });
                openInExplorer([], side);
              }}
            >
              {t('repertoire.wayExplorerBtn')}
            </button>
          </div>
          <div className="rt-way">
            <strong>{t('repertoire.wayGames')}</strong>
            <p className="small">{t('repertoire.wayGamesHelp')}</p>
            <button className="btn small" onClick={() => setView('import')}>
              {t('repertoire.wayGamesBtn')}
            </button>
          </div>
          <div className="rt-way">
            <strong>{t('repertoire.wayPgn')}</strong>
            <p className="small">{t('repertoire.wayPgnHelp')}</p>
            <button className="btn small" onClick={onPgn}>
              {t('repertoire.wayPgnBtn')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function RepertoireView() {
  const t = useT();
  const state = useStore();
  const side = state.settings.side;
  const rep = state.reps[side];
  const [pgnOpen, setPgnOpen] = useState(false);
  const [mode, setMode] = useState<Expand>('default');
  const [epoch, setEpoch] = useState(0);
  const [query, setQuery] = useState('');

  // The repertoire is mutated in place: repsRev tells when to recompute.
  const stats = useMemo(() => repStats(rep), [rep, state.repsRev]);
  const idx = useMemo(() => indexRepertoire(rep), [rep, state.repsRev]);

  const expandAll = (m: Expand) => {
    setMode(m);
    setEpoch((e) => e + 1);
  };

  const exportFile = () => {
    const white = side === 'white';
    downloadText(
      t(white ? 'repertoire.fileWhite' : 'repertoire.fileBlack'),
      exportPgn(rep, t(white ? 'common.whiteRep' : 'common.blackRep')),
      'application/x-chess-pgn',
    );
  };

  const clear = () => {
    const msg = t('repertoire.clearConfirm', {
      color: colorLabel(side),
      moves: t('common.moves', { count: stats.moves }),
    });
    if (!confirm(msg)) return;
    setRepertoire(side, emptyRepertoire(side));
    toast(t('repertoire.cleared', { color: colorLabel(side) }));
  };

  const empty = stats.moves === 0;
  const searching = query.trim().length >= 2;

  return (
    <div className="page">
      <div className="page-head">
        <h2>{t('common.nav.repertoire')}</h2>
        <div className="seg">
          {(['white', 'black'] as const).map((c) => (
            <button key={c} className={side === c ? 'active' : ''} onClick={() => setSide(c)}>
              {colorLabel(c)}
            </button>
          ))}
        </div>
        <div className="grow" />
        <button className="btn primary" disabled={!stats.cards} onClick={() => startTraining([], side)}>
          <Icon name="play" size={16} /> {t('repertoire.train')}
        </button>
        <button className="btn" disabled={empty} onClick={exportFile}>
          <Icon name="download" size={16} /> {t('repertoire.exportPgn')}
        </button>
        <button className="btn" onClick={() => setPgnOpen(!pgnOpen)}>
          <Icon name="upload" size={16} /> {t('repertoire.importPgn')}
        </button>
        <button className="btn danger" disabled={empty} onClick={clear}>
          <Icon name="trash" size={16} /> {t('repertoire.clear')}
        </button>
      </div>

      {pgnOpen && <PgnImport rep={rep} side={side} onClose={() => setPgnOpen(false)} />}

      {empty ? (
        <EmptyRepertoire side={side} onPgn={() => setPgnOpen(true)} />
      ) : (
        <>
          <div className="rt-stats">
            <div className="rt-stat">
              <strong>{stats.positions}</strong>
              <span>{t('repertoire.statPositions', { count: stats.positions })}</span>
            </div>
            <div className="rt-stat">
              <strong>{stats.moves}</strong>
              <span>{t('repertoire.statMoves', { count: stats.moves })}</span>
            </div>
            <div className="rt-stat">
              <strong>{stats.lines}</strong>
              <span>{t('repertoire.statLines', { count: stats.lines })}</span>
            </div>
            <div className="rt-stat" title={t('repertoire.statCardsTitle')}>
              <strong>{stats.cards}</strong>
              <span>{t('repertoire.statCards', { count: stats.cards })}</span>
            </div>
            <div className={`rt-stat ${stats.due ? 'due' : ''}`}>
              <strong>{stats.due}</strong>
              <span>{t('repertoire.statDue')}</span>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head rt-head">
              <span className="panel-title">{t('repertoire.tree')}</span>
              <input
                type="search"
                className="rt-search"
                placeholder={t('repertoire.searchPlaceholder')}
                aria-label={t('repertoire.searchPlaceholder')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <div className="grow" />
              {!searching && (
                <>
                  <button className="btn ghost small" onClick={() => expandAll('all')}>
                    {t('repertoire.expandAll')}
                  </button>
                  <button className="btn ghost small" onClick={() => expandAll('none')}>
                    {t('repertoire.collapseAll')}
                  </button>
                </>
              )}
            </div>
            <p className="muted small">{t('repertoire.treeHelp')}</p>
            {searching ? (
              <SearchResults idx={idx} query={query} side={side} />
            ) : (
              <Tree key={`${side}-${epoch}`} ctx={{ rep, idx, side, mode }} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
