import { useEffect, useState } from 'react';
import { colorLabel } from '../lib/chess';
import { inRepertoire, isOwnerTurn, makeMain, removalCost, removeMove, setComment, type Repertoire } from '../repertoire/model';
import { repsChanged, toast } from '../store/store';
import { Icon } from './Icon';

interface Props {
  rep: Repertoire;
  posKey: string;
  onPlay: (uci: string) => void;
  onAddLine: () => void;
  canAddLine: boolean;
}

/** Repertoire moves prepared in the current position. */
export function RepPanel({ rep, posKey, onPlay, onAddLine, canAddLine }: Props) {
  const node = rep.nodes[posKey];
  const moves = node?.moves ?? [];
  const mine = isOwnerTurn(rep, posKey);
  const [comment, setCommentText] = useState(node?.comment ?? '');

  useEffect(() => setCommentText(node?.comment ?? ''), [posKey, node?.comment]);

  const remove = (uci: string, san: string) => {
    const lost = removalCost(rep, posKey, uci);
    if (lost > 2 && !confirm(`Retirer ${san} supprime aussi ${lost - 1} positions qui en découlent. Continuer ?`)) return;
    removeMove(rep, posKey, uci);
    repsChanged();
    toast(`${san} retiré du répertoire`);
  };

  const saveComment = () => {
    if ((node?.comment ?? '') === comment.trim()) return;
    setComment(rep, posKey, comment);
    repsChanged();
  };

  return (
    <section className="panel">
      <header className="panel-head">
        <span className="panel-title">Répertoire {colorLabel(rep.color)}</span>
        <span className="grow" />
        <button className="btn small" onClick={onAddLine} disabled={!canAddLine} title="Ajouter tous les coups de la ligne jusqu'à cette position">
          <Icon name="plus" size={14} /> Ajouter la ligne
        </button>
      </header>
      {!inRepertoire(rep, posKey) ? (
        <p className="muted small">Position hors de votre répertoire.</p>
      ) : moves.length === 0 ? (
        <p className="muted small">Fin de ligne : jouez un coup pour la prolonger{mine ? ' avec votre réponse' : ''}.</p>
      ) : (
        <>
          <p className="muted small">{mine ? 'Votre coup ici :' : 'Réponses adverses préparées :'}</p>
          <div className="move-rows">
            {moves.map((m, i) => (
              <div key={m.uci} className="move-row rep-move" onClick={() => onPlay(m.uci)}>
                <span className="san">{m.san}</span>
                <span className="small muted">
                  {i === 0 && moves.length > 1 ? 'principal' : ''}
                  {m.source === 'import' ? ' importé' : ''}
                </span>
                <span className="row" onClick={(e) => e.stopPropagation()}>
                  {i > 0 && (
                    <button className="icon-btn small" title="Mettre en coup principal" onClick={() => (makeMain(rep, posKey, m.uci), repsChanged())}>
                      <Icon name="star" size={14} />
                    </button>
                  )}
                  <button className="icon-btn small" title="Retirer du répertoire" onClick={() => remove(m.uci, m.san)}>
                    <Icon name="trash" size={14} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
      {inRepertoire(rep, posKey) && (
        <textarea
          className="rep-comment"
          placeholder="Note sur cette position (plans, pièges...)"
          value={comment}
          onChange={(e) => setCommentText(e.target.value)}
          onBlur={saveComment}
          rows={2}
        />
      )}
    </section>
  );
}
