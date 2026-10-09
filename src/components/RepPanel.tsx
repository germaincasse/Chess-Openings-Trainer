import { useEffect, useState } from 'react';
import { moveQuality } from '../engine/candidates';
import type { OpeningTree } from '../games/tree';
import { useT } from '../i18n';
import { colorLabel } from '../lib/chess';
import { pct } from '../lib/util';
import { inRepertoire, isOwnerTurn, makeMain, removalCost, removeMove, setComment, type Repertoire } from '../repertoire/model';
import { repsChanged, toast } from '../store/store';
import { Icon } from './Icon';
import { EvalMini, MoveBadge } from './MoveBadge';

interface Props {
  rep: Repertoire;
  posKey: string;
  onPlay: (uci: string) => void;
  onAddLine: () => void;
  canAddLine: boolean;
  /** Games of the same color, for move frequencies. */
  tree: OpeningTree;
  /** Show engine evaluations and move quality. */
  showEval: boolean;
}

/** Repertoire moves prepared in the current position, with their frequency in your games and their quality. */
export function RepPanel({ rep, posKey, onPlay, onAddLine, canAddLine, tree, showEval }: Props) {
  const t = useT();
  const node = rep.nodes[posKey];
  const moves = node?.moves ?? [];
  const mine = isOwnerTurn(rep, posKey);
  const [comment, setCommentText] = useState(node?.comment ?? '');
  const played = tree.nodes.get(posKey)?.moves ?? [];
  const total = played.reduce((s, m) => s + m.n, 0);

  useEffect(() => setCommentText(node?.comment ?? ''), [posKey, node?.comment]);

  const remove = (uci: string, san: string) => {
    const lost = removalCost(rep, posKey, uci);
    if (lost > 2 && !confirm(t('explorer.removeConfirm', { san, count: lost - 1 }))) return;
    removeMove(rep, posKey, uci);
    repsChanged();
    toast(t('explorer.removed', { san }));
  };

  const saveComment = () => {
    if ((node?.comment ?? '') === comment.trim()) return;
    setComment(rep, posKey, comment);
    repsChanged();
  };

  return (
    <section className="panel">
      <header className="panel-head">
        <span className="panel-title">{t('explorer.repTitle', { color: colorLabel(rep.color) })}</span>
        <span className="grow" />
        <button className="btn small" onClick={onAddLine} disabled={!canAddLine} title={t('explorer.addLineTitle')}>
          <Icon name="plus" size={14} /> {t('explorer.addLine')}
        </button>
      </header>
      {!inRepertoire(rep, posKey) ? (
        <p className="muted small">{t('explorer.outOfRep')}</p>
      ) : moves.length === 0 ? (
        <p className="muted small">{mine ? t('explorer.lineEndMine') : t('explorer.lineEnd')}</p>
      ) : (
        <>
          <p className="muted small">{mine ? t('explorer.yourMove') : t('explorer.preparedReplies')}</p>
          <div className="move-rows">
            {moves.map((m, i) => {
              const stats = played.find((x) => x.uci === m.uci);
              const q = showEval ? moveQuality(posKey, m.uci) : undefined;
              return (
                <div key={m.uci} className="move-row rep-move" onClick={() => onPlay(m.uci)}>
                  <span className="san">
                    {m.san}
                    {q && <MoveBadge cls={q.cls} />}
                  </span>
                  <span className="small muted" title={t('explorer.freqTitle')}>
                    {stats ? `${t('common.games', { count: stats.n })} · ${pct(stats.n / total)}` : total ? t('explorer.neverPlayed') : ''}
                    {i === 0 && moves.length > 1 ? ` · ${t('explorer.main')}` : ''}
                  </span>
                  <span className="row" onClick={(e) => e.stopPropagation()}>
                    {q && <EvalMini cp={q.cp} />}
                    {i > 0 && (
                      <button className="icon-btn small" title={t('explorer.makeMain')} onClick={() => (makeMain(rep, posKey, m.uci), repsChanged())}>
                        <Icon name="star" size={14} />
                      </button>
                    )}
                    <button className="icon-btn small" title={t('explorer.remove')} onClick={() => remove(m.uci, m.san)}>
                      <Icon name="trash" size={14} />
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
      {inRepertoire(rep, posKey) && (
        <textarea
          className="rep-comment"
          placeholder={t('explorer.notePlaceholder')}
          value={comment}
          onChange={(e) => setCommentText(e.target.value)}
          onBlur={saveComment}
          rows={2}
        />
      )}
    </section>
  );
}
