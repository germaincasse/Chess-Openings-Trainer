import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Board, type BoardArrow } from '../components/Board';
import { Icon } from '../components/Icon';
import { MoveList } from '../components/MoveList';
import { colorLabel, formatLine, moveLabel, pliesFromUcis, plyFrom, START_FEN, START_KEY, type Color, type Ply } from '../lib/chess';
import { openingForKeys } from '../lib/openings';
import { playMoveSound } from '../lib/sound';
import { plural } from '../lib/util';
import { isOwnerTurn, repMoves, repStats, type Repertoire } from '../repertoire/model';
import { getState, openInExplorer, repsChanged, setSide, setView, startTraining, useStore } from '../store/store';
import { dueCounter, isDue, pickReply, review, type TrainingMode } from '../training/srs';
import '../styles/training.css';

type Status = 'idle' | 'playing' | 'finished' | 'done' | 'noroot';

interface Feedback {
  kind: 'ok' | 'bad' | 'info';
  text: string;
  notes?: string[];
}

interface Line {
  id: number;
  plies: Ply[];
  status: Status;
  /** Wrong attempts at the current position. */
  wrong: number;
  hint: boolean;
  feedback: Feedback | null;
  /** Browsing cursor once the line is finished (null: end of the line). */
  view: number | null;
  /** The next line starts by itself after this one is finished. */
  auto: boolean;
}

interface SessionStats {
  lines: number;
  positions: number;
  firstTry: number;
  mistakes: number;
}

const OPPONENT_DELAY = 450;
const NEXT_LINE_DELAY = 1200;
const MAX_PLIES = 300;
const EMPTY_STATS: SessionStats = { lines: 0, positions: 0, firstTry: 0, mistakes: 0 };

// Kept across view switches for the whole session.
let sessionMode: TrainingMode = 'review';
let sessionStats: SessionStats = EMPTY_STATS;

const keyAt = (plies: Ply[], n = plies.length) => (n ? plies[n - 1].key : START_KEY);
const fenAt = (plies: Ply[], n = plies.length) => (n ? plies[n - 1].fen : START_FEN);

function sound(kind: Parameters<typeof playMoveSound>[0]) {
  if (getState().settings.sound) playMoveSound(kind);
}

/** A line stops when the position has no follow-up or repeats (transposition loop). */
function lineEnded(rep: Repertoire, plies: Ply[]): boolean {
  const key = keyAt(plies);
  if (!repMoves(rep, key).length || plies.length >= MAX_PLIES) return true;
  return key === START_KEY || plies.slice(0, -1).some((p) => p.key === key);
}

/** Earliest due date of the cards below a position. */
function nextDue(rep: Repertoire, rootKey: string): number | null {
  const seen = new Set([rootKey]);
  const stack = [rootKey];
  let min = Infinity;
  while (stack.length) {
    const key = stack.pop()!;
    const moves = repMoves(rep, key);
    if (!moves.length) continue;
    const card = rep.cards[key];
    if (card && isOwnerTurn(rep, key)) min = Math.min(min, card.due);
    for (const m of moves) {
      if (!seen.has(m.to)) {
        seen.add(m.to);
        stack.push(m.to);
      }
    }
  }
  return min === Infinity ? null : min;
}

function formatDelay(ms: number): string {
  const min = Math.max(1, Math.ceil(ms / 60000));
  if (min < 60) return `${min} min`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} h`;
  return plural(Math.round(hours / 24), 'jour');
}

export function TrainingView() {
  const state = useStore();
  const side = state.settings.side;
  const rep = state.reps[side];
  const [mode, setModeState] = useState<TrainingMode>(sessionMode);
  const [session, setSession] = useState<SessionStats>(sessionStats);

  const rootPlies = useMemo(() => pliesFromUcis(state.trainingRoot), [state.trainingRoot]);
  const rootKey = keyAt(rootPlies);
  // repsRev: cards are updated in place.
  const counts = useMemo(() => repStats(rep), [rep, state.repsRev]);

  const [line, setLineState] = useState<Line>(() => ({
    id: 0,
    plies: rootPlies,
    status: 'idle',
    wrong: 0,
    hint: false,
    feedback: null,
    view: null,
    auto: false,
  }));
  // Handlers and timers read the latest line from here.
  const lineRef = useRef(line);
  const dueRef = useRef<(key: string) => number>(() => 0);
  const graded = useRef(new Set<string>());
  const forced = useRef(new Map<string, string>());

  const setLine = (next: Line) => {
    lineRef.current = next;
    setLineState(next);
  };

  const setMode = (m: TrainingMode) => {
    sessionMode = m;
    setModeState(m);
  };

  const addStats = (d: Partial<SessionStats>) => {
    const s = sessionStats;
    sessionStats = {
      lines: s.lines + (d.lines ?? 0),
      positions: s.positions + (d.positions ?? 0),
      firstTry: s.firstTry + (d.firstTry ?? 0),
      mistakes: s.mistakes + (d.mistakes ?? 0),
    };
    setSession(sessionStats);
  };

  const resetStats = () => {
    sessionStats = EMPTY_STATS;
    setSession(sessionStats);
  };

  /** Starts a new line from the training root; `restart` replays the same opponent replies. */
  const startLine = (restart = false) => {
    const cur = lineRef.current;
    const replies = new Map<string, string>();
    if (restart) {
      cur.plies.forEach((p, i) => {
        const before = keyAt(cur.plies, i);
        if (i >= rootPlies.length && !isOwnerTurn(rep, before)) replies.set(before, p.uci);
      });
    }
    forced.current = replies;
    graded.current = new Set();
    const due = dueCounter(rep);
    dueRef.current = due;
    let status: Status = 'playing';
    if (!repMoves(rep, rootKey).length) status = 'noroot';
    else if (!restart && mode === 'review' && due(rootKey) === 0) status = 'done';
    setLine({ id: cur.id + 1, plies: rootPlies, status, wrong: 0, hint: false, feedback: null, view: null, auto: true });
  };

  const pushPly = (ply: Ply, feedback = lineRef.current.feedback) => {
    const cur = lineRef.current;
    const plies = [...cur.plies, ply];
    const ended = lineEnded(rep, plies);
    if (ended) {
      sound('success');
      addStats({ lines: 1 });
      const comment = rep.nodes[ply.key]?.comment;
      feedback = { kind: 'ok', text: 'Ligne terminée.', notes: comment ? [comment] : undefined };
    } else sound(ply.san.includes('x') ? 'capture' : 'move');
    setLine({ ...cur, plies, status: ended ? 'finished' : 'playing', wrong: 0, hint: false, feedback, view: null, auto: true });
  };

  // New line whenever the repertoire, the mode or the starting position change.
  useEffect(() => {
    startLine();
  }, [rep, mode, rootPlies]);

  // Opponent reply.
  useEffect(() => {
    if (line.status !== 'playing' || isOwnerTurn(rep, keyAt(line.plies))) return;
    const id = line.id;
    const timer = window.setTimeout(() => {
      const cur = lineRef.current;
      if (cur.id !== id || cur.status !== 'playing') return;
      const key = keyAt(cur.plies);
      const moves = repMoves(rep, key);
      if (!moves.length) return;
      const want = forced.current.get(key);
      const reply = moves.find((m) => m.uci === want) ?? pickReply(moves, mode, dueRef.current);
      const ply = plyFrom(fenAt(cur.plies), reply.uci);
      if (ply) pushPly(ply);
      else setLine({ ...cur, status: 'finished', auto: false, feedback: { kind: 'bad', text: `Coup illégal dans le répertoire : ${reply.san}` } });
    }, OPPONENT_DELAY);
    return () => window.clearTimeout(timer);
  }, [line.id, line.plies, line.status, rep, mode]);

  // Next line after a short pause, unless the user is browsing the finished line.
  useEffect(() => {
    if (line.status !== 'finished' || !line.auto) return;
    const timer = window.setTimeout(() => startLine(), NEXT_LINE_DELAY);
    return () => window.clearTimeout(timer);
  }, [line.id, line.status, line.auto]);

  const onUserMove = (uci: string) => {
    const cur = lineRef.current;
    if (cur.status !== 'playing' || cur.view !== null) return;
    const key = keyAt(cur.plies);
    if (!isOwnerTurn(rep, key)) return;
    const ply = plyFrom(fenAt(cur.plies), uci);
    if (!ply) return;
    const moves = repMoves(rep, key);
    const firstAttempt = !graded.current.has(key);
    if (firstAttempt) graded.current.add(key);

    if (!moves.some((m) => m.uci === uci)) {
      sound('error');
      if (firstAttempt) {
        rep.cards[key] = review(rep.cards[key], false);
        repsChanged();
      }
      addStats({ mistakes: 1 });
      const wrong = cur.wrong + 1;
      setLine({
        ...cur,
        wrong,
        feedback: {
          kind: 'bad',
          text: `Pas dans votre répertoire (${ply.san}).`,
          notes: [wrong >= 2 ? 'La flèche verte montre la réponse.' : 'Réessayez, ou demandez un indice.'],
        },
      });
      return;
    }

    if (firstAttempt && isDue(rep.cards[key], Date.now())) {
      rep.cards[key] = review(rep.cards[key], true);
      repsChanged();
    }
    addStats({ positions: 1, firstTry: firstAttempt ? 1 : 0 });
    const notes: string[] = [];
    const others = moves.filter((m) => m.uci !== uci).map((m) => m.san);
    if (others.length) notes.push(`Aussi dans votre répertoire : ${others.join(', ')}`);
    const comment = rep.nodes[ply.key]?.comment;
    if (comment) notes.push(comment);
    pushPly(ply, { kind: 'ok', text: `Correct : ${moveLabel(ply.san, cur.plies.length)}`, notes });
  };

  const onGo = (cursor: number) => {
    const cur = lineRef.current;
    if (cur.status !== 'finished') return;
    setLine({ ...cur, view: cursor >= cur.plies.length ? null : Math.max(0, cursor), auto: false });
  };

  const resetRoot = () => startTraining([], side);

  const cursor = line.view ?? line.plies.length;
  const curKey = keyAt(line.plies);
  const curMoves = repMoves(rep, curKey);
  const playing = line.status === 'playing';
  const userTurn = isOwnerTurn(rep, curKey);
  const canMove = playing && userTurn && line.view === null;
  const fen = fenAt(line.plies, cursor);
  const lastMove = cursor ? line.plies[cursor - 1].uci : undefined;

  const arrows = useMemo<BoardArrow[]>(() => {
    if (!canMove) return [];
    if (line.wrong >= 2) return curMoves.map((m) => ({ uci: m.uci, brush: 'green' }));
    if (line.hint && curMoves.length) return [{ uci: curMoves[0].uci, brush: 'green' }];
    return [];
  }, [canMove, line.wrong, line.hint, curMoves]);

  const opening = useMemo(
    () => openingForKeys([START_KEY, ...line.plies.slice(0, cursor).map((p) => p.key)]),
    [line.plies, cursor],
  );

  const sideSeg = (
    <div className="seg" title="Répertoire entraîné">
      {(['white', 'black'] as Color[]).map((c) => (
        <button key={c} className={side === c ? 'active' : ''} onClick={() => setSide(c)}>
          {colorLabel(c)}
        </button>
      ))}
    </div>
  );

  if (!repMoves(rep, START_KEY).length) {
    return (
      <div className="page training-empty">
        <section className="panel">
          <div className="panel-head">
            <h3>Entraînement</h3>
            <span className="grow" />
            {sideSeg}
          </div>
          <div className="empty-state">
            <h2>Votre répertoire {colorLabel(side)} est vide</h2>
            <p>
              Construisez-le dans l'explorateur en jouant vos coups (mode édition), ou importez vos parties pour le générer
              automatiquement. Vous pourrez ensuite rejouer vos lignes ici.
            </p>
            <div className="row">
              <button className="btn primary" onClick={() => setView('explorer')}>
                <Icon name="book" size={16} />
                Ouvrir l'explorateur
              </button>
              <button className="btn" onClick={() => setView('import')}>
                <Icon name="download" size={16} />
                Importer des parties
              </button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  let status: ReactNode = null;
  if (line.status === 'done') {
    const next = nextDue(rep, rootKey);
    status = (
      <>
        <div className="feedback ok">Tout est révisé{rootPlies.length ? ' depuis cette position' : ''}.</div>
        <p className="muted small">
          {next ? `Prochaine révision dans ${formatDelay(next - Date.now())}. ` : ''}
          Vous pouvez continuer en mode libre, avec des lignes au hasard.
        </p>
        <div className="row">
          <button className="btn primary" onClick={() => setMode('free')}>
            <Icon name="play" size={16} />
            Passer en mode libre
          </button>
          {rootPlies.length > 0 && (
            <button className="btn" onClick={resetRoot}>
              Depuis le début
            </button>
          )}
        </div>
      </>
    );
  } else if (line.status === 'noroot') {
    status = (
      <>
        <div className="feedback info">Cette position n'a pas de suite dans votre répertoire {colorLabel(side)}.</div>
        <div className="row">
          <button className="btn" onClick={resetRoot}>
            Depuis le début
          </button>
        </div>
      </>
    );
  } else if (line.status === 'playing' || line.status === 'finished') {
    const prompt =
      line.status === 'finished'
        ? line.auto
          ? 'Ligne suivante dans un instant.'
          : 'Cliquez sur un coup pour revoir la position.'
        : userTurn
          ? `À vous de jouer (${colorLabel(side)}).`
          : "L'adversaire joue...";
    const fb = line.feedback;
    const showHint = canMove && line.wrong === 1 && !line.hint;
    status = (
      <>
        {fb ? (
          <div className={`feedback ${fb.kind}`}>
            {fb.text}
            {fb.notes?.map((n, i) => (
              <p key={i} className="train-note">
                {n}
              </p>
            ))}
          </div>
        ) : (
          <div className="feedback info">{prompt}</div>
        )}
        {(fb || showHint) && (
          <div className="row">
            {fb && <span className="muted small grow">{prompt}</span>}
            {showHint && (
              <button className="btn small" onClick={() => setLine({ ...lineRef.current, hint: true })}>
                <Icon name="target" size={16} />
                Indice
              </button>
            )}
          </div>
        )}
      </>
    );
  }

  const active = line.status === 'playing' || line.status === 'finished';
  const finished = line.status === 'finished';
  // When everything is reviewed, "next line" checks again for due positions.
  const canNext = active || line.status === 'done';

  return (
    <div className="board-layout training">
      <div className="board-col">
        <Board
          fen={fen}
          orientation={side}
          lastMove={lastMove}
          movable={canMove ? side : undefined}
          onMove={onUserMove}
          arrows={arrows}
        />
      </div>

      <div className="side-col">
        <section className="panel">
          <div className="panel-head">
            <h3>Entraînement</h3>
            <span className="grow" />
            <span className="tag" title="Positions où vous devez trouver votre coup">
              {plural(counts.cards, 'position')}
            </span>
            <span className={`tag ${counts.due ? 'yellow' : 'green'}`} title="Positions à réviser maintenant">
              {counts.due} à réviser
            </span>
          </div>
          <div className="row">
            {sideSeg}
            <div className="seg" title="Choix des lignes">
              <button className={mode === 'review' ? 'active' : ''} onClick={() => setMode('review')}>
                Révision
              </button>
              <button className={mode === 'free' ? 'active' : ''} onClick={() => setMode('free')}>
                Libre
              </button>
            </div>
          </div>
          <p className="muted small">
            {mode === 'review'
              ? 'Les lignes contenant des positions à réviser passent en priorité (répétition espacée).'
              : 'Lignes tirées au hasard dans tout le répertoire.'}
          </p>
          {rootPlies.length > 0 && (
            <div className="train-root">
              <span className="muted small">Entraînement depuis :</span>
              <span className="train-root-line">{formatLine(rootPlies.map((p) => p.san))}</span>
              <button className="btn small ghost" onClick={resetRoot} title="S'entraîner depuis la position initiale">
                <Icon name="reset" size={14} />
                Depuis le début
              </button>
            </div>
          )}
        </section>

        <section className="panel">
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
          {status}
          <div className="row">
            <button className="btn small" onClick={() => startLine(true)} disabled={!active}>
              <Icon name="reset" size={16} />
              Recommencer la ligne
            </button>
            <button className={`btn small ${finished ? 'primary' : ''}`} onClick={() => startLine()} disabled={!canNext}>
              <Icon name="next" size={16} />
              Ligne suivante
            </button>
            <button
              className="btn small ghost"
              onClick={() => openInExplorer(line.plies.slice(0, cursor).map((p) => p.uci), side)}
            >
              <Icon name="eye" size={16} />
              Voir dans l'explorateur
            </button>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <span className="panel-title">Ligne</span>
          </div>
          <MoveList plies={line.plies} cursor={cursor} onGo={onGo} dimBefore={rootPlies.length} />
        </section>

        <section className="panel">
          <div className="panel-head">
            <span className="panel-title">Session</span>
            <span className="grow" />
            <button
              className="btn small ghost"
              onClick={resetStats}
              disabled={!session.lines && !session.positions && !session.mistakes}
            >
              Remettre à zéro
            </button>
          </div>
          <div className="train-stats">
            <div className="train-stat">
              <strong>{session.lines}</strong>
              <span>{session.lines > 1 ? 'Lignes terminées' : 'Ligne terminée'}</span>
            </div>
            <div className="train-stat">
              <strong>
                {session.firstTry}
                <small> / {session.positions}</small>
              </strong>
              <span>Du premier coup</span>
            </div>
            <div className="train-stat">
              <strong className={session.mistakes ? 'error' : ''}>{session.mistakes}</strong>
              <span>{session.mistakes > 1 ? 'Erreurs' : 'Erreur'}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
