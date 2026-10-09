import type { EngineResult } from '../engine/engine';
import { formatEval } from '../engine/evaluation';
import { formatLine, plyCountOfFen, pvToSan } from '../lib/chess';
import { setSettings, useStore } from '../store/store';

interface Props {
  fen: string;
  result: EngineResult | null;
  error: string | null;
  onPlay: (uci: string) => void;
}

export function EngineLines({ fen, result, error, onPlay }: Props) {
  const { settings } = useStore();
  const lines = result?.fen === fen ? result.lines.filter(Boolean) : [];
  const startPly = plyCountOfFen(fen);

  return (
    <section className="panel">
      <header className="panel-head">
        <label className="switch">
          <input type="checkbox" checked={settings.engineOn} onChange={(e) => setSettings({ engineOn: e.target.checked })} />
          <span>Stockfish</span>
        </label>
        {settings.engineOn && result?.fen === fen && (
          <span className="muted small">
            profondeur {result.depth}/{settings.depth}
            {result.done ? '' : '…'}
          </span>
        )}
        <span className="grow" />
        {settings.engineOn && (
          <select
            className="mini"
            value={settings.multiPv}
            onChange={(e) => setSettings({ multiPv: Number(e.target.value) })}
            title="Nombre de lignes"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n} {n > 1 ? 'lignes' : 'ligne'}
              </option>
            ))}
          </select>
        )}
      </header>
      {error && <p className="error small">{error}</p>}
      {settings.engineOn && !error && (
        <div className="engine-lines">
          {lines.length === 0 && <p className="muted small">Analyse en cours…</p>}
          {lines.map((l) => (
            <button key={l.multipv} className="engine-line" onClick={() => l.pv[0] && onPlay(l.pv[0])} title="Jouer ce coup">
              <span className={`eval-chip ${(l.mate ?? l.cp ?? 0) >= 0 ? 'pos' : 'neg'}`}>{formatEval(l)}</span>
              <span className="pv">{formatLine(pvToSan(fen, l.pv, 12), startPly)}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
