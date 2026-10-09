import { useEffect, useMemo } from 'react';
import { requestPersistence } from './store/db';
import { loadState, setView, useStore, type View } from './store/store';
import { loadOpenings } from './lib/openings';
import { repStats } from './repertoire/model';
import { AnalysisView } from './views/AnalysisView';
import { DataView } from './views/DataView';
import { ExplorerView } from './views/ExplorerView';
import { ImportView } from './views/ImportView';
import { RepertoireView } from './views/RepertoireView';
import { TrainingView } from './views/TrainingView';

const TABS: { id: View; label: string }[] = [
  { id: 'explorer', label: 'Explorateur' },
  { id: 'repertoire', label: 'Répertoire' },
  { id: 'training', label: 'Entraînement' },
  { id: 'import', label: 'Import' },
  { id: 'analysis', label: 'Analyse' },
  { id: 'data', label: 'Données' },
];

export function App() {
  const s = useStore();

  useEffect(() => {
    Promise.all([loadOpenings(), loadState()]).then(() => requestPersistence());
  }, []);

  const due = useMemo(
    () => (s.loaded ? repStats(s.reps.white).due + repStats(s.reps.black).due : 0),
    [s.loaded, s.reps, s.repsRev],
  );

  if (!s.loaded) return <div className="loading-screen">Chargement…</div>;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          Chess <span>Openings</span> Trainer
        </div>
        <nav className="nav">
          {TABS.map((t) => (
            <button key={t.id} className={s.view === t.id ? 'active' : ''} onClick={() => setView(t.id)}>
              {t.label}
              {t.id === 'training' && due > 0 && <span className="badge">{due}</span>}
              {t.id === 'analysis' && !!s.report?.items.length && <span className="badge">{s.report.items.length}</span>}
            </button>
          ))}
        </nav>
      </header>
      <main className="main">
        {s.view === 'explorer' && <ExplorerView />}
        {s.view === 'repertoire' && <RepertoireView />}
        {s.view === 'training' && <TrainingView />}
        {s.view === 'import' && <ImportView />}
        {s.view === 'analysis' && <AnalysisView />}
        {s.view === 'data' && <DataView />}
      </main>
      {s.toast && <div className={`toast ${s.toast.kind}`}>{s.toast.text}</div>}
    </div>
  );
}
