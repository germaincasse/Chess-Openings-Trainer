import { Fragment, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Icon } from '../components/Icon';
import { Wdl } from '../components/Wdl';
import { fetchChesscomGames } from '../games/chesscom';
import { fetchLichessGames } from '../games/lichess';
import { addResult, emptyStats, scoreOf, type Stats } from '../games/tree';
import {
  MAX_STORED_PLIES,
  SITE_LABEL,
  SPEEDS,
  speedLabel,
  type GameRecord,
  type ImportOptions,
  type ImportProgress,
  type Site,
  type Speed,
} from '../games/types';
import { msg, t, useT, type Msg } from '../i18n';
import { colorLabel, START_KEY, type Color } from '../lib/chess';
import { formatDate, pct } from '../lib/util';
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
  /** Messages so the error follows a change of language (plain strings come from the fetchers). */
  error: Msg | string;
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
    running: { ctrl, options, progress: { fetched: 0, kept: 0, message: t('import.connecting', { site: SITE_LABEL[options.site] }) } },
    error: '',
  });
  try {
    const fetcher = options.site === 'lichess' ? fetchLichessGames : fetchChesscomGames;
    const onProgress = (progress: ImportProgress) => {
      if (task.running) setTask({ running: { ...task.running, progress } });
    };
    const games = await fetcher(options, onProgress, ctrl.signal);
    if (ctrl.signal.aborted) {
      toast(t('import.cancelled'));
      return;
    }
    if (!games.length) {
      setTask({ error: { key: 'import.noMatch' } });
      return;
    }
    const id = `${options.site}:${options.username.toLowerCase()}`;
    saveSource({ id, site: options.site, username: options.username, importedAt: Date.now(), options, games });
    setTask({ lastId: id });
    toast(t('import.imported', { count: games.length, site: SITE_LABEL[options.site] }));
  } catch (e) {
    if (ctrl.signal.aborted) toast(t('import.cancelled'));
    else if (e instanceof TypeError) {
      setTask({ error: { key: 'import.unreachable', params: { site: SITE_LABEL[options.site] } } });
    } else setTask({ error: (e as Error).message || { key: 'import.unknownError' } });
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

/** Puts React nodes in place of the {name} placeholders left in a translated text. */
function rich(text: string, nodes: Record<string, ReactNode>): ReactNode[] {
  return text
    .split(/\{(\w+)\}/g)
    .map((part, i) => (i % 2 ? <Fragment key={i}>{part in nodes ? nodes[part] : `{${part}}`}</Fragment> : part));
}

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
  const t = useT();
  const job = useSyncExternalStore(subscribeTask, () => task);
  const [form, setForm] = useState(loadForm);
  const [gen, setGen] = useState(loadGenForm);
  const [applied, setApplied] = useState(false);

  const running = job.running;
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
    if (!confirm(t('import.removeConfirm', { count, label }))) return;
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
        const question = t('import.replaceConfirm', {
          color: colorLabel(c),
          current: t('common.moves', { count: curMoves }),
          generated: t('common.moves', { count: moves }),
        });
        if (curMoves && !confirm(question)) continue;
        for (const key of Object.keys(rep.nodes)) {
          if (cur.cards[key]) rep.cards[key] = cur.cards[key];
          const comment = cur.nodes[key]?.comment;
          if (comment) rep.nodes[key].comment = comment;
        }
        setRepertoire(c, rep);
        done.push(t('import.doneReplaced', { color: colorLabel(c), moves: t('common.moves', { count: moves }) }));
      } else {
        const added = mergeRepertoire(state.reps[c], rep);
        merged = true;
        done.push(t('import.doneMerged', { color: colorLabel(c), count: added }));
      }
    }
    if (merged) repsChanged();
    if (!done.length) {
      if (empty) toast(t('import.noMovesPass'), 'error');
      return;
    }
    saveJson(GEN_KEY, gen);
    toast(t(gen.mode === 'replace' ? 'import.repReplaced' : 'import.repMerged', { list: done.join(', ') }));
    setApplied(true);
  };

  // ----- render -----

  const lastSource = job.lastId ? state.sources.find((s) => s.id === job.lastId) : undefined;
  const summary = useMemo(() => (lastSource ? summarize(lastSource.games) : null), [lastSource]);
  const ratio = running
    ? Math.min(1, (running.options.site === 'lichess' ? running.progress.fetched : running.progress.kept) / running.options.maxGames)
    : 0;
  const filterLabel = state.settings.speeds ? state.settings.speeds.map(speedLabel).join(', ') : t('import.allSpeeds');

  return (
    <div className="page import-page">
      <div className="page-head">
        <h2>{t('import.title')}</h2>
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
            <h3>{t('import.newImport')}</h3>
          </div>
          <div className="import-form">
            <div className="field">
              <span>{t('import.site')}</span>
              <div className="seg">
                {SITES.map((s) => (
                  <button key={s} type="button" className={form.site === s ? 'active' : ''} onClick={() => setSite(s)}>
                    {SITE_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>
            <label className="field">
              <span>{t('import.username')}</span>
              <input
                type="text"
                value={form.username}
                placeholder={t('import.usernamePlaceholder', { site: SITE_LABEL[form.site] })}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => patch({ username: e.target.value })}
              />
            </label>
            <label className="field">
              <span>{t('import.maxGames')}</span>
              <NumberInput value={form.maxGames} min={1} max={MAX_GAMES} onChange={(maxGames) => patch({ maxGames })} />
              <small className="field-help">{t('import.maxGamesHelp', { max: MAX_GAMES })}</small>
            </label>
            <div className="field">
              <span>{t('import.color')}</span>
              <div className="seg">
                {(['both', 'white', 'black'] as const).map((c) => (
                  <button key={c} type="button" className={form.colors === c ? 'active' : ''} onClick={() => patch({ colors: c })}>
                    {c === 'both' ? t('common.both') : colorLabel(c)}
                  </button>
                ))}
              </div>
            </div>
            <div className="field full">
              <span>{t('import.speeds')}</span>
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
              <span>{t('import.ratedOnly')}</span>
            </label>
          </div>
          <div className="row">
            <button type="submit" className="btn primary" disabled={!canImport}>
              <Icon name="download" /> {t('import.importBtn')}
            </button>
          </div>
          <p className="muted small">{t('import.privacy', { moves: MAX_STORED_PLIES / 2 })}</p>
        </form>

        <div className="stack import-side">
          {running && (
            <div className="panel">
              <div className="panel-head">
                <h3>{t('import.inProgress')}</h3>
                <span className="grow" />
                <button type="button" className="btn small danger" onClick={() => running.ctrl.abort()}>
                  {t('import.cancel')}
                </button>
              </div>
              <p className="small">{running.progress.message}</p>
              <div className="progress">
                <div style={{ width: `${ratio * 100}%` }} />
              </div>
              <p className="muted small">
                {t('import.progressKept', {
                  user: running.options.username,
                  site: SITE_LABEL[running.options.site],
                  count: running.progress.kept,
                  max: running.options.maxGames,
                })}
              </p>
            </div>
          )}

          {!running && job.error && <div className="feedback bad">{msg(job.error)}</div>}

          {!running && lastSource && summary && (
            <div className="panel">
              <div className="panel-head">
                <h3>{t('import.done')}</h3>
              </div>
              <p>
                {rich(
                  lastSource.games.length > 0
                    ? t('import.summaryRange', {
                        games: t('common.games', { count: lastSource.games.length }),
                        site: SITE_LABEL[lastSource.site],
                        first: formatDate(summary.first),
                        last: formatDate(summary.last),
                      })
                    : t('import.summary', {
                        games: t('common.games', { count: lastSource.games.length }),
                        site: SITE_LABEL[lastSource.site],
                      }),
                  { user: <b>{lastSource.username}</b> },
                )}
              </p>
              {COLORS.map((c) => {
                const s = summary.stats[c];
                return (
                  <div key={c} className="import-color">
                    <div className="row">
                      <b>{colorLabel(c)}</b>
                      <span className="muted small">{t('common.games', { count: s.n })}</span>
                      <span className="grow" />
                      {s.n > 0 && <span className="small">{t('import.score', { score: pct(scoreOf(s)) })}</span>}
                    </div>
                    <Wdl s={s} />
                  </div>
                );
              })}
            </div>
          )}

          <div className="panel">
            <div className="panel-head">
              <h3>{t('import.accounts')}</h3>
            </div>
            {state.sources.length === 0 ? (
              <p className="muted small">{t('import.noAccounts')}</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('import.colAccount')}</th>
                    <th>{t('import.colGames')}</th>
                    <th>{t('import.colImported')}</th>
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
                            title={t('import.reimport')}
                            aria-label={t('import.reimport')}
                            disabled={!!running}
                            onClick={() => reimport(s.options)}
                          >
                            <Icon name="reset" size={15} />
                          </button>
                          <button
                            type="button"
                            className="icon-btn small"
                            title={t('import.deleteGames')}
                            aria-label={t('import.deleteGames')}
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
          <h3>{t('import.generate')}</h3>
        </div>
        {!hasGames || !preview ? (
          <p className="muted">{t('import.generateEmpty')}</p>
        ) : (
          <>
            <p className="muted small">
              {t('import.generateHelp', { games: t('common.games', { count: preview.games }), filter: filterLabel })}
            </p>
            <div className="gen-options">
              <label className="field">
                <span>{t('import.depth')}</span>
                <NumberInput
                  value={Math.round(gen.opts.maxPly / 2)}
                  min={1}
                  max={20}
                  onChange={(n) => patchOpts({ maxPly: n * 2 })}
                />
                <small className="field-help">{t('import.depthHelp')}</small>
              </label>
              <label className="field">
                <span>{t('import.minGamesMine')}</span>
                <NumberInput value={gen.opts.minGamesMine} min={1} max={100} onChange={(minGamesMine) => patchOpts({ minGamesMine })} />
                <small className="field-help">{t('import.minGamesMineHelp')}</small>
              </label>
              <label className="field">
                <span>{t('import.minShareMine')}</span>
                <NumberInput
                  value={Math.round(gen.opts.minShareMine * 100)}
                  min={0}
                  max={100}
                  step={5}
                  onChange={(n) => patchOpts({ minShareMine: n / 100 })}
                />
                <small className="field-help">{t('import.minShareMineHelp')}</small>
              </label>
              <label className="field">
                <span>{t('import.minGamesOpp')}</span>
                <NumberInput value={gen.opts.minGamesOpp} min={1} max={100} onChange={(minGamesOpp) => patchOpts({ minGamesOpp })} />
                <small className="field-help">{t('import.minGamesOppHelp')}</small>
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
                    {c === 'both' ? t('import.bothColors') : colorLabel(c)}
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
                    {m === 'merge' ? t('import.modeMerge') : t('import.modeReplace')}
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
                      <span className="muted small">{t('common.games', { count: p.games })}</span>
                    </div>
                    {p.stats.moves === 0 ? (
                      <p className="muted small">{t('import.noMovesColor')}</p>
                    ) : (
                      <>
                        <p className="small">
                          {t('import.previewStats', {
                            moves: t('common.moves', { count: p.stats.moves }),
                            positions: t('common.positions', { count: p.stats.cards }),
                            lines: t('import.lineEnds', { count: p.stats.lines }),
                          })}
                        </p>
                        <p className="muted small">
                          {gen.mode === 'merge'
                            ? p.added
                              ? t('import.mergeAdds', { count: p.added, current: t('common.moves', { count: p.current }) })
                              : t('import.mergeNothing')
                            : p.current
                              ? t('import.replaceCurrent', { moves: t('common.moves', { count: p.current }) })
                              : t('import.repEmpty')}
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
                <Icon name="book" /> {gen.mode === 'merge' ? t('import.applyMerge') : t('import.applyReplace')}
              </button>
              {applied && (
                <>
                  <span className="success small">{t('import.applied')}</span>
                  <span className="grow" />
                  <button type="button" className="btn small" onClick={() => setView('repertoire')}>
                    {t('import.viewRep')}
                  </button>
                  <button type="button" className="btn small" onClick={() => setView('explorer')}>
                    {t('import.explore')}
                  </button>
                  <button type="button" className="btn small" onClick={() => setView('analysis')}>
                    {t('import.findWeaknesses')}
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
