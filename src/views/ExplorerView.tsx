import { useCallback, useEffect, useMemo } from 'react';
import { Board, type BoardArrow } from '../components/Board';
import { EngineLines } from '../components/EngineLines';
import { EvalBar } from '../components/EvalBar';
import { GamesPanel } from '../components/GamesPanel';
import { Icon } from '../components/Icon';
import { MoveList } from '../components/MoveList';
import { RepPanel } from '../components/RepPanel';
import { useAnalysis } from '../engine/useAnalysis';
import { formatLine, plyFrom, START_KEY, type Color } from '../lib/chess';
import { openingForKeys } from '../lib/openings';
import { playMoveSound } from '../lib/sound';
import { addLine, hasMove } from '../repertoire/model';
import {
  explorerFen,
  explorerFlip,
  explorerGo,
  explorerKey,
  explorerPlay,
  explorerReset,
  getTrees,
  repsChanged,
  setSettings,
  setSide,
  startTraining,
  toast,
  useStore,
} from '../store/store';

export function ExplorerView() {
  const s = useStore();
  const { settings } = s;
  const { plies, cursor, orientation, highlight } = s.explorer;
  const fen = explorerFen(s.explorer);
  const key = explorerKey(s.explorer);
  const side = settings.side;
  const rep = s.reps[side];
  const { trees, games } = useMemo(getTrees, [s.gamesRev, settings.speeds]);
  const { result, error } = useAnalysis(fen, settings.engineOn, settings.multiPv, settings.depth);

  const keyBefore = useCallback((i: number) => (i === 0 ? START_KEY : plies[i - 1].key), [plies]);
  const opening = useMemo(
    () => openingForKeys([START_KEY, ...plies.slice(0, cursor).map((p) => p.key)]),
    [plies, cursor],
  );

  const play = useCallback(
    (uci: string) => {
      const ply = plyFrom(fen, uci);
      if (!ply) return;
      if (settings.sound) playMoveSound(ply.san.includes('x') ? 'capture' : 'move');
      explorerPlay(ply);
    },
    [fen, settings.sound],
  );

  const addCurrentLine = () => {
    const added = addLine(rep, plies.slice(0, cursor), 'manual');
    repsChanged();
    toast(added ? `${added} coup${added > 1 ? 's' : ''} ajouté${added > 1 ? 's' : ''} au répertoire ${side === 'white' ? 'Blancs' : 'Noirs'}` : 'Cette ligne est déjà dans le répertoire');
  };

  // Keyboard navigation like chess.com: arrows to move through the line, F to flip.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return;
      const e2 = s.explorer;
      if (e.key === 'ArrowLeft') explorerGo(e2.cursor - 1);
      else if (e.key === 'ArrowRight') explorerGo(e2.cursor + 1);
      else if (e.key === 'ArrowUp' || e.key === 'Home') explorerGo(0);
      else if (e.key === 'ArrowDown' || e.key === 'End') explorerGo(e2.plies.length);
      else if (e.key === 'f') explorerFlip();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [s.explorer]);

  const arrows = useMemo(() => {
    const out: BoardArrow[] = [];
    if (cursor === plies.length) out.push(...highlight);
    if (settings.repArrows) {
      for (const m of rep.nodes[key]?.moves ?? []) {
        if (!out.some((a) => a.uci === m.uci)) out.push({ uci: m.uci, brush: 'green', width: 8 });
      }
    }
    if (settings.engineOn && settings.engineArrows && result?.fen === fen) {
      result.lines.filter(Boolean).forEach((l, i) => {
        const uci = l.pv[0];
        if (uci && !out.some((a) => a.uci === uci)) out.push({ uci, brush: i === 0 ? 'blue' : 'paleBlue', width: i === 0 ? 10 : 6 });
      });
    }
    return out;
    // repsRev: the repertoire is mutated in place.
  }, [cursor, plies.length, highlight, settings, rep, key, result, fen, s.repsRev]);

  const lastPly = cursor ? plies[cursor - 1] : undefined;

  return (
    <div className="board-layout explorer">
      <div className="board-col">
        <div className="board-row">
          {settings.engineOn && <EvalBar line={result?.fen === fen ? result.lines[0] : undefined} orientation={orientation} />}
          <Board fen={fen} orientation={orientation} lastMove={lastPly?.uci} movable="both" onMove={play} arrows={arrows} />
        </div>
        <div className="nav-buttons">
          <button className="icon-btn" title="Début (flèche haut)" onClick={() => explorerGo(0)} disabled={!cursor}>
            <Icon name="first" />
          </button>
          <button className="icon-btn" title="Coup précédent (flèche gauche)" onClick={() => explorerGo(cursor - 1)} disabled={!cursor}>
            <Icon name="prev" />
          </button>
          <button className="icon-btn" title="Coup suivant (flèche droite)" onClick={() => explorerGo(cursor + 1)} disabled={cursor >= plies.length}>
            <Icon name="next" />
          </button>
          <button className="icon-btn" title="Fin (flèche bas)" onClick={() => explorerGo(plies.length)} disabled={cursor >= plies.length}>
            <Icon name="last" />
          </button>
          <button className="icon-btn" title="Retourner l'échiquier (F)" onClick={explorerFlip}>
            <Icon name="flip" />
          </button>
        </div>
      </div>

      <div className="side-col">
        <section className="panel">
          <div className="row">
            <div className="seg" title="Répertoire édité et statistiques affichées">
              {(['white', 'black'] as Color[]).map((c) => (
                <button key={c} className={side === c ? 'active' : ''} onClick={() => setSide(c)}>
                  {c === 'white' ? 'Blancs' : 'Noirs'}
                </button>
              ))}
            </div>
            <label className="switch" title="Chaque coup joué sur l'échiquier est ajouté au répertoire">
              <input type="checkbox" checked={settings.autoAdd} onChange={(e) => setSettings({ autoAdd: e.target.checked })} />
              <span>Mode édition</span>
            </label>
            <span className="grow" />
            <button className="icon-btn" title="Copier la ligne (PGN)" onClick={() => navigator.clipboard?.writeText(formatLine(plies.slice(0, cursor).map((p) => p.san)))} disabled={!cursor}>
              <Icon name="copy" />
            </button>
            <button className="icon-btn" title="S'entraîner depuis cette position" onClick={() => startTraining(plies.slice(0, cursor).map((p) => p.uci), side)}>
              <Icon name="target" />
            </button>
            <button className="icon-btn" title="Nouvelle analyse" onClick={explorerReset} disabled={!plies.length}>
              <Icon name="reset" />
            </button>
          </div>
          <div className="opening-name">
            {opening ? (
              <>
                <span className="eco">{opening.eco}</span>
                {opening.name}
              </>
            ) : (
              <span className="muted">{cursor ? 'Ouverture non répertoriée' : 'Position de départ'}</span>
            )}
          </div>
          <MoveList plies={plies} cursor={cursor} onGo={explorerGo} inRep={(i) => hasMove(rep, keyBefore(i), plies[i].uci)} />
        </section>

        <EngineLines fen={fen} result={result} error={error} onPlay={play} />
        <RepPanel rep={rep} posKey={key} onPlay={play} onAddLine={addCurrentLine} canAddLine={cursor > 0} />
        <GamesPanel tree={trees[side]} totalGames={games} posKey={key} rep={rep} onPlay={play} />
      </div>
    </div>
  );
}
