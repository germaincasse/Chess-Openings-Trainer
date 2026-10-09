import { useEffect, useRef } from 'react';
import type { Ply } from '../lib/chess';

interface Props {
  plies: Ply[];
  cursor: number;
  onGo: (cursor: number) => void;
  /** Marks moves that belong to the repertoire. */
  inRep?: (index: number) => boolean;
  /** Moves before this index are greyed (e.g. the training starting line). */
  dimBefore?: number;
}

export function MoveList({ plies, cursor, onGo, inRep, dimBefore = 0 }: Props) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    box.current?.querySelector('.mv.active')?.scrollIntoView({ block: 'nearest' });
  }, [cursor, plies.length]);

  const rows = [];
  for (let i = 0; i < plies.length; i += 2) {
    rows.push(
      <div className="mv-row" key={i}>
        <span className="mv-num">{i / 2 + 1}.</span>
        {[i, i + 1].map((j) =>
          j < plies.length ? (
            <button
              key={j}
              className={`mv ${cursor === j + 1 ? 'active' : ''} ${inRep?.(j) ? 'book' : ''} ${j < dimBefore ? 'dim' : ''}`}
              onClick={() => onGo(j + 1)}
            >
              {plies[j].san}
            </button>
          ) : (
            <span key={j} className="mv empty" />
          ),
        )}
      </div>,
    );
  }

  return (
    <div className="movelist" ref={box}>
      {plies.length ? rows : <p className="muted small">Jouez un coup sur l'échiquier.</p>}
    </div>
  );
}
