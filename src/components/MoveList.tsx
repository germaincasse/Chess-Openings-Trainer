import { useEffect, useRef } from 'react';
import type { MoveClass } from '../engine/evaluation';
import { useT } from '../i18n';
import type { Ply } from '../lib/chess';
import { EvalMini, MoveBadge } from './MoveBadge';

interface Props {
  plies: Ply[];
  cursor: number;
  onGo: (cursor: number) => void;
  /** Marks moves that belong to the repertoire. */
  inRep?: (index: number) => boolean;
  /** Moves before this index are greyed (e.g. the training starting line). */
  dimBefore?: number;
  /** Engine evaluation (White's point of view) and quality of a move, when known. */
  quality?: (index: number) => { cp: number; cls: MoveClass } | undefined;
}

export function MoveList({ plies, cursor, onGo, inRep, dimBefore = 0, quality }: Props) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    box.current?.querySelector('.mv.active')?.scrollIntoView({ block: 'nearest' });
  }, [cursor, plies.length]);

  const rows = [];
  for (let i = 0; i < plies.length; i += 2) {
    rows.push(
      <div className="mv-row" key={i}>
        <span className="mv-num">{i / 2 + 1}.</span>
        {[i, i + 1].map((j) => {
          if (j >= plies.length) return <span key={j} className="mv empty" />;
          const q = quality?.(j);
          return (
            <button
              key={j}
              className={`mv ${cursor === j + 1 ? 'active' : ''} ${inRep?.(j) ? 'book' : ''} ${j < dimBefore ? 'dim' : ''}`}
              onClick={() => onGo(j + 1)}
            >
              <span className="mv-san">{plies[j].san}</span>
              {q && <MoveBadge cls={q.cls} />}
              {q && <EvalMini cp={q.cp} />}
            </button>
          );
        })}
      </div>,
    );
  }

  return (
    <div className="movelist" ref={box}>
      {plies.length ? rows : <p className="muted small">{t('common.playAMove')}</p>}
    </div>
  );
}
