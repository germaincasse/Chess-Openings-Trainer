import { useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { colorLabel, formatLine, START_KEY, type Color } from '../lib/chess';
import { openingAt, type OpeningName } from '../lib/openings';
import { parsePgn } from '../lib/pgn';
import { downloadText, plural } from '../lib/util';
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
            title={open ? 'Replier' : 'Déplier'}
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
                  title="Ouvrir dans l'explorateur"
                >
                  {m.san}
                </button>
                {comment && <span className="rt-comment">{comment}</span>}
              </span>
            );
          })}
          {row.transposition && (
            <span className="tag blue rt-tag" title="Cette position est déjà développée plus haut dans l'arbre">
              transposition
            </span>
          )}
          {hasBranches && !open && (
            <button className="tag rt-tag rt-more" onClick={() => setOpen(true)}>
              {plural(row.branches.length, 'suite')}
            </button>
          )}
        </div>
        {trainable && (
          <button
            className="icon-btn small rt-train"
            title="S'entraîner sur cette ligne"
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
  const hits = useMemo(() => searchOpenings(idx, query), [idx, query]);
  if (!hits.length) return <p className="muted small">Aucune ouverture de ce nom dans le répertoire.</p>;
  return (
    <div className="rt-results">
      {hits.map((h) => {
        const ucis = h.path.map((e) => e.uci);
        return (
          <div className="rt-result" key={h.key}>
            <button className="rt-result-main" onClick={() => openInExplorer(ucis, side)} title="Ouvrir dans l'explorateur">
              <span className="rt-opening">
                <span className="eco">{h.opening.eco}</span>
                {h.opening.name}
              </span>
              <span className="rt-result-line">{formatLine(h.path.map((e) => e.san))}</span>
            </button>
            <button className="icon-btn small" title="S'entraîner sur cette ligne" onClick={() => startTraining(ucis, side)}>
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
  const [text, setText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const run = (pgn: string) => {
    const games = parsePgn(pgn);
    if (!games.some((g) => g.lines.length)) {
      toast('Aucun coup lisible dans ce PGN.', 'error');
      return;
    }
    const added = importPgnGames(rep, games);
    if (!added) {
      toast('Aucun nouveau coup : lignes déjà présentes ou illisibles.');
      return;
    }
    repsChanged();
    toast(`${plural(added, 'coup ajouté', 'coups ajoutés')} au répertoire ${colorLabel(side)}.`);
    setText('');
    onClose();
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      run(await file.text());
    } catch (e) {
      toast(`Lecture impossible : ${(e as Error).message}`, 'error');
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <h3 className="grow">Importer un PGN dans le répertoire {colorLabel(side)}</h3>
        <button className="icon-btn small" onClick={onClose} title="Fermer">
          <Icon name="x" size={14} />
        </button>
      </div>
      <p className="muted small">
        Toutes les lignes sont ajoutées, variantes comprises. Les parties qui commencent depuis une position
        personnalisée (en-tête FEN) sont ignorées.
      </p>
      <div className="row">
        <button className="btn" onClick={() => fileRef.current?.click()}>
          <Icon name="upload" size={16} /> Choisir un fichier .pgn
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".pgn,application/x-chess-pgn,text/plain"
          hidden
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        <span className="muted small">ou collez le texte ci-dessous</span>
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
          Importer le texte
        </button>
      </div>
    </div>
  );
}

// ---------- view ----------

function EmptyRepertoire({ side, onPgn }: { side: Color; onPgn: () => void }) {
  return (
    <div className="panel">
      <div className="empty-state">
        <h3>Le répertoire {colorLabel(side)} est vide</h3>
        <p>Trois façons de le remplir :</p>
        <div className="rt-ways">
          <div className="rt-way">
            <strong>Dans l'explorateur</strong>
            <p className="small">
              Activez le mode édition (chaque coup joué est ajouté) ou jouez une ligne puis cliquez sur
              « Ajouter la ligne ».
            </p>
            <button
              className="btn small"
              onClick={() => {
                setSettings({ autoAdd: true });
                openInExplorer([], side);
              }}
            >
              Explorateur en mode édition
            </button>
          </div>
          <div className="rt-way">
            <strong>Depuis vos parties</strong>
            <p className="small">
              Importez vos parties Lichess ou Chess.com : le répertoire est construit à partir des coups que vous
              jouez réellement.
            </p>
            <button className="btn small" onClick={() => setView('import')}>
              Importer mes parties
            </button>
          </div>
          <div className="rt-way">
            <strong>Depuis un PGN</strong>
            <p className="small">Chargez un fichier PGN (avec variantes) issu d'un livre, d'un cours ou d'une étude.</p>
            <button className="btn small" onClick={onPgn}>
              Importer un PGN
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function RepertoireView() {
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
    const name = side === 'white' ? 'blancs' : 'noirs';
    downloadText(`repertoire-${name}.pgn`, exportPgn(rep, `Répertoire ${colorLabel(side)}`), 'application/x-chess-pgn');
  };

  const clear = () => {
    const msg =
      `Vider le répertoire ${colorLabel(side)} ? ${plural(stats.moves, 'coup')} et la progression ` +
      "d'entraînement seront supprimés. Pensez à exporter un PGN ou une sauvegarde avant.";
    if (!confirm(msg)) return;
    setRepertoire(side, emptyRepertoire(side));
    toast(`Répertoire ${colorLabel(side)} vidé.`);
  };

  const empty = stats.moves === 0;
  const searching = query.trim().length >= 2;

  return (
    <div className="page">
      <div className="page-head">
        <h2>Répertoire</h2>
        <div className="seg">
          {(['white', 'black'] as const).map((c) => (
            <button key={c} className={side === c ? 'active' : ''} onClick={() => setSide(c)}>
              {colorLabel(c)}
            </button>
          ))}
        </div>
        <div className="grow" />
        <button className="btn primary" disabled={!stats.cards} onClick={() => startTraining([], side)}>
          <Icon name="play" size={16} /> S'entraîner
        </button>
        <button className="btn" disabled={empty} onClick={exportFile}>
          <Icon name="download" size={16} /> Exporter PGN
        </button>
        <button className="btn" onClick={() => setPgnOpen(!pgnOpen)}>
          <Icon name="upload" size={16} /> Importer PGN
        </button>
        <button className="btn danger" disabled={empty} onClick={clear}>
          <Icon name="trash" size={16} /> Vider
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
              <span>positions</span>
            </div>
            <div className="rt-stat">
              <strong>{stats.moves}</strong>
              <span>coups</span>
            </div>
            <div className="rt-stat">
              <strong>{stats.lines}</strong>
              <span>lignes</span>
            </div>
            <div className="rt-stat" title="Positions où c'est à vous de jouer : chacune est une carte d'entraînement">
              <strong>{stats.cards}</strong>
              <span>positions à connaître</span>
            </div>
            <div className={`rt-stat ${stats.due ? 'due' : ''}`}>
              <strong>{stats.due}</strong>
              <span>à réviser</span>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head rt-head">
              <span className="panel-title">Arbre</span>
              <input
                type="search"
                className="rt-search"
                placeholder="Ouverture (nom anglais ou ECO)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <div className="grow" />
              {!searching && (
                <>
                  <button className="btn ghost small" onClick={() => expandAll('all')}>
                    Tout déplier
                  </button>
                  <button className="btn ghost small" onClick={() => expandAll('none')}>
                    Tout replier
                  </button>
                </>
              )}
            </div>
            <p className="muted small">
              Vos coups en clair, ceux de l'adversaire en gris. Cliquez sur un coup pour l'ouvrir dans l'explorateur.
            </p>
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
