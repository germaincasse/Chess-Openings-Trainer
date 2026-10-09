import { useMemo, useState } from 'react';
import { applyFix, isFixed, planFix } from '../analysis/fix';
import { cancelAnalysis, loadAnalysisOptions, runAnalysis, saveAnalysisOptions, useAnalysisTask } from '../analysis/runner';
import {
  DEFAULT_WEAKNESS,
  describeWeakness,
  kindLabel,
  levelLabel,
  type Weakness,
  type WeaknessKind,
  type WeaknessLevel,
  type WeaknessOptions,
  type WeaknessReport,
} from '../analysis/weaknesses';
import { Icon } from '../components/Icon';
import { Wdl } from '../components/Wdl';
import { addResult, emptyStats, filterGames, openingUsage, scoreOf, type Stats } from '../games/tree';
import { SPEEDS, speedLabel, type Speed } from '../games/types';
import { locale, t, useLang, useT, type TKey } from '../i18n';
import { colorLabel, formatLine, pliesFromUcis, type Color } from '../lib/chess';
import { formatDate, pct } from '../lib/util';
import { reachable } from '../repertoire/model';
import {
  allGames,
  dismissWeakness,
  getState,
  openInExplorer,
  repsChanged,
  setReport,
  setSettings,
  setView,
  startTraining,
  toast,
  useStore,
} from '../store/store';
import { isMistake, trainMistake } from '../training/mistakes';
import '../styles/analysis.css';

const COLORS: Color[] = ['white', 'black'];
const KINDS: WeaknessKind[] = ['engine', 'results', 'consistency', 'gap'];
const LEVEL_TAG: Record<WeaknessLevel, string> = { inaccuracy: 'yellow', mistake: 'red', blunder: 'red' };
const SENSITIVITY: { value: number; label: TKey }[] = [
  { value: 4, label: 'analysis.sensHigh' },
  { value: 6, label: 'analysis.sensNormal' },
  { value: 10, label: 'analysis.sensLow' },
];
const USAGE_PAGE = 25;
const REPORT_PAGE = 20;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

// ---------- repertoire fix ----------

function fixRepertoire(w: Weakness) {
  const rep = getState().reps[w.color];
  const plan = planFix(rep, w);
  if (!plan) {
    toast(t('analysis.fixInvalid'), 'error');
    return;
  }
  const color = colorLabel(w.color);
  const best = plan.best.san;
  const played = plan.playedSan;
  const parts = [played ? t('analysis.fixReplace', { played, best, color }) : t('analysis.fixAdd', { best, color })];
  if (played) {
    parts.push(
      plan.removes > 0
        ? t('analysis.fixRemovesTree', { played, positions: t('common.positions', { count: plan.removes }) })
        : t('analysis.fixRemoves', { played }),
    );
  }
  if (plan.addsPath && w.path.length) {
    parts.push(t('analysis.fixAddsPath', { line: formatLine(pliesFromUcis(w.path).map((p) => p.san)) }));
  }
  if (plan.continuation.length) {
    // The continuation starts right after the corrected move.
    const line = formatLine(plan.continuation.map((p) => p.san), w.path.length + 1);
    parts.push(t('analysis.fixContinuation', { line, best }));
  }
  if (!confirm(parts.join('\n\n'))) return;
  applyFix(rep, w, plan);
  repsChanged();
  toast(t('analysis.fixDone', { best, color }));
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
  const t = useT();
  const sans = useMemo(() => pliesFromUcis(w.path).map((p) => p.san), [w.path]);
  const line = sans.length ? formatLine(sans) : t('common.startPosition');
  const { title, detail } = describeWeakness(w);
  return (
    <div className={`weak-card kind-${w.kind}`}>
      <div className="row">
        <span className={`tag side-${w.color}`}>{colorLabel(w.color)}</span>
        {w.level && <span className={`tag ${LEVEL_TAG[w.level]}`}>{levelLabel(w.level)}</span>}
        {showKind && <span className="tag blue">{kindLabel(w.kind)}</span>}
        {fixed && <span className="tag green">{t('analysis.fixed')}</span>}
        <span className="grow" />
        <span className="muted small">{t('common.games', { count: w.games })}</span>
      </div>
      <div className="weak-title">{title}</div>
      <p className="small">{detail}</p>
      <div className="weak-line" title={t('analysis.lineTitle')}>
        {line}
      </div>
      <div className="weak-actions">
        <button type="button" className="btn small" onClick={() => openInExplorer(w.path, w.color, w.arrows)}>
          <Icon name="eye" size={15} /> {t('analysis.view')}
        </button>
        <button
          type="button"
          className="btn small"
          disabled={!inRep && !isMistake(w)}
          title={inRep || isMistake(w) ? undefined : t('analysis.notInRep')}
          onClick={() => (isMistake(w) ? trainMistake(w) : startTraining(w.path, w.color))}
        >
          <Icon name="target" size={15} /> {t('analysis.train')}
        </button>
        {w.kind === 'engine' && w.best && (
          <button type="button" className="btn small" disabled={fixed} onClick={() => fixRepertoire(w)}>
            <Icon name="book" size={15} /> {t('analysis.fix')}
          </button>
        )}
        <span className="grow" />
        <button type="button" className="btn small ghost" title={t('analysis.dismissTitle')} onClick={() => dismissWeakness(w.id)}>
          <Icon name="x" size={15} /> {t('analysis.dismiss')}
        </button>
      </div>
    </div>
  );
}

function ReportPanel({ report, currentGames }: { report: WeaknessReport; currentGames: number | null }) {
  const t = useT();
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
  const time = date.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  const o = report.options;

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>{t('analysis.report')}</h3>
        <span className="grow" />
        <button
          type="button"
          className="btn small ghost"
          onClick={() => confirm(t('analysis.clearConfirm')) && setReport(null)}
        >
          {t('analysis.clear')}
        </button>
      </div>
      <p className="muted small">
        {t('analysis.reportMeta', {
          date: formatDate(report.generatedAt),
          time,
          games: t('common.games', { count: report.games }),
          engine: o.useEngine
            ? t('analysis.reportEngine', { depth: o.depth, positions: t('common.positions', { count: o.maxPositions }) })
            : t('analysis.reportNoEngine'),
        })}
      </p>
      {currentGames !== null && currentGames !== report.games && (
        <div className="feedback info small">{t('analysis.stale', { games: t('common.games', { count: currentGames }) })}</div>
      )}

      <div className="weak-filters">
        <div className="seg">
          <button type="button" className={kind === 'all' ? 'active' : ''} onClick={() => { setKind('all'); setLimit(REPORT_PAGE); }}>
            {t('analysis.all', { n: bySide.length })}
          </button>
          {KINDS.map((k) => (
            <button key={k} type="button" className={kind === k ? 'active' : ''} onClick={() => { setKind(k); setLimit(REPORT_PAGE); }}>
              {kindLabel(k)} ({countKind(k)})
            </button>
          ))}
        </div>
        <div className="seg">
          <button type="button" className={side === 'both' ? 'active' : ''} onClick={() => { setSide('both'); setLimit(REPORT_PAGE); }}>
            {t('common.both')}
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
          {report.items.length === 0 ? t('analysis.noneFound') : t('analysis.noneInCategory')}
        </div>
      ) : (
        <div className="weak-list">
          {items.slice(0, limit).map((w) => (
            <WeaknessCard
              key={w.id}
              w={w}
              inRep={reach[w.color].has(w.key)}
              fixed={w.kind === 'engine' && isFixed(state.reps[w.color], w)}
              showKind={kind === 'all'}
            />
          ))}
          {items.length > limit && (
            <button type="button" className="btn ghost" onClick={() => setLimit((l) => l + REPORT_PAGE)}>
              {t('analysis.moreWeak', { count: items.length - limit })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- view ----------

export function AnalysisView() {
  const t = useT();
  const lang = useLang();
  const state = useStore();
  const job = useAnalysisTask();
  const [color, setColor] = useState<Color>(state.settings.side);
  const [byFamily, setByFamily] = useState(false);
  const [usageLimit, setUsageLimit] = useState(USAGE_PAGE);
  const [opts, setOpts] = useState(loadAnalysisOptions);

  const speedsSig = state.settings.speeds ? state.settings.speeds.join(',') : '*';
  const all = useMemo(() => allGames(), [state.gamesRev, state.sources]);
  const speedCounts = useMemo(() => {
    const counts = new Map<Speed, number>();
    for (const g of all) counts.set(g.speed, (counts.get(g.speed) ?? 0) + 1);
    return SPEEDS.filter((s) => counts.has(s.id)).map((s) => ({ id: s.id, count: counts.get(s.id)! }));
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
  // The language is a dependency because opening names can be translated.
  const rows = useMemo(() => openingUsage(games, color, byFamily), [games, color, byFamily, lang]);

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
      saveAnalysisOptions(next);
      return next;
    });

  const running = job.running;
  const progress = running?.progress;
  const report = state.report;

  if (!all.length) {
    return (
      <div className="page analysis-page">
        <div className="page-head">
          <h2>{t('analysis.title')}</h2>
        </div>
        <div className="panel">
          <div className="empty-state">
            <p>{t('analysis.noGames')}</p>
            <button type="button" className="btn primary" onClick={() => setView('import')}>
              <Icon name="download" /> {t('analysis.importGames')}
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
        <h2>{t('analysis.title')}</h2>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>{t('analysis.speeds')}</h3>
        </div>
        <div className="checks">
          {speedCounts.map((s) => (
            <label key={s.id} className="check-chip">
              <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleSpeed(s.id)} />
              {speedLabel(s.id)} <span className="muted">{s.count}</span>
            </label>
          ))}
        </div>
        <p className="muted small">{t('analysis.speedsHelp')}</p>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>{t('analysis.openings')}</h3>
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
            <span>{t('analysis.byFamily')}</span>
          </label>
          <span className="grow" />
          {total.n > 0 && (
            <div className="usage-total">
              <span className="small">
                {t('analysis.totalScore', { games: t('common.games', { count: total.n }), score: pct(scoreOf(total)) })}
              </span>
              <Wdl s={total} />
            </div>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="empty-state">{t('analysis.noGamesColor', { color: colorLabel(color) })}</div>
        ) : (
          <>
            <table className="table usage-table">
              <thead>
                <tr>
                  <th>{t('analysis.colOpening')}</th>
                  <th className="num">{t('analysis.colGames')}</th>
                  <th className="num">{t('analysis.colScore')}</th>
                  <th className="wdl-col">{t('analysis.colResults')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, usageLimit).map((r) => {
                  const s = scoreOf(r);
                  return (
                    <tr key={r.name} className="clickable" title={t('analysis.openInExplorer')} onClick={() => openInExplorer(r.ucis, color)}>
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
                {t('analysis.moreOpenings', { count: rows.length - usageLimit })}
              </button>
            )}
          </>
        )}
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>{t('analysis.weaknesses')}</h3>
        </div>
        <p className="muted small">{t('analysis.weaknessesHelp')}</p>
        <div className="analysis-options">
          <label className="field">
            <span>{t('analysis.minGames')}</span>
            <NumberInput value={opts.minGames} min={1} max={100} disabled={!!running} onChange={(minGames) => patchOpts({ minGames })} />
            <small className="field-help">{t('analysis.minGamesHelp')}</small>
          </label>
          <label className="field">
            <span>{t('analysis.maxPly')}</span>
            <NumberInput
              value={Math.round(opts.maxPly / 2)}
              min={1}
              max={20}
              disabled={!!running}
              onChange={(n) => patchOpts({ maxPly: n * 2 })}
            />
            <small className="field-help">{t('analysis.maxPlyHelp')}</small>
          </label>
          <div className="field">
            <span>{t('analysis.engine')}</span>
            <label className="switch">
              <input
                type="checkbox"
                checked={opts.useEngine}
                disabled={!!running}
                onChange={(e) => patchOpts({ useEngine: e.target.checked })}
              />
              <span>{opts.useEngine ? t('analysis.engineOn') : t('analysis.engineOff')}</span>
            </label>
            <small className="field-help">{t('analysis.engineHelp')}</small>
          </div>
          <label className="field">
            <span>{t('analysis.depth')}</span>
            <select
              value={opts.depth}
              disabled={!opts.useEngine || !!running}
              onChange={(e) => patchOpts({ depth: Number(e.target.value) })}
            >
              {Array.from({ length: 11 }, (_, i) => 10 + i).map((d) => (
                <option key={d} value={d}>
                  {d === DEFAULT_WEAKNESS.depth ? t('analysis.depthRecommended', { depth: d }) : d}
                </option>
              ))}
            </select>
            <small className="field-help">{t('analysis.depthHelp')}</small>
          </label>
          <label className="field">
            <span>{t('analysis.maxPositions')}</span>
            <NumberInput
              value={opts.maxPositions}
              min={1}
              max={300}
              disabled={!opts.useEngine || !!running}
              onChange={(maxPositions) => patchOpts({ maxPositions })}
            />
            <small className="field-help">{t('analysis.maxPositionsHelp')}</small>
          </label>
          <div className="field">
            <span>{t('analysis.sensitivity')}</span>
            <div className="seg">
              {SENSITIVITY.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  className={opts.minWinLoss === s.value ? 'active' : ''}
                  disabled={!opts.useEngine || !!running}
                  title={t('analysis.sensTitle', { value: s.value })}
                  onClick={() => patchOpts({ minWinLoss: s.value })}
                >
                  {t(s.label)} ({s.value})
                </button>
              ))}
            </div>
            <small className="field-help">{t('analysis.sensHelp')}</small>
          </div>
        </div>

        {running && progress ? (
          <div className="analysis-progress">
            <div className="row">
              <span className="small">{progress.message}</span>
              <span className="grow" />
              {progress.total > 0 && (
                <span className="muted small">
                  {progress.done} / {t('common.positions', { count: progress.total })}
                </span>
              )}
              <button type="button" className="btn small danger" onClick={cancelAnalysis}>
                {t('analysis.cancel')}
              </button>
            </div>
            <div className={`progress${progress.total ? '' : ' indeterminate'}`}>
              <div style={progress.total ? { width: `${(progress.done / progress.total) * 100}%` } : undefined} />
            </div>
            {opts.useEngine && <p className="muted small">{t('analysis.runningHelp')}</p>}
          </div>
        ) : (
          <div className="row">
            <button type="button" className="btn primary" disabled={!games.length} onClick={() => runAnalysis(opts)}>
              <Icon name="target" /> {t('analysis.run')}
            </button>
            {!games.length && <span className="muted small">{t('analysis.noGamesSpeeds')}</span>}
          </div>
        )}
        {job.error && !running && <div className="feedback bad">{job.error}</div>}
      </div>

      {report ? (
        <ReportPanel report={report} currentGames={games.length} />
      ) : (
        !running && (
          <div className="panel">
            <div className="empty-state">{t('analysis.noReport')}</div>
          </div>
        )
      )}
    </div>
  );
}
