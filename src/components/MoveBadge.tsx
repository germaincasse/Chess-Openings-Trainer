import type { MoveClass } from '../engine/evaluation';
import { formatCp } from '../engine/evaluation';
import { useT } from '../i18n';

const GLYPH: Record<MoveClass, string> = {
  best: '',
  excellent: '!',
  good: '',
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??',
};

/** chess.com-like move quality marker. */
export function MoveBadge({ cls }: { cls: MoveClass }) {
  const t = useT();
  return (
    <span className={`mq mq-${cls}`} title={t(`common.class.${cls}`)}>
      {cls === 'best' ? (
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z" fill="currentColor" />
        </svg>
      ) : cls === 'good' ? (
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M6 12.5l4 4 8-9" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        GLYPH[cls]
      )}
    </span>
  );
}

/** Evaluation from White's point of view, compact. */
export function EvalMini({ cp }: { cp: number }) {
  return <span className={`eval-mini ${cp >= 0 ? 'pos' : 'neg'}`}>{formatCp(cp)}</span>;
}
