import { useSyncExternalStore } from 'react';
import { t } from '../i18n';
import { START_KEY, type Color } from '../lib/chess';
import { yieldToUi } from '../lib/util';
import { evalStore, getState, getTrees, setReport, toast } from '../store/store';
import { analyzeWeaknesses, DEFAULT_WEAKNESS, type AnalysisProgress, type WeaknessOptions } from './weaknesses';

// Weakness analysis runs at module level so it survives a change of view
// and can be started from the Analysis or the Training view.

export interface AnalysisTask {
  running: { ctrl: AbortController; progress: AnalysisProgress } | null;
  error: string;
}

let task: AnalysisTask = { running: null, error: '' };
const listeners = new Set<() => void>();

function setTask(patch: Partial<AnalysisTask>) {
  task = { ...task, ...patch };
  for (const l of listeners) l();
}

export function useAnalysisTask(): AnalysisTask {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => task,
  );
}

const OPTS_KEY = 'cot.analysis.options';

/** Options last used in the Analysis view. */
export function loadAnalysisOptions(): WeaknessOptions {
  try {
    const raw = localStorage.getItem(OPTS_KEY);
    return { ...DEFAULT_WEAKNESS, ...(raw ? (JSON.parse(raw) as Partial<WeaknessOptions>) : {}) };
  } catch {
    return { ...DEFAULT_WEAKNESS };
  }
}

export function saveAnalysisOptions(opts: WeaknessOptions) {
  try {
    localStorage.setItem(OPTS_KEY, JSON.stringify(opts));
  } catch {
    // Not remembered.
  }
}

export function cancelAnalysis() {
  task.running?.ctrl.abort();
}

export async function runAnalysis(opts: WeaknessOptions = loadAnalysisOptions()) {
  if (task.running) return;
  const { trees, games } = getTrees();
  const colors: Color[] = ['white', 'black'];
  const list = colors.filter((c) => (trees[c].nodes.get(START_KEY)?.n ?? 0) > 0).map((c) => trees[c]);
  if (!list.length) {
    setTask({ error: t('weak.noGames') });
    return;
  }
  const ctrl = new AbortController();
  setTask({ running: { ctrl, progress: { done: 0, total: 0, message: t('weak.searching') } }, error: '' });
  // Lets the progress panel paint before the synchronous first pass.
  await yieldToUi();
  try {
    const onProgress = (progress: AnalysisProgress) => {
      if (task.running) setTask({ running: { ...task.running, progress } });
    };
    const report = await analyzeWeaknesses(list, getState().reps, games, opts, evalStore, onProgress, ctrl.signal);
    if (ctrl.signal.aborted) {
      toast(t('weak.cancelled'));
      return;
    }
    setReport(report);
    toast(report.items.length ? t('weak.done', { count: report.items.length }) : t('weak.doneNone'));
  } catch (e) {
    if (!ctrl.signal.aborted) setTask({ error: (e as Error).message || t('weak.unknownError') });
  } finally {
    setTask({ running: null });
  }
}
