import { useCallback, useEffect, useMemo } from 'react';
import { Board, type BoardArrow } from '../components/Board';
import { EngineLines } from '../components/EngineLines';
import { EvalBar } from '../components/EvalBar';
import { GamesPanel } from '../components/GamesPanel';
import { Icon } from '../components/Icon';
import { MoveList } from '../components/MoveList';
import { RepPanel } from '../components/RepPanel';
import { moveQuality, requestEvals, stopEvals, useCandidateEvals, type Target } from '../engine/candidates';
import { useAnalysis } from '../engine/useAnalysis';
import { useT } from '../i18n';
import { colorLabel, formatLine, plyFrom, START_FEN, START_KEY, type Color } from '../lib/chess';
import { openingForKeys } from '../lib/openings';
import { playMoveSound } from '../lib/sound';
import { addLine, hasMove, repMoves } from '../repertoire/model';
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

/** Typing in a text field must not move through the game. */
function isTextField(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable) return true;
  return el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'range', 'submit'].includes((el as HTMLInputElement).type);
}

export function ExplorerView() {
  const t = useT();
  const s = useStore();
  const { settings } = s;
  const { plies, cursor, orientation, highlight } = s.explorer;
  const fen = explorerFen(s.explorer);
  const key = explorerKey(s.explorer);
  const side = settings.side;
  const rep = s.reps[side];
  const { trees, games } = useMemo(getTrees, [s.gamesRev, settings.speeds]);
  const tree = trees[side];
  const { result, error } = useAnalysis(fen, settings.engineOn, settings.multiPv, settings.depth);
  const evalsVersion = useCandidateEvals();
  const showEval = settings.engineOn;

  const keyBefore = useCallback((i: number) => (i === 0 ? START_KEY : plies[i - 1].key), [plies]);
  const opening = useMemo(
    () => openingForKeys([START_KEY, ...plies.slice(0, cursor).map((p) => p.key)]),
    [plies, cursor],
  );

  // Second engine: quality of the candidate moves here (repertoire, your games), then of the line's moves.
  useEffect(() => {
    if (!settings.engineOn) {
      stopEvals();
      return;
    }
    const here = new Set<string>(repMoves(rep, key).map((m) => m.uci));
    for (const m of tree.nodes.get(key)?.moves.slice(0, 8) ?? []) here.add(m.uci);
    if (plies[cursor]) here.add(plies[cursor].uci);
    const targets: Target[] = [{ key, fen, moves: [...here] }];
    const order = plies.map((_, i) => i).sort((a, b) => Math.abs(a - cursor) - Math.abs(b - cursor));
    for (const i of order) targets.push({ key: keyBefore(i), fen: i ? plies[i - 1].fen : START_FEN, moves: [plies[i].uci] });
    requestEvals(targets);
  }, [settings.engineOn, key, fen, plies, cursor, rep, tree, keyBefore, s.repsRev]);

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
    toast(added ? t('explorer.added', { count: added, color: colorLabel(side) }) : t('explorer.alreadyIn'));
  };

  // chess.com shortcuts: left / right through the moves, up to the start, down to the end, X (or F) to flip.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTextField(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      const ex = s.explorer;
      if (e.key === 'ArrowLeft') explorerGo(ex.cursor - 1);
      else if (e.key === 'ArrowRight') explorerGo(ex.cursor + 1);
      else if (e.key === 'ArrowUp' || e.key === 'Home') explorerGo(0);
      else if (e.key === 'ArrowDown' || e.key === 'End') explorerGo(ex.plies.length);
      else if (e.key === 'x' || e.key === 'X' || e.key === 'f' || e.key === 'F') explorerFlip();
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

  const quality = useCallback(
    (i: number) => (showEval ? moveQuality(keyBefore(i), plies[i].uci) : undefined),
    // evalsVersion: new evaluations arrived.
    [showEval, keyBefore, plies, evalsVersion],
  );

  const lastPly = cursor ? plies[cursor - 1] : undefined;

  return (
    <div className="board-layout explorer">
      <div className="board-col">
        <div className="board-row">
          {settings.engineOn && <EvalBar line={result?.fen === fen ? result.lines[0] : undefined} orientation={orientation} />}
          <Board fen={fen} orientation={orientation} lastMove={lastPly?.uci} movable="both" onMove={play} arrows={arrows} />
        </div>
        <div className="nav-buttons">
          <button className="icon-btn" title={t('explorer.navStart')} onClick={() => explorerGo(0)} disabled={!cursor}>
            <Icon name="first" />
          </button>
          <button className="icon-btn" title={t('explorer.navPrev')} onClick={() => explorerGo(cursor - 1)} disabled={!cursor}>
            <Icon name="prev" />
          </button>
          <button className="icon-btn" title={t('explorer.navNext')} onClick={() => explorerGo(cursor + 1)} disabled={cursor >= plies.length}>
            <Icon name="next" />
          </button>
          <button className="icon-btn" title={t('explorer.navEnd')} onClick={() => explorerGo(plies.length)} disabled={cursor >= plies.length}>
            <Icon name="last" />
          </button>
          <button className="icon-btn" title={t('explorer.flip')} onClick={explorerFlip}>
            <Icon name="flip" />
          </button>
        </div>
      </div>

      <div className="side-col">
        <section className="panel">
          <div className="row">
            <div className="seg" title={t('explorer.sideTitle')}>
              {(['white', 'black'] as Color[]).map((c) => (
                <button key={c} className={side === c ? 'active' : ''} onClick={() => setSide(c)}>
                  {colorLabel(c)}
                </button>
              ))}
            </div>
            <label className="switch" title={t('explorer.editModeTitle')}>
              <input type="checkbox" checked={settings.autoAdd} onChange={(e) => setSettings({ autoAdd: e.target.checked })} />
              <span>{t('explorer.editMode')}</span>
            </label>
            <span className="grow" />
            <button
              className="icon-btn"
              title={t('explorer.copyLine')}
              onClick={() => navigator.clipboard?.writeText(formatLine(plies.slice(0, cursor).map((p) => p.san)))}
              disabled={!cursor}
            >
              <Icon name="copy" />
            </button>
            <button className="icon-btn" title={t('explorer.trainHere')} onClick={() => startTraining(plies.slice(0, cursor).map((p) => p.uci), side)}>
              <Icon name="target" />
            </button>
            <button className="icon-btn" title={t('explorer.reset')} onClick={explorerReset} disabled={!plies.length}>
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
              <span className="muted">{cursor ? t('common.unknownOpening') : t('common.startPosition')}</span>
            )}
          </div>
          <MoveList
            plies={plies}
            cursor={cursor}
            onGo={explorerGo}
            inRep={(i) => hasMove(rep, keyBefore(i), plies[i].uci)}
            quality={quality}
          />
        </section>

        <EngineLines fen={fen} result={result} error={error} onPlay={play} />
        <RepPanel rep={rep} posKey={key} onPlay={play} onAddLine={addCurrentLine} canAddLine={cursor > 0} tree={tree} showEval={showEval} />
        <GamesPanel tree={tree} totalGames={games} posKey={key} rep={rep} onPlay={play} showEval={showEval} />
      </div>
    </div>
  );
}
