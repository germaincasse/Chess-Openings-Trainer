import { useMemo, useState, useSyncExternalStore } from 'react';
import {
  analyzeWeaknesses,
  DEFAULT_WEAKNESS,
  KIND_LABEL,
  type AnalysisProgress,
  type Weakness,
  type WeaknessKind,
  type WeaknessOptions,
  type WeaknessReport,
} from '../analysis/weaknesses';
import { Icon } from '../components/Icon';
import { Wdl } from '../components/Wdl';
import { addResult, emptyStats, filterGames, openingUsage, scoreOf, type Stats } from '../games/tree';
import { SPEEDS, type Speed } from '../games/types';
import { colorLabel, formatLine, keyToFen, pliesFromUcis, plyFrom, sanOf, START_KEY, type Color } from '../lib/chess';
import { formatDate, pct, plural, yieldToUi } from '../lib/util';
import { addLine, addPly, hasMove, makeMain, reachable, removalCost, removeMove } from '../repertoire/model';
import {
  allGames,
  dismissWeakness,
  evalStore,
  getState,
  getTrees,
  openInExplorer,
  repsChanged,
  setReport,
  setSettings,
  setView,
  startTraining,
  toast,
  useStore,
} from '../store/store';
import '../styles/analysis.css';

const COLORS: Color[] = ['white', 'black'];
const KINDS: WeaknessKind[] = ['engine', 'results', 'consistency', 'gap'];
const LEVEL: Record<NonNullable<Weakness['level']>, { label: string; tag: string }> = {
  inaccuracy: { label: 'Imprécision', tag: 'yellow' },
  mistake: { label: 'Erreur', tag: 'red' },
  blunder: { label: 'Gaffe', tag: 'red' },
};
const SENSITIVITY = [
  { value: 4, label: 'Haute' },
  { value: 6, label: 'Normale' },
  { value: 10, label: 'Basse' },
];
const USAGE_PAGE = 25;
const REPORT_PAGE = 20;

// ---------- remembered options ----------

const OPTS_KEY = 'cot.analysis.options';

function loadOptions(): WeaknessOptions {
  try {
    const raw = localStorage.getItem(OPTS_KEY);
    return { ...DEFAULT_WEAKNESS, ...(raw ? (JSON.parse(raw) as Partial<WeaknessOptions>) : {}) };
  } catch {
    return { ...DEFAULT_WEAKNESS };
  }
}

function saveOptions(opts: WeaknessOptions) {
  try {
    localStorage.setItem(OPTS_KEY, JSON.stringify(opts));
  } catch {
    // Storage unavailable: options are simply not remembered.
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

// ---------- analysis task (module level, so it survives a change of view) ----------

interface AnalysisTask {
  running: { ctrl: AbortController; progress: AnalysisProgress } | null;
  error: string;
}

let task: AnalysisTask = { running: null, error: '' };
const taskListeners = new Set<() => void>();

function setTask(patch: Partial<AnalysisTask>) {
  task = { ...task, ...patch };
  for (const l of taskListeners) l();
}

function subscribeTask(l: () => void) {
  taskListeners.add(l);
  return () => {
    taskListeners.delete(l);
  };
}

async function runAnalysis(opts: WeaknessOptions) {
  if (task.running) return;
  const { trees, games } = getTrees();
  const list = COLORS.filter((c) => (trees[c].nodes.get(START_KEY)?.n ?? 0) > 0).map((c) => trees[c]);
  if (!list.length) {
    setTask({ error: 'Aucune partie à analyser avec les cadences sélectionnées.' });
    return;
  }
  const ctrl = new AbortController();
  setTask({ running: { ctrl, progress: { done: 0, total: 0, message: 'Recherche des positions fréquentes...' } }, error: '' });
  // Lets the progress panel paint before the synchronous first pass.
  await yieldToUi();
  try {
    const onProgress = (progress: AnalysisProgress) => {
      if (task.running) setTask({ running: { ...task.running, progress } });
    };
    const report = await analyzeWeaknesses(list, getState().reps, games, opts, evalStore, onProgress, ctrl.signal);
    if (ctrl.signal.aborted) {
      toast('Analyse annulée. Les évaluations déjà calculées sont gardées pour la prochaine fois.');
      return;
    }
    setReport(report);
    toast(
      report.items.length
        ? `Analyse terminée : ${plural(report.items.length, 'point faible trouvé', 'points faibles trouvés')}.`
        : 'Analyse terminée : aucun point faible avec ces réglages.',
    );
  } catch (e) {
    if (!ctrl.signal.aborted) setTask({ error: (e as Error).message || 'Erreur inconnue pendant l\'analyse.' });
  } finally {
    setTask({ running: null });
  }
}

// ---------- repertoire fix ----------

function fixRepertoire(w: Weakness) {
  if (!w.best) return;
  const rep = getState().reps[w.color];
  const fen = keyToFen(w.key);
  const ply = plyFrom(fen, w.best);
  if (!ply) {
    toast('Le coup du moteur est invalide dans cette position.', 'error');
    return;
  }
  const playedSan = w.played ? sanOf(fen, w.played) : '';
  const hasPlayed = !!w.played && hasMove(rep, w.key, w.played);
  const reached = reachable(rep).has(w.key);
  const parts = [
    hasPlayed
      ? `Remplacer ${playedSan} par ${ply.san} dans votre répertoire ${colorLabel(w.color)} ?`
      : `Ajouter ${ply.san} à votre répertoire ${colorLabel(w.color)} ?`,
  ];
  if (hasPlayed) {
    const lost = removalCost(rep, w.key, w.played!);
    parts.push(
      lost > 0
        ? `${playedSan} et ses sous-variantes (${plural(lost, 'position')}) seront retirés du répertoire.`
        : `${playedSan} sera retiré du répertoire.`,
    );
  }
  if (!reached && w.path.length) {
    const sans = pliesFromUcis(w.path).map((p) => p.san);
    parts.push(`La ligne qui mène à cette position (${formatLine(sans)}) sera aussi ajoutée.`);
  }
  if (!confirm(parts.join('\n\n'))) return;
  if (!reached) addLine(rep, pliesFromUcis(w.path), 'manual');
  if (hasPlayed) removeMove(rep, w.key, w.played!);
  addPly(rep, w.key, ply, 'manual');
  makeMain(rep, w.key, w.best);
  repsChanged();
  toast(`${ply.san} est maintenant votre coup dans cette position (répertoire ${colorLabel(w.color)}).`);
}

// ---------- small components ----------

/** Number input that lets the field be cleared while typing. */
function NumberInput({ value, min, max, disabled, onChange }: {
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (n: number) => void;
}) {
  const [text, setText] = useState(String(value));
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    setText(String(value));
  }
  return (
    <input
      type="number"
      inputMode="numeric"
      value={text}
      min={min}
      max={max}
      disabled={disabled}
      onChange={(e) => {
        setText(e.target.value);
        const n = Math.round(Number(e.target.value));
        if (e.target.value.trim() !== '' && Number.isFinite(n)) onChange(clamp(n, min, max));
      }}
      onBlur={() => setText(String(value))}
    />
  );
}

function WeaknessCard({ w, inRep, fixed, showKind }: { w: Weakness; inRep: boolean; fixed: boolean; showKind: boolean }) {
  const line = useMemo(() => {
    const sans = pliesFromUcis(w.path).map((p) => p.san);
    return sans.length ? formatLine(sans) : 'Position de départ';
  }, [w.path]);
  const level = w.level ? LEVEL[w.level] : null;
  return (
    <div className={`weak-card kind-${w.kind}`}>
      <div className="row">
        <span className={`tag side-${w.color}`}>{colorLabel(w.color)}</span>
        {level && <span className={`tag ${level.tag}`}>{level.label}</span>}
        {showKind && <span className="tag blue">{KIND_LABEL[w.kind]}</span>}
        {fixed && <span className="tag green">Répertoire à jour</span>}
        <span className="grow" />
        <span className="muted small">{plural(w.games, 'partie')}</span>
      </div>
      <div className="weak-title">{w.title}</div>
      <p className="small">{w.detail}</p>
      <div className="weak-line" title="Ligne qui mène à la position">
        {line}
      </div>
      <div className="weak-actions">
        <button type="button" className="btn small" onClick={() => openInExplorer(w.path, w.color, w.arrows)}>
          <Icon name="eye" size={15} /> Voir
        </button>
        <button
          type="button"
          className="btn small"
          disabled={!inRep}
          title={inRep ? undefined : 'Cette position n\'est pas dans votre répertoire : ajoutez-y d\'abord la ligne.'}
          onClick={() => startTraining(w.path, w.color)}
        >
          <Icon name="target" size={15} /> S'entraîner
        </button>
        {w.kind === 'engine' && w.best && (
          <button type="button" className="btn small" disabled={fixed} onClick={() => fixRepertoire(w)}>
            <Icon name="book" size={15} /> Corriger le répertoire
          </button>
        )}
        <span className="grow" />
        <button type="button" className="btn small ghost" title="Retirer de la liste" onClick={() => dismissWeakness(w.id)}>
          <Icon name="x" size={15} /> Ignorer
        </button>
      </div>
    </div>
  );
}

function ReportPanel({ report, currentGames }: { report: WeaknessReport; currentGames: number | null }) {
  const state = useStore();
  const [kind, setKind] = useState<WeaknessKind | 'all'>('all');
  const [side, setSide] = useState<'both' | Color>('both');
  const [limit, setLimit] = useState(REPORT_PAGE);

  const reach = useMemo(
    () => ({ white: reachable(state.reps.white), black: reachable(state.reps.black) }),
    [state.reps, state.repsRev],
  );

  const bySide = report.items.filter((w) => side === 'both' || w.color === side);
  const items = bySide.filter((w) => kind === 'all' || w.kind === kind).sort((a, b) => b.severity - a.severity);
  const countKind = (k: WeaknessKind) => bySide.filter((w) => w.kind === k).length;
  const countSide = (c: Color) => report.items.filter((w) => w.color === c && (kind === 'all' || w.kind === kind)).length;
  const date = new Date(report.generatedAt);
  const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const o = report.options;

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Rapport</h3>
        <span className="grow" />
        <button
          type="button"
          className="btn small ghost"
          onClick={() => confirm('Effacer ce rapport ?') && setReport(null)}
        >
          Effacer
        </button>
      </div>
      <p className="muted small">
        Analyse du {formatDate(report.generatedAt)} à {time}, sur {plural(report.games, 'partie')} ;{' '}
        {o.useEngine ? `Stockfish profondeur ${o.depth}, ${o.maxPositions} positions par couleur` : 'sans Stockfish'}.
      </p>
      {currentGames !== null && currentGames !== report.games && (
        <div className="feedback info small">
          Vos parties ou le filtre de cadences ont changé depuis cette analyse ({plural(currentGames, 'partie')} maintenant) :
          relancez-la pour la mettre à jour.
        </div>
      )}

      <div className="weak-filters">
        <div className="seg">
          <button type="button" className={kind === 'all' ? 'active' : ''} onClick={() => { setKind('all'); setLimit(REPORT_PAGE); }}>
            Tout ({bySide.length})
          </button>
          {KINDS.map((k) => (
            <button key={k} type="button" className={kind === k ? 'active' : ''} onClick={() => { setKind(k); setLimit(REPORT_PAGE); }}>
              {KIND_LABEL[k]} ({countKind(k)})
            </button>
          ))}
        </div>
        <div className="seg">
          <button type="button" className={side === 'both' ? 'active' : ''} onClick={() => { setSide('both'); setLimit(REPORT_PAGE); }}>
            Les deux
          </button>
          {COLORS.map((c) => (
            <button key={c} type="button" className={side === c ? 'active' : ''} onClick={() => { setSide(c); setLimit(REPORT_PAGE); }}>
              {colorLabel(c)} ({countSide(c)})
            </button>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="empty-state">
          {report.items.length === 0
            ? 'Aucun point faible trouvé avec ces réglages. Essayez une sensibilité plus haute ou moins de parties minimum par position.'
            : 'Rien dans cette catégorie.'}
        </div>
      ) : (
        <div className="weak-list">
          {items.slice(0, limit).map((w) => {
            const rep = state.reps[w.color];
            const fixed =
              w.kind === 'engine' && !!w.best && hasMove(rep, w.key, w.best) && !(w.played && hasMove(rep, w.key, w.played));
            return <WeaknessCard key={w.id} w={w} inRep={reach[w.color].has(w.key)} fixed={fixed} showKind={kind === 'all'} />;
          })}
          {items.length > limit && (
            <button type="button" className="btn ghost" onClick={() => setLimit((l) => l + REPORT_PAGE)}>
              Afficher plus ({plural(items.length - limit, 'autre point faible', 'autres points faibles')})
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- view ----------

export function AnalysisView() {
  const state = useStore();
  const t = useSyncExternalStore(subscribeTask, () => task);
  const [color, setColor] = useState<Color>(state.settings.side);
  const [byFamily, setByFamily] = useState(false);
  const [usageLimit, setUsageLimit] = useState(USAGE_PAGE);
  const [opts, setOpts] = useState(loadOptions);

  const speedsSig = state.settings.speeds ? state.settings.speeds.join(',') : '*';
  const all = useMemo(() => allGames(), [state.gamesRev, state.sources]);
  const speedCounts = useMemo(() => {
    const counts = new Map<Speed, number>();
    for (const g of all) counts.set(g.speed, (counts.get(g.speed) ?? 0) + 1);
    return SPEEDS.filter((s) => counts.has(s.id)).map((s) => ({ id: s.id, label: s.label, count: counts.get(s.id)! }));
  }, [all]);
  const games = useMemo(
    () => filterGames(all, { speeds: state.settings.speeds ?? undefined }),
    [all, speedsSig],
  );
  const perColor = useMemo(() => {
    const s: Record<Color, Stats> = { white: emptyStats(), black: emptyStats() };
    for (const g of games) addResult(s[g.color], g.result);
    return s;
  }, [games]);
  const rows = useMemo(() => openingUsage(games, color, byFamily), [games, color, byFamily]);

  const selected = new Set<Speed>(state.settings.speeds ?? speedCounts.map((s) => s.id));
  const toggleSpeed = (id: Speed) => {
    const present = speedCounts.map((s) => s.id);
    const next = present.filter((s) => (s === id ? !selected.has(s) : selected.has(s)));
    if (!next.length) return;
    setSettings({ speeds: next.length === present.length ? null : next });
  };

  const patchOpts = (p: Partial<WeaknessOptions>) =>
    setOpts((o) => {
      const next = { ...o, ...p };
      saveOptions(next);
      return next;
    });

  const running = t.running;
  const progress = running?.progress;
  const report = state.report;

  if (!all.length) {
    return (
      <div className="page analysis-page">
        <div className="page-head">
          <h2>Analyse</h2>
        </div>
        <div className="panel">
          <div className="empty-state">
            <p>
              L'analyse s'appuie sur les ouvertures que vous jouez réellement : importez d'abord vos parties Lichess ou
              Chess.com pour voir vos ouvertures, vos scores et vos points faibles.
            </p>
            <button type="button" className="btn primary" onClick={() => setView('import')}>
              <Icon name="download" /> Importer mes parties
            </button>
          </div>
        </div>
        {report && <ReportPanel report={report} currentGames={null} />}
      </div>
    );
  }

  const total = perColor[color];

  return (
    <div className="page analysis-page">
      <div className="page-head">
        <h2>Analyse</h2>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>Cadences prises en compte</h3>
        </div>
        <div className="checks">
          {speedCounts.map((s) => (
            <label key={s.id} className="check-chip">
              <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleSpeed(s.id)} />
              {s.label} <span className="muted">{s.count}</span>
            </label>
          ))}
        </div>
        <p className="muted small">Ce filtre s'applique aussi aux statistiques de vos parties dans l'explorateur et à la génération du répertoire.</p>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>Vos ouvertures</h3>
        </div>
        <div className="row">
          <div className="seg">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={color === c ? 'active' : ''}
                onClick={() => {
                  setColor(c);
                  setUsageLimit(USAGE_PAGE);
                }}
              >
                {colorLabel(c)} ({perColor[c].n})
              </button>
            ))}
          </div>
          <label className="switch">
            <input type="checkbox" checked={byFamily} onChange={(e) => setByFamily(e.target.checked)} />
            <span>Regrouper par famille</span>
          </label>
          <span className="grow" />
          {total.n > 0 && (
            <div className="usage-total">
              <span className="small">
                {plural(total.n, 'partie')}, score {pct(scoreOf(total))}
              </span>
              <Wdl s={total} />
            </div>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="empty-state">Aucune partie avec les {colorLabel(color)} pour ces cadences.</div>
        ) : (
          <>
            <table className="table usage-table">
              <thead>
                <tr>
                  <th>Ouverture</th>
                  <th className="num">Parties</th>
                  <th className="num">Score</th>
                  <th className="wdl-col">Résultats</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, usageLimit).map((r) => {
                  const s = scoreOf(r);
                  return (
                    <tr key={r.name} className="clickable" title="Ouvrir dans l'explorateur" onClick={() => openInExplorer(r.ucis, color)}>
                      <td>
                        {r.eco && <span className="usage-eco">{r.eco}</span>}
                        {r.name}
                      </td>
                      <td className="num">{r.n}</td>
                      <td className={`num ${r.n >= 5 ? (s >= 0.55 ? 'success' : s <= 0.45 ? 'error' : '') : ''}`}>{pct(s)}</td>
                      <td className="wdl-col">
                        <Wdl s={r} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows.length > usageLimit && (
              <button type="button" className="btn ghost" onClick={() => setUsageLimit((l) => l + USAGE_PAGE)}>
                Afficher plus ({plural(rows.length - usageLimit, 'autre ouverture', 'autres ouvertures')})
              </button>
            )}
          </>
        )}
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>Points faibles</h3>
        </div>
        <p className="muted small">
          Cherche dans vos parties les lignes où vous perdez des points, les positions où vous hésitez entre plusieurs coups,
          les réponses adverses fréquentes absentes de votre répertoire et, avec Stockfish, les coups habituels qui sont
          théoriquement faibles.
        </p>
        <div className="analysis-options">
          <label className="field">
            <span>Parties minimum par position</span>
            <NumberInput value={opts.minGames} min={1} max={100} disabled={!!running} onChange={(minGames) => patchOpts({ minGames })} />
            <small className="field-help">Une position n'est examinée que si vous l'avez atteinte au moins ce nombre de fois.</small>
          </label>
          <label className="field">
            <span>Profondeur maximale (en coups)</span>
            <NumberInput
              value={Math.round(opts.maxPly / 2)}
              min={1}
              max={20}
              disabled={!!running}
              onChange={(n) => patchOpts({ maxPly: n * 2 })}
            />
            <small className="field-help">Jusqu'où descendre dans vos lignes, en coups de chaque camp.</small>
          </label>
          <div className="field">
            <span>Analyse Stockfish</span>
            <label className="switch">
              <input
                type="checkbox"
                checked={opts.useEngine}
                disabled={!!running}
                onChange={(e) => patchOpts({ useEngine: e.target.checked })}
              />
              <span>{opts.useEngine ? 'Activée' : 'Désactivée'}</span>
            </label>
            <small className="field-help">Vérifie vos coups habituels avec le moteur. Peut prendre plusieurs minutes.</small>
          </div>
          <label className="field">
            <span>Profondeur Stockfish</span>
            <select
              value={opts.depth}
              disabled={!opts.useEngine || !!running}
              onChange={(e) => patchOpts({ depth: Number(e.target.value) })}
            >
              {Array.from({ length: 11 }, (_, i) => 10 + i).map((d) => (
                <option key={d} value={d}>
                  {d}
                  {d === DEFAULT_WEAKNESS.depth ? ' (conseillé)' : ''}
                </option>
              ))}
            </select>
            <small className="field-help">Plus haut : plus fiable mais plus lent.</small>
          </label>
          <label className="field">
            <span>Positions analysées par couleur</span>
            <NumberInput
              value={opts.maxPositions}
              min={1}
              max={300}
              disabled={!opts.useEngine || !!running}
              onChange={(maxPositions) => patchOpts({ maxPositions })}
            />
            <small className="field-help">Les plus fréquentes d'abord.</small>
          </label>
          <div className="field">
            <span>Sensibilité</span>
            <div className="seg">
              {SENSITIVITY.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  className={opts.minWinLoss === s.value ? 'active' : ''}
                  disabled={!opts.useEngine || !!running}
                  title={`Signale un coup qui fait perdre au moins ${s.value} points de chances de gain`}
                  onClick={() => patchOpts({ minWinLoss: s.value })}
                >
                  {s.label} ({s.value})
                </button>
              ))}
            </div>
            <small className="field-help">Perte minimale de chances de gain, en points de pourcentage, pour signaler un coup.</small>
          </div>
        </div>

        {running && progress ? (
          <div className="analysis-progress">
            <div className="row">
              <span className="small">{progress.message}</span>
              <span className="grow" />
              {progress.total > 0 && (
                <span className="muted small">
                  {progress.done} / {plural(progress.total, 'position')}
                </span>
              )}
              <button type="button" className="btn small danger" onClick={() => running.ctrl.abort()}>
                Annuler
              </button>
            </div>
            <div className={`progress${progress.total ? '' : ' indeterminate'}`}>
              <div style={progress.total ? { width: `${(progress.done / progress.total) * 100}%` } : undefined} />
            </div>
            {opts.useEngine && (
              <p className="muted small">
                L'analyse moteur peut prendre plusieurs minutes. Vous pouvez changer d'onglet : elle continue en arrière-plan.
              </p>
            )}
          </div>
        ) : (
          <div className="row">
            <button type="button" className="btn primary" disabled={!games.length} onClick={() => runAnalysis(opts)}>
              <Icon name="target" /> Analyser mes ouvertures
            </button>
            {!games.length && <span className="muted small">Aucune partie pour les cadences choisies.</span>}
          </div>
        )}
        {t.error && !running && <div className="feedback bad">{t.error}</div>}
      </div>

      {report ? (
        <ReportPanel report={report} currentGames={games.length} />
      ) : (
        !running && (
          <div className="panel">
            <div className="empty-state">Aucun rapport pour l'instant : lancez l'analyse pour repérer vos points faibles.</div>
          </div>
        )
      )}
    </div>
  );
}
