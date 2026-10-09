import { useMemo, useState, useSyncExternalStore } from 'react';
import { Icon } from '../components/Icon';
import { Wdl } from '../components/Wdl';
import { fetchChesscomGames } from '../games/chesscom';
import { fetchLichessGames } from '../games/lichess';
import { addResult, emptyStats, scoreOf, type Stats } from '../games/tree';
import {
  MAX_STORED_PLIES,
  SITE_LABEL,
  SPEEDS,
  type GameRecord,
  type ImportOptions,
  type ImportProgress,
  type Site,
  type Speed,
} from '../games/types';
import { colorLabel, START_KEY, type Color } from '../lib/chess';
import { formatDate, pct, plural } from '../lib/util';
import { DEFAULT_GENERATE, generateFromTree, mergeRepertoire, type GenerateOptions } from '../repertoire/generate';
import { hasMove, repStats, type Repertoire, type RepStats } from '../repertoire/model';
import {
  getTrees,
  removeSource,
  repsChanged,
  saveSource,
  setRepertoire,
  setView,
  toast,
  useStore,
} from '../store/store';
import '../styles/import.css';

const COLORS: Color[] = ['white', 'black'];
const SITES: Site[] = ['lichess', 'chesscom'];
const MAX_GAMES = 5000;

// ---------- remembered form values ----------

interface ImportForm {
  site: Site;
  username: string;
  maxGames: number;
  speeds: Speed[];
  ratedOnly: boolean;
  colors: ImportOptions['colors'];
}

interface GenerateForm {
  opts: GenerateOptions;
  colors: 'both' | Color;
  mode: 'merge' | 'replace';
}

const FORM_KEY = 'cot.import.form';
const GEN_KEY = 'cot.import.generate';
const DEFAULT_FORM: ImportForm = { site: 'lichess', username: '', maxGames: 300, speeds: ['blitz', 'rapid'], ratedOnly: true, colors: 'both' };
const DEFAULT_GEN_FORM: GenerateForm = { opts: { ...DEFAULT_GENERATE }, colors: 'both', mode: 'merge' };

function loadJson<T>(key: string): Partial<T> {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Partial<T>) : {};
  } catch {
    return {};
  }
}

function saveJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable (private mode): the form simply isn't remembered.
  }
}

const siteSpeeds = (site: Site) => SPEEDS.filter((s) => s.sites.includes(site)).map((s) => s.id);

function loadForm(): ImportForm {
  const f = { ...DEFAULT_FORM, ...loadJson<ImportForm>(FORM_KEY) };
  if (!SITES.includes(f.site)) f.site = DEFAULT_FORM.site;
  const avail = siteSpeeds(f.site);
  f.speeds = Array.isArray(f.speeds) ? f.speeds.filter((s) => avail.includes(s)) : [];
  if (!f.speeds.length) f.speeds = DEFAULT_FORM.speeds;
  f.maxGames = clamp(Number(f.maxGames) || DEFAULT_FORM.maxGames, 1, MAX_GAMES);
  return f;
}

function loadGenForm(): GenerateForm {
  const g = loadJson<GenerateForm>(GEN_KEY);
  return {
    opts: { ...DEFAULT_GENERATE, ...g.opts },
    colors: g.colors ?? DEFAULT_GEN_FORM.colors,
    mode: g.mode === 'replace' ? 'replace' : 'merge',
  };
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

// ---------- import task (module level, so it survives a change of view) ----------

interface ImportTask {
  running: { ctrl: AbortController; options: ImportOptions; progress: ImportProgress } | null;
  error: string;
  lastId: string | null;
}

let task: ImportTask = { running: null, error: '', lastId: null };
const taskListeners = new Set<() => void>();

function setTask(patch: Partial<ImportTask>) {
  task = { ...task, ...patch };
  for (const l of taskListeners) l();
}

function subscribeTask(l: () => void) {
  taskListeners.add(l);
  return () => {
    taskListeners.delete(l);
  };
}

async function runImport(options: ImportOptions) {
  if (task.running) return;
  const ctrl = new AbortController();
  setTask({
    running: { ctrl, options, progress: { fetched: 0, kept: 0, message: `Connexion à ${SITE_LABEL[options.site]}...` } },
    error: '',
  });
  try {
    const fetcher = options.site === 'lichess' ? fetchLichessGames : fetchChesscomGames;
    const onProgress = (progress: ImportProgress) => {
      if (task.running) setTask({ running: { ...task.running, progress } });
    };
    const games = await fetcher(options, onProgress, ctrl.signal);
    if (ctrl.signal.aborted) {
      toast('Import annulé.');
      return;
    }
    if (!games.length) {
      setTask({ error: 'Aucune partie ne correspond à ces critères (cadences, parties classées, couleur).' });
      return;
    }
    const id = `${options.site}:${options.username.toLowerCase()}`;
    saveSource({ id, site: options.site, username: options.username, importedAt: Date.now(), options, games });
    setTask({ lastId: id });
    toast(`${plural(games.length, 'partie importée', 'parties importées')} depuis ${SITE_LABEL[options.site]}.`);
  } catch (e) {
    if (ctrl.signal.aborted) toast('Import annulé.');
    else if (e instanceof TypeError) {
      setTask({ error: `Impossible de joindre ${SITE_LABEL[options.site]}. Vérifiez votre connexion internet puis réessayez.` });
    } else setTask({ error: (e as Error).message || 'Erreur inconnue pendant l\'import.' });
  } finally {
    setTask({ running: null });
  }
}

// ---------- helpers ----------

function summarize(games: GameRecord[]) {
  const stats: Record<Color, Stats> = { white: emptyStats(), black: emptyStats() };
  let first = Infinity;
  let last = 0;
  for (const g of games) {
    addResult(stats[g.color], g.result);
    first = Math.min(first, g.playedAt);
    last = Math.max(last, g.playedAt);
  }
  return { stats, first, last };
}

/** Moves of `src` missing from `dst`. */
function countNew(dst: Repertoire, src: Repertoire): number {
  let n = 0;
  for (const [key, node] of Object.entries(src.nodes)) {
    for (const m of node.moves) if (!hasMove(dst, key, m.uci)) n++;
  }
  return n;
}

const speedLabel = (id: Speed) => SPEEDS.find((s) => s.id === id)?.label ?? id;

/** Number input that lets the field be cleared while typing. */
function NumberInput({ value, min, max, step = 1, disabled, onChange }: {
  value: number;
  min: number;
  max: number;
  step?: number;
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
      step={step}
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

// ---------- view ----------

export function ImportView() {
  const state = useStore();
  const t = useSyncExternalStore(subscribeTask, () => task);
  const [form, setForm] = useState(loadForm);
  const [gen, setGen] = useState(loadGenForm);
  const [applied, setApplied] = useState(false);

  const running = t.running;
  const avail = SPEEDS.filter((s) => s.sites.includes(form.site));
  const speeds = form.speeds.filter((s) => avail.some((a) => a.id === s));
  const canImport = !running && form.username.trim() !== '' && speeds.length > 0;
  const hasGames = state.sources.some((s) => s.games.length > 0);
  const speedsSig = state.settings.speeds ? state.settings.speeds.join(',') : '*';

  const patch = (p: Partial<ImportForm>) => setForm((f) => ({ ...f, ...p }));

  const setSite = (site: Site) =>
    setForm((f) => {
      const ok = siteSpeeds(site);
      const kept = f.speeds.filter((s) => ok.includes(s));
      return { ...f, site, speeds: kept.length ? kept : DEFAULT_FORM.speeds };
    });

  const toggleSpeed = (id: Speed) =>
    setForm((f) => ({ ...f, speeds: f.speeds.includes(id) ? f.speeds.filter((s) => s !== id) : [...f.speeds, id] }));

  const start = () => {
    if (!canImport) return;
    const next = { ...form, username: form.username.trim(), speeds };
    saveJson(FORM_KEY, next);
    setApplied(false);
    runImport({
      site: next.site,
      username: next.username,
      maxGames: clamp(next.maxGames, 1, MAX_GAMES),
      speeds: next.speeds,
      ratedOnly: next.ratedOnly,
      colors: next.colors,
    });
  };

  const reimport = (options: ImportOptions) => {
    setForm({ ...DEFAULT_FORM, ...options });
    setApplied(false);
    runImport(options);
  };

  const remove = (id: string, label: string, count: number) => {
    if (!confirm(`Supprimer les ${plural(count, 'partie')} de ${label} ? Votre répertoire n'est pas modifié.`)) return;
    removeSource(id);
    if (task.lastId === id) setTask({ lastId: null });
  };

  // ----- generation -----

  const preview = useMemo(() => {
    if (!hasGames) return null;
    const { trees, games } = getTrees();
    const per = {} as Record<Color, { stats: RepStats; games: number; added: number; current: number }>;
    for (const c of COLORS) {
      const rep = generateFromTree(trees[c], gen.opts);
      per[c] = {
        stats: repStats(rep),
        games: trees[c].nodes.get(START_KEY)?.n ?? 0,
        added: countNew(state.reps[c], rep),
        current: repStats(state.reps[c]).moves,
      };
    }
    return { games, per };
  }, [hasGames, state.gamesRev, speedsSig, gen.opts, state.reps, state.repsRev]);

  const targets: Color[] = gen.colors === 'both' ? COLORS : [gen.colors];
  const patchOpts = (p: Partial<GenerateOptions>) => {
    setApplied(false);
    setGen((g) => ({ ...g, opts: { ...g.opts, ...p } }));
  };

  const apply = () => {
    const { trees } = getTrees();
    const done: string[] = [];
    let empty = 0;
    let merged = false;
    for (const c of targets) {
      const rep = generateFromTree(trees[c], gen.opts);
      const moves = repStats(rep).moves;
      if (!moves) {
        empty++;
        continue;
      }
      if (gen.mode === 'replace') {
        const cur = state.reps[c];
        const curMoves = repStats(cur).moves;
        const msg =
          `Remplacer votre répertoire ${colorLabel(c)} (${plural(curMoves, 'coup')}) par le répertoire généré (${plural(moves, 'coup')}) ?\n\n` +
          'Les coups absents du nouveau répertoire seront perdus. Les positions conservées gardent leur commentaire et leur progression d\'entraînement.';
        if (curMoves && !confirm(msg)) continue;
        for (const key of Object.keys(rep.nodes)) {
          if (cur.cards[key]) rep.cards[key] = cur.cards[key];
          const comment = cur.nodes[key]?.comment;
          if (comment) rep.nodes[key].comment = comment;
        }
        setRepertoire(c, rep);
        done.push(`${colorLabel(c)} : ${plural(moves, 'coup')}`);
      } else {
        const added = mergeRepertoire(state.reps[c], rep);
        merged = true;
        done.push(`${colorLabel(c)} : ${plural(added, 'coup ajouté', 'coups ajoutés')}`);
      }
    }
    if (merged) repsChanged();
    if (!done.length) {
      if (empty) toast('Aucun coup ne passe ces seuils : baissez les minimums ou importez plus de parties.', 'error');
      return;
    }
    saveJson(GEN_KEY, gen);
    toast(`Répertoire ${gen.mode === 'replace' ? 'remplacé' : 'complété'} (${done.join(', ')}).`);
    setApplied(true);
  };

  // ----- render -----

  const lastSource = t.lastId ? state.sources.find((s) => s.id === t.lastId) : undefined;
  const summary = useMemo(() => (lastSource ? summarize(lastSource.games) : null), [lastSource]);
  const ratio = running
    ? Math.min(1, (running.options.site === 'lichess' ? running.progress.fetched : running.progress.kept) / running.options.maxGames)
    : 0;
  const filterLabel = state.settings.speeds ? state.settings.speeds.map(speedLabel).join(', ') : 'toutes les cadences';

  return (
    <div className="page import-page">
      <div className="page-head">
        <h2>Importer mes parties</h2>
      </div>

      <div className="grid-2">
        <form
          className="panel"
          onSubmit={(e) => {
            e.preventDefault();
            start();
          }}
        >
          <div className="panel-head">
            <h3>Nouvel import</h3>
          </div>
          <div className="import-form">
            <div className="field">
              <span>Site</span>
              <div className="seg">
                {SITES.map((s) => (
                  <button key={s} type="button" className={form.site === s ? 'active' : ''} onClick={() => setSite(s)}>
                    {SITE_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>
            <label className="field">
              <span>Nom d'utilisateur</span>
              <input
                type="text"
                value={form.username}
                placeholder={`Votre pseudo ${SITE_LABEL[form.site]}`}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => patch({ username: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Nombre de parties</span>
              <NumberInput value={form.maxGames} min={1} max={MAX_GAMES} onChange={(maxGames) => patch({ maxGames })} />
              <small className="field-help">Les plus récentes d'abord ({MAX_GAMES} maximum).</small>
            </label>
            <div className="field">
              <span>Couleur</span>
              <div className="seg">
                {(['both', 'white', 'black'] as const).map((c) => (
                  <button key={c} type="button" className={form.colors === c ? 'active' : ''} onClick={() => patch({ colors: c })}>
                    {c === 'both' ? 'Les deux' : colorLabel(c)}
                  </button>
                ))}
              </div>
            </div>
            <div className="field full">
              <span>Cadences</span>
              <div className="checks">
                {avail.map((s) => (
                  <label key={s.id} className="check-chip">
                    <input type="checkbox" checked={speeds.includes(s.id)} onChange={() => toggleSpeed(s.id)} />
                    {s.label}
                  </label>
                ))}
              </div>
            </div>
            <label className="switch full">
              <input type="checkbox" checked={form.ratedOnly} onChange={(e) => patch({ ratedOnly: e.target.checked })} />
              <span>Parties classées uniquement</span>
            </label>
          </div>
          <div className="row">
            <button type="submit" className="btn primary" disabled={!canImport}>
              <Icon name="download" /> Importer
            </button>
          </div>
          <p className="muted small">
            Les parties sont téléchargées directement depuis l'API publique de Lichess ou de Chess.com par votre navigateur,
            puis stockées uniquement sur cet appareil : rien n'est envoyé à un serveur. Seuls les {MAX_STORED_PLIES / 2} premiers
            coups de chaque partie sont conservés. Réimporter un compte remplace ses parties.
          </p>
        </form>

        <div className="stack import-side">
          {running && (
            <div className="panel">
              <div className="panel-head">
                <h3>Import en cours</h3>
                <span className="grow" />
                <button type="button" className="btn small danger" onClick={() => running.ctrl.abort()}>
                  Annuler
                </button>
              </div>
              <p className="small">{running.progress.message}</p>
              <div className="progress">
                <div style={{ width: `${ratio * 100}%` }} />
              </div>
              <p className="muted small">
                {running.options.username} ({SITE_LABEL[running.options.site]}) :{' '}
                {plural(running.progress.kept, 'partie retenue', 'parties retenues')} sur {running.options.maxGames} demandées
              </p>
            </div>
          )}

          {!running && t.error && <div className="feedback bad">{t.error}</div>}

          {!running && lastSource && summary && (
            <div className="panel">
              <div className="panel-head">
                <h3>Import terminé</h3>
              </div>
              <p>
                {plural(lastSource.games.length, 'partie')} de <b>{lastSource.username}</b> ({SITE_LABEL[lastSource.site]})
                {lastSource.games.length > 0 && (
                  <>
                    , du {formatDate(summary.first)} au {formatDate(summary.last)}
                  </>
                )}
                .
              </p>
              {COLORS.map((c) => {
                const s = summary.stats[c];
                return (
                  <div key={c} className="import-color">
                    <div className="row">
                      <b>{colorLabel(c)}</b>
                      <span className="muted small">{plural(s.n, 'partie')}</span>
                      <span className="grow" />
                      {s.n > 0 && <span className="small">score {pct(scoreOf(s))}</span>}
                    </div>
                    <Wdl s={s} />
                  </div>
                );
              })}
            </div>
          )}

          <div className="panel">
            <div className="panel-head">
              <h3>Comptes importés</h3>
            </div>
            {state.sources.length === 0 ? (
              <p className="muted small">Aucun compte importé pour l'instant.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Compte</th>
                    <th>Parties</th>
                    <th>Importé le</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {state.sources.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <div className="account-name">{s.username}</div>
                        <div className="muted small">
                          {SITE_LABEL[s.site]} · {s.options.speeds.map(speedLabel).join(', ')}
                        </div>
                      </td>
                      <td>{s.games.length}</td>
                      <td className="small">{formatDate(s.importedAt)}</td>
                      <td>
                        <div className="account-actions">
                          <button
                            type="button"
                            className="icon-btn small"
                            title="Réimporter avec les mêmes réglages"
                            disabled={!!running}
                            onClick={() => reimport(s.options)}
                          >
                            <Icon name="reset" size={15} />
                          </button>
                          <button
                            type="button"
                            className="icon-btn small"
                            title="Supprimer ces parties"
                            disabled={!!running}
                            onClick={() => remove(s.id, `${s.username} (${SITE_LABEL[s.site]})`, s.games.length)}
                          >
                            <Icon name="trash" size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>Générer le répertoire</h3>
        </div>
        {!hasGames || !preview ? (
          <p className="muted">Importez d'abord des parties : le répertoire est construit à partir des coups que vous jouez réellement.</p>
        ) : (
          <>
            <p className="muted small">
              Construit votre répertoire habituel à partir de toutes vos parties importées ({plural(preview.games, 'partie')},{' '}
              {filterLabel}, filtre réglable dans l'onglet Analyse) : vos coups fréquents et les réponses adverses que vous
              rencontrez souvent.
            </p>
            <div className="gen-options">
              <label className="field">
                <span>Profondeur (en coups)</span>
                <NumberInput
                  value={Math.round(gen.opts.maxPly / 2)}
                  min={1}
                  max={20}
                  onChange={(n) => patchOpts({ maxPly: n * 2 })}
                />
                <small className="field-help">Nombre de coups de chaque camp couverts par le répertoire.</small>
              </label>
              <label className="field">
                <span>Vos coups : joués au moins N fois</span>
                <NumberInput value={gen.opts.minGamesMine} min={1} max={100} onChange={(minGamesMine) => patchOpts({ minGamesMine })} />
                <small className="field-help">Un coup joué plus rarement n'entre pas dans le répertoire.</small>
              </label>
              <label className="field">
                <span>et dans au moins X % des cas</span>
                <NumberInput
                  value={Math.round(gen.opts.minShareMine * 100)}
                  min={0}
                  max={100}
                  step={5}
                  onChange={(n) => patchOpts({ minShareMine: n / 100 })}
                />
                <small className="field-help">Part minimale parmi vos coups dans la position. À défaut, votre coup le plus joué est gardé.</small>
              </label>
              <label className="field">
                <span>Réponses adverses : rencontrées au moins N fois</span>
                <NumberInput value={gen.opts.minGamesOpp} min={1} max={100} onChange={(minGamesOpp) => patchOpts({ minGamesOpp })} />
                <small className="field-help">Les réponses plus rares sont ignorées : vous préparez ce que vous rencontrez vraiment.</small>
              </label>
            </div>

            <div className="row">
              <div className="seg">
                {(['both', 'white', 'black'] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={gen.colors === c ? 'active' : ''}
                    onClick={() => {
                      setApplied(false);
                      setGen((g) => ({ ...g, colors: c }));
                    }}
                  >
                    {c === 'both' ? 'Les deux couleurs' : colorLabel(c)}
                  </button>
                ))}
              </div>
              <div className="seg">
                {(['merge', 'replace'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={gen.mode === m ? 'active' : ''}
                    onClick={() => {
                      setApplied(false);
                      setGen((g) => ({ ...g, mode: m }));
                    }}
                  >
                    {m === 'merge' ? 'Fusionner avec mon répertoire' : 'Remplacer'}
                  </button>
                ))}
              </div>
            </div>

            <div className="gen-preview">
              {targets.map((c) => {
                const p = preview.per[c];
                return (
                  <div key={c} className="gen-card">
                    <div className="row">
                      <b>{colorLabel(c)}</b>
                      <span className="grow" />
                      <span className="muted small">{plural(p.games, 'partie')}</span>
                    </div>
                    {p.stats.moves === 0 ? (
                      <p className="muted small">Aucun coup ne passe ces seuils pour cette couleur.</p>
                    ) : (
                      <>
                        <p className="small">
                          {plural(p.stats.moves, 'coup')} : {plural(p.stats.cards, 'position')} où vous jouez,{' '}
                          {plural(p.stats.lines, 'fin de ligne', 'fins de ligne')}.
                        </p>
                        <p className="muted small">
                          {gen.mode === 'merge'
                            ? p.added
                              ? `Fusion : ${plural(p.added, 'nouveau coup', 'nouveaux coups')} pour votre répertoire (${plural(p.current, 'coup')} actuellement).`
                              : 'Fusion : votre répertoire contient déjà tous ces coups.'
                            : p.current
                              ? `Remplace votre répertoire actuel (${plural(p.current, 'coup')}).`
                              : 'Votre répertoire est vide pour cette couleur.'}
                        </p>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="row">
              <button
                type="button"
                className="btn primary"
                disabled={targets.every((c) => preview.per[c].stats.moves === 0)}
                onClick={apply}
              >
                <Icon name="book" /> {gen.mode === 'merge' ? 'Ajouter à mon répertoire' : 'Remplacer mon répertoire'}
              </button>
              {applied && (
                <>
                  <span className="success small">Répertoire mis à jour.</span>
                  <span className="grow" />
                  <button type="button" className="btn small" onClick={() => setView('repertoire')}>
                    Voir le répertoire
                  </button>
                  <button type="button" className="btn small" onClick={() => setView('explorer')}>
                    Explorer
                  </button>
                  <button type="button" className="btn small" onClick={() => setView('analysis')}>
                    Chercher mes points faibles
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
