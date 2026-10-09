import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { planFix } from '../analysis/fix';
import { cancelAnalysis, loadAnalysisOptions, runAnalysis, useAnalysisTask } from '../analysis/runner';
import { describeWeakness, levelLabel, type Weakness } from '../analysis/weaknesses';
import { Board, type BoardArrow } from '../components/Board';
import { Icon } from '../components/Icon';
import { MoveList } from '../components/MoveList';
import { msg, t, useT, type Msg, type Params, type TKey } from '../i18n';
import {
  colorLabel,
  formatLine,
  keyToFen,
  moveLabel,
  pliesFromUcis,
  plyFrom,
  sanOf,
  START_FEN,
  START_KEY,
  type Color,
  type Ply,
} from '../lib/chess';
import { openingForKeys } from '../lib/openings';
import { playMoveSound } from '../lib/sound';
import { formatDate } from '../lib/util';
import { hasMove, isOwnerTurn, repMoves, repStats, type Repertoire } from '../repertoire/model';
import {
  dismissWeakness,
  getState,
  getTrees,
  openInExplorer,
  repsChanged,
  setSide,
  setView,
  startTraining,
  toast,
  useStore,
} from '../store/store';
import {
  acceptedMoves,
  getDrilled,
  isQuiz,
  markDrilled,
  mistakesOf,
  mistakeState,
  offerFix,
  peekPendingMistake,
  playedUci,
  takePendingMistake,
  useDrilled,
  type MistakeState,
} from '../training/mistakes';
import { dueCounter, isDue, pickReply, review, type TrainingMode } from '../training/srs';
import '../styles/training.css';

type Mode = TrainingMode | 'mistakes';

type Status = 'idle' | 'playing' | 'finished' | 'done' | 'noroot';

interface Feedback {
  kind: 'ok' | 'bad' | 'info';
  /** Stored as messages so that they follow a change of language. */
  text: Msg;
  notes?: (Msg | string)[];
}

/** Focused drill of one mistake: replays the line from the start up to the mistake, then the fix. */
interface Focus {
  w: Weakness;
  /** Moves from the start to the mistake position. */
  path: Ply[];
  /** Move played in your games at the mistake position. */
  played?: { uci: string; san: string };
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
  focus: Focus | null;
  /** Focused drill: the mistake position was solved on the first try. */
  solved: boolean;
}

interface SessionStats {
  lines: number;
  positions: number;
  firstTry: number;
  mistakes: number;
}

interface MistakeItem extends MistakeState {
  w: Weakness;
}

const MODES: Mode[] = ['mistakes', 'review', 'free'];
const OPPONENT_DELAY = 450;
const NEXT_LINE_DELAY = 1200;
const MAX_PLIES = 300;
const EMPTY_STATS: SessionStats = { lines: 0, positions: 0, firstTry: 0, mistakes: 0 };
const NO_ARROWS: BoardArrow[] = [];
/** Inputs where the arrow keys do not edit anything. */
const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'file', 'image']);

// Kept across view switches for the whole session (null: not chosen yet).
let sessionMode: Mode | null = null;
let sessionStats: SessionStats = EMPTY_STATS;

const keyAt = (plies: Ply[], n = plies.length) => (n ? plies[n - 1].key : START_KEY);
const fenAt = (plies: Ply[], n = plies.length) => (n ? plies[n - 1].fen : START_FEN);
const m = (key: TKey, params?: Params): Msg => ({ key, params });

function sound(kind: Parameters<typeof playMoveSound>[0]) {
  if (getState().settings.sound) playMoveSound(kind);
}

/** A line stops when the position has no follow-up or repeats (transposition loop). */
function lineEnded(rep: Repertoire, plies: Ply[]): boolean {
  const key = keyAt(plies);
  if (!repMoves(rep, key).length || plies.length >= MAX_PLIES) return true;
  return key === START_KEY || plies.slice(0, -1).some((p) => p.key === key);
}

/** Moves required next in a focused line: the path, then the fix (null: the repertoire decides). */
function focusTarget(f: Focus, rep: Repertoire, n: number): string[] | null {
  if (n < f.path.length) return [f.path[n].uci];
  if (n === f.path.length) {
    const ok = acceptedMoves(rep, f.w);
    return ok.length ? ok : null;
  }
  return null;
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
    for (const mv of moves) {
      if (!seen.has(mv.to)) {
        seen.add(mv.to);
        stack.push(mv.to);
      }
    }
  }
  return min === Infinity ? null : min;
}

function formatDelay(ms: number): string {
  const min = Math.max(1, Math.ceil(ms / 60000));
  if (min < 60) return t('training.delayMin', { count: min });
  const hours = Math.round(min / 60);
  if (hours < 24) return t('training.delayHours', { count: hours });
  return t('training.delayDays', { count: Math.round(hours / 24) });
}

/** "My mistakes" first when the side has some left (or when games are imported but never analysed). */
function defaultMode(side: Color): Mode {
  const s = getState();
  const rep = s.reps[side];
  const marks = getDrilled();
  if (mistakesOf(s.report, side).some((w) => !mistakeState(rep, w, marks).done)) return 'mistakes';
  if (!s.report && s.sources.length) return 'mistakes';
  return 'review';
}

function initialMode(side: Color, hasRoot: boolean): Mode {
  if (peekPendingMistake()) return 'mistakes';
  const mode = sessionMode ?? defaultMode(side);
  // Opened on a given position: drill from there.
  return hasRoot && mode === 'mistakes' ? 'review' : mode;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(target.type);
  return target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

function LevelTag({ w }: { w: Weakness }) {
  const t = useT();
  if (w.kind !== 'engine') return <span className="tag blue">{t('training.deviationTag')}</span>;
  if (!w.level) return null;
  return <span className={`tag ${w.level === 'inaccuracy' ? 'yellow' : 'red'}`}>{levelLabel(w.level)}</span>;
}

function StateTags({ item }: { item: MistakeState }) {
  const t = useT();
  return (
    <>
      {item.fixed && (
        <span className="tag green" title={t('training.fixedTitle')}>
          {t('training.fixedTag')}
        </span>
      )}
      {item.drilled && (
        <span className="tag green" title={t('training.drilledTitle')}>
          {t('training.drilledTag')}
        </span>
      )}
    </>
  );
}

function MistakeCard({
  item,
  compact,
  selected,
  current,
  onSelect,
  onWork,
}: {
  item: MistakeItem;
  /** During a drill: no detail, it would give the answer away. */
  compact: boolean;
  selected: boolean;
  current: boolean;
  onSelect?: () => void;
  onWork: () => void;
}) {
  const t = useT();
  const { w } = item;
  const { title, detail } = describeWeakness(w);
  const sans = useMemo(() => formatLine(pliesFromUcis(w.path).map((p) => p.san)), [w.path]);
  const cls = ['mistake-card', `level-${w.kind === 'engine' ? (w.level ?? 'mistake') : 'deviation'}`];
  if (item.done) cls.push('done');
  if (selected) cls.push('selected');
  if (current) cls.push('current');
  if (onSelect) cls.push('clickable');
  return (
    <div className={cls.join(' ')} onClick={onSelect} title={onSelect ? t('training.previewTitle') : undefined}>
      <div className="row">
        <LevelTag w={w} />
        <StateTags item={item} />
        <span className="grow" />
        <span className="muted small">{t('common.games', { count: w.games })}</span>
      </div>
      <div className="mistake-title">{title}</div>
      {!compact && <p className="small mistake-detail">{detail}</p>}
      <div className="mistake-line" title={t('training.lineToPosition')}>
        {sans || t('common.startPosition')}
      </div>
      <div className="mistake-actions">
        <button
          type="button"
          className={`btn small ${selected && !item.done ? 'primary' : ''}`}
          disabled={current}
          onClick={(e) => {
            e.stopPropagation();
            onWork();
          }}
        >
          <Icon name="target" size={15} />
          {t('training.workOn')}
        </button>
        <button
          type="button"
          className="btn small"
          title={t('training.viewTitle')}
          onClick={(e) => {
            e.stopPropagation();
            openInExplorer(w.path, w.color, w.arrows);
          }}
        >
          <Icon name="eye" size={15} />
          {t('training.view')}
        </button>
        <span className="grow" />
        <button
          type="button"
          className="btn small ghost"
          title={t('training.dismissTitle')}
          onClick={(e) => {
            e.stopPropagation();
            dismissWeakness(w.id);
          }}
        >
          <Icon name="x" size={15} />
          {t('training.dismiss')}
        </button>
      </div>
    </div>
  );
}

export function TrainingView() {
  const t = useT();
  const state = useStore();
  const task = useAnalysisTask();
  const marks = useDrilled();
  const side = state.settings.side;
  const rep = state.reps[side];
  const report = state.report;

  const rootPlies = useMemo(() => pliesFromUcis(state.trainingRoot), [state.trainingRoot]);
  const rootKey = keyAt(rootPlies);
  const [mode, setModeState] = useState<Mode>(() => initialMode(side, rootPlies.length > 0));
  // Until a mode is chosen, the default follows the side.
  const [modeSide, setModeSide] = useState(side);
  if (modeSide !== side) {
    setModeSide(side);
    if (!sessionMode) setModeState(defaultMode(side));
  }
  const [session, setSession] = useState<SessionStats>(sessionStats);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // repsRev: cards and moves are updated in place.
  const counts = useMemo(() => repStats(rep), [rep, state.repsRev]);
  const mistakes = useMemo<MistakeItem[]>(() => {
    const list = mistakesOf(report, side).map((w) => ({ w, ...mistakeState(rep, w, marks) }));
    return [...list.filter((x) => !x.done), ...list.filter((x) => x.done)];
  }, [report, side, rep, state.repsRev, marks]);
  const openCount = mistakes.filter((x) => !x.done).length;

  const [line, setLineState] = useState<Line>(() => ({
    id: 0,
    plies: rootPlies,
    status: 'idle',
    wrong: 0,
    hint: false,
    feedback: null,
    view: null,
    auto: false,
    focus: null,
    solved: false,
  }));
  // Handlers and timers read the latest line from here.
  const lineRef = useRef(line);
  const dueRef = useRef<(key: string) => number>(() => 0);
  const graded = useRef(new Set<string>());
  const forced = useRef(new Map<string, string>());
  /** What the current line was started for (effects run twice in development). */
  const startedFor = useRef<{ rep: Repertoire; mode: Mode; root: Ply[] } | null>(null);

  const setLine = (next: Line) => {
    lineRef.current = next;
    setLineState(next);
  };

  const setMode = (next: Mode) => {
    sessionMode = next;
    setModeState(next);
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

  /**
   * Starts a new line from the training root, or the focused line of a mistake from the start.
   * `restart` replays the same opponent replies (and the same mistake).
   */
  const startLine = (restart = false, focus: Focus | null = restart ? lineRef.current.focus : null) => {
    const cur = lineRef.current;
    const start = focus ? [] : rootPlies;
    const replies = new Map<string, string>();
    if (restart) {
      cur.plies.forEach((p, i) => {
        const before = keyAt(cur.plies, i);
        if (i >= start.length && !isOwnerTurn(rep, before)) replies.set(before, p.uci);
      });
    }
    forced.current = replies;
    graded.current = new Set();
    const due = dueCounter(rep);
    dueRef.current = due;
    // A focused line always plays; without one, "My mistakes" shows the list.
    let status: Status = 'playing';
    if (focus) status = 'playing';
    else if (mode === 'mistakes') status = 'idle';
    else if (!repMoves(rep, rootKey).length) status = 'noroot';
    else if (!restart && mode === 'review' && due(rootKey) === 0) status = 'done';
    setLine({
      id: cur.id + 1,
      plies: start,
      status,
      wrong: 0,
      hint: false,
      feedback: null,
      view: null,
      auto: !focus,
      focus,
      solved: false,
    });
  };

  /** Focused drill of a mistake (the mode is already "My mistakes"). */
  const startFocus = (w: Weakness) => {
    const path = pliesFromUcis(w.path);
    if (path.length !== w.path.length || keyAt(path) !== w.key) {
      toast(t('training.badLine'), 'error');
      return;
    }
    const uci = playedUci(w);
    sessionMode = 'mistakes';
    setSelectedId(w.id);
    startLine(false, { w, path, played: uci ? { uci, san: sanOf(keyToFen(w.key), uci) } : undefined });
  };

  const workOn = (w: Weakness) => {
    // Engine finding not corrected yet: offers the fix, the line is drilled either way.
    offerFix(w);
    startFocus(w);
  };

  const pushPly = (ply: Ply, feedback = lineRef.current.feedback, solved = lineRef.current.solved) => {
    const cur = lineRef.current;
    const plies = [...cur.plies, ply];
    const f = cur.focus;
    // A focused line goes at least one move past the mistake, whatever the repertoire holds before.
    const ended = f ? plies.length > f.path.length && lineEnded(rep, plies) : lineEnded(rep, plies);
    if (ended) {
      sound('success');
      addStats({ lines: 1 });
      const comment = rep.nodes[ply.key]?.comment;
      if (f) {
        if (solved) markDrilled(f.w.id);
        const notes: (Msg | string)[] = [];
        // Repertoire not corrected: shows where Stockfish would go on.
        if (isQuiz(rep, f.w) && plies[f.path.length]?.uci === f.w.best) {
          const cont = planFix(rep, f.w)?.continuation ?? [];
          if (cont.length) {
            notes.push(m('training.engineCont', { line: formatLine(cont.map((p) => p.san), f.path.length + 1) }));
          }
        }
        if (comment) notes.push(comment);
        feedback = {
          kind: solved ? 'ok' : 'info',
          text: m(solved ? 'training.focusMastered' : 'training.focusFinished'),
          notes,
        };
      } else feedback = { kind: 'ok', text: m('training.lineDone'), notes: comment ? [comment] : undefined };
    } else sound(ply.san.includes('x') ? 'capture' : 'move');
    setLine({
      ...cur,
      plies,
      status: ended ? 'finished' : 'playing',
      wrong: 0,
      hint: false,
      feedback,
      view: null,
      auto: !f,
      solved,
    });
  };

  // New line whenever the repertoire, the mode or the starting position change.
  useEffect(() => {
    const s = startedFor.current;
    if (s && s.rep === rep && s.mode === mode && s.root === rootPlies) return;
    startedFor.current = { rep, mode, root: rootPlies };
    // A mistake opened from another view.
    const pending = takePendingMistake();
    if (pending && pending.color === side && mode === 'mistakes') startFocus(pending);
    else startLine();
  }, [rep, mode, rootPlies]);

  // Opponent reply (and, in a focused line, the opponent moves of your games).
  useEffect(() => {
    if (line.status !== 'playing' || isOwnerTurn(rep, keyAt(line.plies))) return;
    const id = line.id;
    const timer = window.setTimeout(() => {
      const cur = lineRef.current;
      if (cur.id !== id || cur.status !== 'playing') return;
      const key = keyAt(cur.plies);
      const moves = repMoves(rep, key);
      const target = cur.focus ? focusTarget(cur.focus, rep, cur.plies.length) : null;
      let uci: string;
      if (target) uci = target[0];
      else {
        if (!moves.length) return;
        const want = forced.current.get(key);
        uci = (moves.find((mv) => mv.uci === want) ?? pickReply(moves, mode === 'free' ? 'free' : 'review', dueRef.current)).uci;
      }
      const ply = plyFrom(fenAt(cur.plies), uci);
      if (ply) pushPly(ply);
      else {
        const san = moves.find((mv) => mv.uci === uci)?.san ?? uci;
        setLine({ ...cur, status: 'finished', auto: false, feedback: { kind: 'bad', text: m('training.illegalRepMove', { move: san }) } });
      }
    }, OPPONENT_DELAY);
    return () => window.clearTimeout(timer);
  }, [line.id, line.plies, line.status, rep, mode]);

  // Next line after a short pause, unless the user is browsing the finished line.
  useEffect(() => {
    if (line.status !== 'finished' || !line.auto) return;
    const timer = window.setTimeout(() => startLine(), NEXT_LINE_DELAY);
    return () => window.clearTimeout(timer);
  }, [line.id, line.status, line.auto]);

  const onGo = (cursor: number) => {
    const cur = lineRef.current;
    if (cur.status !== 'finished') return;
    setLine({ ...cur, view: cursor >= cur.plies.length ? null : Math.max(0, cursor), auto: false });
  };

  // Keyboard, like chess.com: once the line is finished, the arrows move through it.
  useEffect(() => {
    if (line.status !== 'finished') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || isTypingTarget(e.target)) return;
      const cur = lineRef.current;
      if (cur.status !== 'finished') return;
      const at = cur.view ?? cur.plies.length;
      let to: number;
      if (e.key === 'ArrowLeft') to = at - 1;
      else if (e.key === 'ArrowRight') to = at + 1;
      else if (e.key === 'ArrowUp') to = 0;
      else if (e.key === 'ArrowDown') to = cur.plies.length;
      else return;
      e.preventDefault();
      to = Math.max(0, Math.min(cur.plies.length, to));
      if (to !== at || cur.auto) onGo(to);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [line.status]);

  /** Focused line: the path of your games, then the fix at the mistake position. */
  const onTargetMove = (cur: Line, f: Focus, key: string, ply: Ply, target: string[]) => {
    const fen = fenAt(cur.plies);
    const atMistake = cur.plies.length === f.path.length;
    // The card is graded only when the expected move is the repertoire's (not in a quiz).
    const counted =
      target.some((u) => hasMove(rep, key, u)) && !(atMistake && f.played && hasMove(rep, key, f.played.uci));
    const firstAttempt = !graded.current.has(key);

    if (!target.includes(ply.uci)) {
      if (!atMistake && hasMove(rep, key, ply.uci)) {
        // Right in general, but another line.
        setLine({ ...cur, hint: true, feedback: { kind: 'info', text: m('training.otherLine', { move: sanOf(fen, target[0]) }) } });
        return;
      }
      graded.current.add(key);
      sound('error');
      if (firstAttempt && counted) {
        rep.cards[key] = review(rep.cards[key], false);
        repsChanged();
      }
      addStats({ mistakes: 1 });
      const wrong = cur.wrong + 1;
      let text: Msg;
      if (atMistake) {
        text = m(f.played && ply.uci === f.played.uci ? 'training.playedAgain' : 'training.notBest', { move: ply.san });
      } else text = m(hasMove(rep, key, target[0]) ? 'training.notInRep' : 'training.notThisLine', { move: ply.san });
      setLine({
        ...cur,
        wrong,
        feedback: { kind: 'bad', text, notes: [m(wrong >= 2 ? 'training.arrowShows' : 'training.tryAgain')] },
      });
      return;
    }

    graded.current.add(key);
    if (firstAttempt && counted && isDue(rep.cards[key], Date.now())) {
      rep.cards[key] = review(rep.cards[key], true);
      repsChanged();
    }
    addStats({ positions: 1, firstTry: firstAttempt ? 1 : 0 });
    const notes: (Msg | string)[] = [];
    let text: Msg;
    if (atMistake) {
      text = m(f.w.kind === 'engine' && ply.uci === f.w.best ? 'training.foundBest' : 'training.foundRep', { move: ply.san });
      const others = target.filter((u) => u !== ply.uci).map((u) => sanOf(fen, u));
      if (others.length) notes.push(m('training.alsoGood', { moves: others.join(', ') }));
    } else text = m('training.correct', { move: moveLabel(ply.san, cur.plies.length) });
    const comment = rep.nodes[ply.key]?.comment;
    if (comment) notes.push(comment);
    pushPly(ply, { kind: 'ok', text, notes }, atMistake ? firstAttempt : cur.solved);
  };

  const onUserMove = (uci: string) => {
    const cur = lineRef.current;
    if (cur.status !== 'playing' || cur.view !== null) return;
    const key = keyAt(cur.plies);
    if (!isOwnerTurn(rep, key)) return;
    const ply = plyFrom(fenAt(cur.plies), uci);
    if (!ply) return;
    const target = cur.focus ? focusTarget(cur.focus, rep, cur.plies.length) : null;
    if (cur.focus && target) {
      onTargetMove(cur, cur.focus, key, ply, target);
      return;
    }
    const moves = repMoves(rep, key);
    const firstAttempt = !graded.current.has(key);
    if (firstAttempt) graded.current.add(key);

    if (!moves.some((mv) => mv.uci === uci)) {
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
          text: m('training.notInRep', { move: ply.san }),
          notes: [m(wrong >= 2 ? 'training.arrowShows' : 'training.tryAgain')],
        },
      });
      return;
    }

    if (firstAttempt && isDue(rep.cards[key], Date.now())) {
      rep.cards[key] = review(rep.cards[key], true);
      repsChanged();
    }
    addStats({ positions: 1, firstTry: firstAttempt ? 1 : 0 });
    const notes: (Msg | string)[] = [];
    const others = moves.filter((mv) => mv.uci !== uci).map((mv) => mv.san);
    if (others.length) notes.push(m('training.alsoInRep', { moves: others.join(', ') }));
    const comment = rep.nodes[ply.key]?.comment;
    if (comment) notes.push(comment);
    pushPly(ply, { kind: 'ok', text: m('training.correct', { move: moveLabel(ply.san, cur.plies.length) }), notes });
  };

  const resetRoot = () => startTraining([], side);
  const runIt = () => void runAnalysis({ ...loadAnalysisOptions(), useEngine: true });

  const f = line.focus;
  const listPhase = mode === 'mistakes' && !f;
  const cursor = line.view ?? line.plies.length;
  const curKey = keyAt(line.plies);
  const curMoves = repMoves(rep, curKey);
  const playing = line.status === 'playing';
  const userTurn = isOwnerTurn(rep, curKey);
  const canMove = playing && userTurn && line.view === null;
  const fen = fenAt(line.plies, cursor);
  const lastMove = cursor ? line.plies[cursor - 1].uci : undefined;
  const atMistake = !!f && playing && line.plies.length === f.path.length;

  const target = useMemo(
    () => (f && playing ? focusTarget(f, rep, line.plies.length) : null),
    [f, playing, rep, state.repsRev, line.plies.length],
  );
  // On the path of your games, a move that is not in the repertoire is simply shown.
  const follow = !!target && !atMistake && userTurn && !hasMove(rep, curKey, target[0]);

  const arrows = useMemo<BoardArrow[]>(() => {
    if (!canMove) return NO_ARROWS;
    const answers = target ?? curMoves.map((mv) => mv.uci);
    const out: BoardArrow[] = [];
    if (atMistake && f?.played) out.push({ uci: f.played.uci, brush: 'red' });
    if (follow) out.push({ uci: answers[0], brush: 'blue' });
    else if (line.wrong >= 2) out.push(...answers.map((u) => ({ uci: u, brush: 'green' })));
    else if (line.hint && answers.length) out.push({ uci: answers[0], brush: 'green' });
    return out;
  }, [canMove, target, curMoves, atMistake, f, follow, line.wrong, line.hint]);

  const opening = useMemo(
    () => openingForKeys([START_KEY, ...line.plies.slice(0, cursor).map((p) => p.key)]),
    [line.plies, cursor],
  );

  // List of mistakes: the board shows the selected one.
  const preview = listPhase
    ? (mistakes.find((x) => x.w.id === selectedId) ?? mistakes.find((x) => !x.done) ?? mistakes[0])
    : undefined;
  const previewW = preview?.w;
  const previewPlies = useMemo(() => (previewW ? pliesFromUcis(previewW.path) : []), [previewW]);

  // The report is outdated when games were imported after it or the speed filter changed.
  const currentGames = useMemo(
    () => (mode === 'mistakes' && report && state.sources.length ? getTrees().games : null),
    [mode, report, state.sources, state.gamesRev, state.settings.speeds],
  );

  const sideSeg = (
    <div className="seg" title={t('training.sideTitle')}>
      {(['white', 'black'] as Color[]).map((c) => (
        <button key={c} type="button" className={side === c ? 'active' : ''} onClick={() => setSide(c)}>
          {colorLabel(c)}
        </button>
      ))}
    </div>
  );

  const modeSeg = (
    <div className="seg" title={t('training.modeTitle')}>
      {MODES.map((id) => (
        <button key={id} type="button" className={mode === id ? 'active' : ''} onClick={() => setMode(id)}>
          {t(`training.mode.${id}`)}
          {id === 'mistakes' && openCount > 0 && <span className="badge train-badge">{openCount}</span>}
        </button>
      ))}
    </div>
  );

  if (mode !== 'mistakes' && !repMoves(rep, START_KEY).length) {
    return (
      <div className="page training-empty">
        <section className="panel">
          <div className="panel-head">
            <h3>{t('training.title')}</h3>
            <span className="grow" />
            {sideSeg}
            {modeSeg}
          </div>
          <div className="empty-state">
            <h2>{t('training.emptyTitle', { color: colorLabel(side) })}</h2>
            <p>{t('training.emptyText')}</p>
            <div className="row">
              <button type="button" className="btn primary" onClick={() => setView('explorer')}>
                <Icon name="book" size={16} />
                {t('training.openExplorer')}
              </button>
              <button type="button" className="btn" onClick={() => setView('import')}>
                <Icon name="download" size={16} />
                {t('training.importGames')}
              </button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  // ---------- mistakes panel ----------

  const runButton = (label: string) => (
    <button type="button" className="btn primary" onClick={runIt}>
      <Icon name="target" size={16} />
      {label}
    </button>
  );
  const invite = (title: string, text: string, action: ReactNode) => (
    <div className="train-invite">
      <h3>{title}</h3>
      <p className="muted small">{text}</p>
      <div className="row">{action}</div>
    </div>
  );
  const goReview = (
    <button type="button" className="btn" onClick={() => setMode('review')}>
      <Icon name="play" size={16} />
      {t('training.goReview')}
    </button>
  );

  const progress = task.running?.progress;
  const hasGames = state.sources.length > 0;
  const lastImport = state.sources.reduce((a, s) => Math.max(a, s.importedAt), 0);
  const stale =
    !!report && hasGames && (lastImport > report.generatedAt || (currentGames !== null && currentGames !== report.games));
  const noEngine = !!report && report.options?.useEngine === false;

  let notice: ReactNode = null;
  if (progress) {
    notice = (
      <div className="train-progress">
        <div className="row">
          <span className="small">{progress.message}</span>
          <span className="grow" />
          {progress.total > 0 && (
            <span className="muted small">
              {progress.done} / {t('common.positions', { count: progress.total })}
            </span>
          )}
          <button type="button" className="btn small danger" onClick={cancelAnalysis}>
            {t('training.cancel')}
          </button>
        </div>
        <div className={`progress${progress.total ? '' : ' train-indeterminate'}`}>
          <div style={progress.total ? { width: `${(progress.done / progress.total) * 100}%` } : undefined} />
        </div>
        <p className="muted small">{t('training.analysisBackground')}</p>
      </div>
    );
  } else if (!report && !hasGames) {
    notice = invite(
      t('training.importTitle'),
      t('training.importText'),
      <button type="button" className="btn primary" onClick={() => setView('import')}>
        <Icon name="download" size={16} />
        {t('training.goImport')}
      </button>,
    );
  } else if (!report) {
    notice = invite(t('training.runTitle'), t('training.runText'), runButton(t('training.runAnalysis')));
  } else if (hasGames && (stale || noEngine)) {
    notice = (
      <div className="feedback info train-notice">
        <p>{t(stale ? 'training.staleText' : 'training.noEngineText')}</p>
        <div className="row">{runButton(t('training.rerunAnalysis'))}</div>
      </div>
    );
  }

  const mistakesPanel = (
    <section className="panel">
      <div className="panel-head">
        <h3>{t('training.mistakesTitle')}</h3>
        <span className="grow" />
        {mistakes.length > 0 && (
          <span className={`tag ${openCount ? 'red' : 'green'}`}>{t('training.remaining', { count: openCount })}</span>
        )}
      </div>
      {notice}
      {task.error && !task.running && <div className="feedback bad">{task.error}</div>}
      {report && (
        <div className="row">
          <span className="muted small grow">
            {t('training.analysedOn', { date: formatDate(report.generatedAt), count: report.games })}
          </span>
          <button type="button" className="btn small ghost" title={t('training.fullReportTitle')} onClick={() => setView('analysis')}>
            {t('training.fullReport')}
          </button>
        </div>
      )}
      {report &&
        !progress &&
        !mistakes.length &&
        !noEngine &&
        invite(t('training.noMistakesTitle', { color: colorLabel(side) }), t('training.noMistakesText'), goReview)}
      {mistakes.length > 0 && !openCount && (
        <div className="feedback ok train-congrats">
          <span>{t('training.allDoneTitle')}</span>
          <p className="train-note">{t('training.allDoneText')}</p>
          <div className="row">{goReview}</div>
        </div>
      )}
      {mistakes.length > 0 && listPhase && <p className="muted small">{t('training.mistakesIntro')}</p>}
      {mistakes.length > 0 && (
        <div className="mistake-list">
          {mistakes.map((x) => (
            <MistakeCard
              key={x.w.id}
              item={x}
              compact={!listPhase}
              selected={!!preview && preview.w.id === x.w.id}
              current={!!f && f.w.id === x.w.id}
              onSelect={listPhase ? () => setSelectedId(x.w.id) : undefined}
              onWork={() => workOn(x.w)}
            />
          ))}
        </div>
      )}
    </section>
  );

  // ---------- drill status ----------

  let status: ReactNode = null;
  if (line.status === 'done') {
    const next = nextDue(rep, rootKey);
    status = (
      <>
        <div className="feedback ok">{t(rootPlies.length ? 'training.allReviewedHere' : 'training.allReviewed')}</div>
        <p className="muted small">
          {next ? `${t('training.nextReview', { delay: formatDelay(next - Date.now()) })} ` : ''}
          {t('training.freeHint')}
        </p>
        <div className="row">
          <button type="button" className="btn primary" onClick={() => setMode('free')}>
            <Icon name="play" size={16} />
            {t('training.goFree')}
          </button>
          {rootPlies.length > 0 && (
            <button type="button" className="btn" onClick={resetRoot}>
              {t('training.fromStart')}
            </button>
          )}
        </div>
      </>
    );
  } else if (line.status === 'noroot') {
    status = (
      <>
        <div className="feedback info">{t('training.noFollowUp', { color: colorLabel(side) })}</div>
        <div className="row">
          <button type="button" className="btn" onClick={resetRoot}>
            {t('training.fromStart')}
          </button>
        </div>
      </>
    );
  } else if (line.status === 'playing' || line.status === 'finished') {
    let prompt: string;
    if (line.status === 'finished') prompt = t(line.auto ? 'training.nextSoon' : 'training.browseHint');
    else if (!userTurn) prompt = t('training.opponentPlays');
    else if (follow && target) prompt = t('training.followLine', { move: sanOf(fenAt(line.plies), target[0]) });
    else prompt = t('training.yourTurn', { color: colorLabel(side) });
    const fb = line.feedback;
    const showHint = canMove && line.wrong === 1 && !line.hint && !follow;
    let banner: ReactNode = null;
    if (atMistake && userTurn && f) {
      const move = f.played ? moveLabel(f.played.san, f.path.length) : '';
      banner = (
        <div className="train-banner">
          {f.played
            ? t(f.w.kind === 'engine' ? 'training.bannerEngine' : 'training.bannerDeviation', { move })
            : t('training.bannerGeneric')}
        </div>
      );
    }
    status = (
      <>
        {banner}
        {fb ? (
          <div className={`feedback ${fb.kind}`}>
            {msg(fb.text)}
            {fb.notes?.map((n, i) => (
              <p key={i} className="train-note">
                {msg(n)}
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
              <button type="button" className="btn small" onClick={() => setLine({ ...lineRef.current, hint: true })}>
                <Icon name="target" size={16} />
                {t('training.hint')}
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

  // Focused line: the next mistake still open, after the current one.
  let nextMistake: Weakness | null = null;
  if (f) {
    const i = mistakes.findIndex((x) => x.w.id === f.w.id);
    const rotated = i < 0 ? mistakes : [...mistakes.slice(i + 1), ...mistakes.slice(0, i)];
    nextMistake = rotated.find((x) => !x.done && x.w.id !== f.w.id)?.w ?? null;
  }
  const focusItem = f ? mistakes.find((x) => x.w.id === f.w.id) : undefined;

  const viewButton = (
    <button
      type="button"
      className="btn small ghost"
      onClick={() => openInExplorer(line.plies.slice(0, cursor).map((p) => p.uci), side)}
    >
      <Icon name="eye" size={16} />
      {t('training.viewInExplorer')}
    </button>
  );

  const buttons = f ? (
    <div className="row">
      <button type="button" className="btn small" onClick={() => startLine(true)} disabled={!active}>
        <Icon name="reset" size={16} />
        {t('training.replay')}
      </button>
      <button
        type="button"
        className={`btn small ${finished ? 'primary' : ''}`}
        title={t('training.nextMistakeTitle')}
        disabled={!nextMistake}
        onClick={() => nextMistake && workOn(nextMistake)}
      >
        <Icon name="next" size={16} />
        {t('training.nextLine')}
      </button>
      <button type="button" className={`btn small ${finished && !nextMistake ? 'primary' : 'ghost'}`} onClick={() => startLine()}>
        {t('training.backToList')}
      </button>
      {viewButton}
    </div>
  ) : (
    <div className="row">
      <button type="button" className="btn small" onClick={() => startLine(true)} disabled={!active}>
        <Icon name="reset" size={16} />
        {t('training.restartLine')}
      </button>
      <button type="button" className={`btn small ${finished ? 'primary' : ''}`} onClick={() => startLine()} disabled={!canNext}>
        <Icon name="next" size={16} />
        {t('training.nextLine')}
      </button>
      {viewButton}
    </div>
  );

  const boardFen = listPhase ? fenAt(previewPlies) : fen;
  const boardLast = listPhase ? previewPlies[previewPlies.length - 1]?.uci : lastMove;
  const boardArrows = listPhase ? (previewW?.arrows ?? NO_ARROWS) : arrows;

  return (
    <div className="board-layout training">
      <div className="board-col">
        <Board
          fen={boardFen}
          orientation={side}
          lastMove={boardLast}
          movable={canMove ? side : undefined}
          onMove={onUserMove}
          arrows={boardArrows}
        />
      </div>

      <div className="side-col">
        <section className="panel">
          <div className="panel-head">
            <h3>{t('training.title')}</h3>
            <span className="grow" />
            {mode !== 'mistakes' && openCount > 0 && (
              <span className="tag red" title={t('training.openMistakesTitle')}>
                {t('training.openMistakes', { count: openCount })}
              </span>
            )}
            <span className="tag" title={t('training.cardsTitle')}>
              {t('common.positions', { count: counts.cards })}
            </span>
            <span className={`tag ${counts.due ? 'yellow' : 'green'}`} title={t('training.dueTitle')}>
              {t('training.due', { count: counts.due })}
            </span>
          </div>
          <div className="row">
            {sideSeg}
            {modeSeg}
          </div>
          <p className="muted small">{t(`training.modeHelp.${mode}`)}</p>
          {mode !== 'mistakes' && rootPlies.length > 0 && (
            <div className="train-root">
              <span className="muted small">{t('training.trainFrom')}</span>
              <span className="train-root-line">{formatLine(rootPlies.map((p) => p.san))}</span>
              <button type="button" className="btn small ghost" onClick={resetRoot} title={t('training.fromStartTitle')}>
                <Icon name="reset" size={14} />
                {t('training.fromStart')}
              </button>
            </div>
          )}
        </section>

        {listPhase ? (
          mistakesPanel
        ) : (
          <>
            {f && (
              <section className="panel train-focus">
                <div className="panel-head">
                  <span className="panel-title">{t('training.focusTitle')}</span>
                  <span className="grow" />
                  {mistakes.length > 0 && (
                    <span className={`tag ${openCount ? 'red' : 'green'}`}>{t('training.remaining', { count: openCount })}</span>
                  )}
                </div>
                <div className="row">
                  <LevelTag w={f.w} />
                  {focusItem && <StateTags item={focusItem} />}
                </div>
                <div className="mistake-title">{describeWeakness(f.w).title}</div>
                <div className="mistake-line" title={t('training.lineToPosition')}>
                  {f.path.length ? formatLine(f.path.map((p) => p.san)) : t('common.startPosition')}
                </div>
                {isQuiz(rep, f.w) && <p className="muted small">{t('training.quizNote')}</p>}
              </section>
            )}

            <section className="panel">
              <div className="opening-name">
                {opening ? (
                  <>
                    <span className="eco">{opening.eco}</span>
                    {opening.name}
                  </>
                ) : (
                  <span className="muted">{t(cursor ? 'common.unknownOpening' : 'common.startPosition')}</span>
                )}
              </div>
              {status}
              {buttons}
            </section>

            <section className="panel">
              <div className="panel-head">
                <span className="panel-title">{t('training.lineTitle')}</span>
              </div>
              <MoveList plies={line.plies} cursor={cursor} onGo={onGo} dimBefore={f ? 0 : rootPlies.length} />
            </section>

            {f && mistakesPanel}
          </>
        )}

        <section className="panel">
          <div className="panel-head">
            <span className="panel-title">{t('training.session')}</span>
            <span className="grow" />
            <button
              type="button"
              className="btn small ghost"
              onClick={resetStats}
              disabled={!session.lines && !session.positions && !session.mistakes}
            >
              {t('training.resetStats')}
            </button>
          </div>
          <div className="train-stats">
            <div className="train-stat">
              <strong>{session.lines}</strong>
              <span>{t('training.statLines', { count: session.lines })}</span>
            </div>
            <div className="train-stat">
              <strong>
                {session.firstTry}
                <small> / {session.positions}</small>
              </strong>
              <span>{t('training.statFirstTry')}</span>
            </div>
            <div className="train-stat">
              <strong className={session.mistakes ? 'error' : ''}>{session.mistakes}</strong>
              <span>{t('training.statMistakes', { count: session.mistakes })}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
