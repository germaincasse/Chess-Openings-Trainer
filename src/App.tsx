import { useEffect, useMemo } from 'react';
import { AppearanceMenu } from './components/AppearanceMenu';
import { LangSwitch } from './components/LangSwitch';
import { applyAppearance } from './theme/themes';
import { useT, type TKey } from './i18n';
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

const TABS: View[] = ['explorer', 'repertoire', 'training', 'import', 'analysis', 'data'];

export function App() {
  const t = useT();
  const s = useStore();

  useEffect(() => {
    Promise.all([loadOpenings(), loadState()]).then(() => requestPersistence());
  }, []);

  useEffect(() => {
    applyAppearance(s.settings.boardTheme, s.settings.pieceSet);
  }, [s.settings.boardTheme, s.settings.pieceSet]);

  const due = useMemo(
    () => (s.loaded ? repStats(s.reps.white).due + repStats(s.reps.black).due : 0),
    [s.loaded, s.reps, s.repsRev],
  );

  if (!s.loaded) return <div className="loading-screen">{t('common.loading')}</div>;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          Chess <span>Openings</span> Trainer
        </div>
        <nav className="nav">
          {TABS.map((id) => (
            <button key={id} className={s.view === id ? 'active' : ''} onClick={() => setView(id)}>
              {t(`common.nav.${id}` as TKey)}
              {id === 'training' && due > 0 && <span className="badge">{due}</span>}
              {id === 'analysis' && !!s.report?.items.length && <span className="badge">{s.report.items.length}</span>}
            </button>
          ))}
        </nav>
        <div className="topbar-tools">
          <AppearanceMenu />
          <LangSwitch />
        </div>
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
