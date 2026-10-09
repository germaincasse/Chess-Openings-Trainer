import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Chess } from 'chess.js';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { DrawShape } from 'chessground/draw';
import type { Key } from 'chessground/types';
import { fenTurn, legalDests, type Color } from '../lib/chess';

export interface BoardArrow {
  uci: string;
  brush: string;
  width?: number;
}

interface Props {
  fen: string;
  orientation: Color;
  lastMove?: string;
  /** Side allowed to move; undefined makes the board read-only. */
  movable?: Color | 'both';
  onMove?: (uci: string) => void;
  arrows?: BoardArrow[];
}

const PROMOTIONS = ['q', 'n', 'r', 'b'] as const;
const ROLE = { q: 'queen', n: 'knight', r: 'rook', b: 'bishop' } as const;

function toShapes(arrows: BoardArrow[]): DrawShape[] {
  return arrows.map((a) => ({
    orig: a.uci.slice(0, 2) as Key,
    dest: a.uci.slice(2, 4) as Key,
    brush: a.brush,
    modifiers: a.width ? { lineWidth: a.width } : undefined,
  }));
}

/** chessground board (lichess UI): drag and drop, click-click, right-click arrows and circles. */
export function Board({ fen, orientation, lastMove, movable, onMove, arrows = [] }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const props = useRef({ fen, onMove });
  props.current = { fen, onMove };
  const [promo, setPromo] = useState<{ from: string; to: string; color: Color } | null>(null);

  const chess = useMemo(() => new Chess(fen), [fen]);
  const turn = fenTurn(fen);

  const sync = () => {
    const c = new Chess(props.current.fen);
    api.current?.set({ fen: props.current.fen, turnColor: fenTurn(props.current.fen), check: c.inCheck(), movable: { dests: legalDests(c) } });
  };

  useEffect(() => {
    if (!el.current) return;
    api.current = Chessground(el.current, {
      animation: { enabled: true, duration: 180 },
      highlight: { lastMove: true, check: true },
      premovable: { enabled: false },
      draggable: { showGhost: true },
      drawable: { enabled: true, visible: true, defaultSnapToValidMove: true },
      movable: {
        free: false,
        showDests: true,
        events: {
          after: (orig, dest) => {
            const c = new Chess(props.current.fen);
            const piece = c.get(orig as never);
            if (piece?.type === 'p' && (dest[1] === '8' || dest[1] === '1')) {
              setPromo({ from: orig, to: dest, color: piece.color === 'w' ? 'white' : 'black' });
              return;
            }
            props.current.onMove?.(orig + dest);
            // The parent may refuse the move: resynchronise once React has re-rendered.
            setTimeout(sync, 0);
          },
        },
      },
    });
    // chessground caches the board rectangle and only refreshes it on scroll and window resize.
    // Any other layout shift (eval bar shown, scrollbar appearing, panels growing, zoom) would
    // misalign clicks and pieces: measure again at every press, before chessground handles it.
    const refreshBounds = () => api.current?.state.dom.bounds.clear();
    const opts = { capture: true, passive: true };
    const target = el.current;
    for (const ev of ['mousedown', 'touchstart'] as const) target.addEventListener(ev, refreshBounds, opts);
    return () => {
      for (const ev of ['mousedown', 'touchstart'] as const) target.removeEventListener(ev, refreshBounds, opts);
      api.current?.destroy();
    };
  }, []);

  useEffect(() => {
    api.current?.set({
      fen,
      orientation,
      turnColor: turn,
      check: chess.inCheck(),
      lastMove: lastMove ? ([lastMove.slice(0, 2), lastMove.slice(2, 4)] as Key[]) : undefined,
      movable: {
        color: movable,
        dests: movable ? legalDests(chess) : new Map(),
      },
    });
  }, [fen, orientation, movable, lastMove, chess, turn]);

  useEffect(() => {
    api.current?.setAutoShapes(toShapes(arrows));
  }, [arrows]);

  const choosePromotion = (role: (typeof PROMOTIONS)[number] | null) => {
    const p = promo;
    setPromo(null);
    if (p && role) props.current.onMove?.(p.from + p.to + role);
    setTimeout(sync, 0);
  };

  let promoStyle: CSSProperties | undefined;
  if (promo) {
    const file = promo.to.charCodeAt(0) - 97;
    const col = orientation === 'white' ? file : 7 - file;
    const top = (promo.to[1] === '8') === (orientation === 'white');
    promoStyle = top ? { left: `${col * 12.5}%`, top: 0 } : { left: `${col * 12.5}%`, bottom: 0, flexDirection: 'column-reverse' };
  }

  return (
    <div className="board-frame">
      <div ref={el} className="board" />
      {promo && (
        <div className="promo-overlay" onClick={() => choosePromotion(null)}>
          <div className="promo-choices cg-wrap" style={promoStyle} onClick={(e) => e.stopPropagation()}>
            {PROMOTIONS.map((r) => (
              <button key={r} className="promo-choice" onClick={() => choosePromotion(r)}>
                <PieceImg role={ROLE[r]} color={promo.color} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


/** chessground piece sets style <piece> elements, which React does not know: create it by hand. */
function PieceImg({ role, color }: { role: string; color: Color }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = document.createElement('piece');
    el.className = `${role} ${color}`;
    ref.current?.replaceChildren(el);
  }, [role, color]);
  return <span ref={ref} />;
}
