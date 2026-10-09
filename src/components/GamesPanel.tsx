import { moveQuality } from '../engine/candidates';
import { scoreOf, type OpeningTree } from '../games/tree';
import { useT } from '../i18n';
import { colorLabel } from '../lib/chess';
import { pct } from '../lib/util';
import { hasMove, type Repertoire } from '../repertoire/model';
import { setView } from '../store/store';
import { EvalMini, MoveBadge } from './MoveBadge';
import { Wdl } from './Wdl';

interface Props {
  tree: OpeningTree;
  totalGames: number;
  posKey: string;
  rep: Repertoire;
  onPlay: (uci: string) => void;
  showEval: boolean;
}

/** Moves played from this position in your own games (like the lichess personal explorer). */
export function GamesPanel({ tree, totalGames, posKey, rep, onPlay, showEval }: Props) {
  const t = useT();
  const node = tree.nodes.get(posKey);
  const total = node ? node.moves.reduce((s, m) => s + m.n, 0) : 0;

  return (
    <section className="panel">
      <header className="panel-head">
        <span className="panel-title">{t('explorer.gamesTitle', { color: colorLabel(tree.color) })}</span>
        <span className="grow" />
        {node && (
          <span className="small muted">
            {t('common.games', { count: node.n })}, {pct(scoreOf(node))}
          </span>
        )}
      </header>
      {totalGames === 0 ? (
        <p className="muted small">
          {t('explorer.importHint')}{' '}
          <button className="btn small ghost" onClick={() => setView('import')}>
            {t('explorer.importButton')}
          </button>
        </p>
      ) : !node || !node.moves.length ? (
        <p className="muted small">{t('explorer.noGamesHere')}</p>
      ) : (
        <div className="move-rows">
          {node.moves.slice(0, 12).map((m) => {
            const q = showEval ? moveQuality(posKey, m.uci) : undefined;
            return (
              <div key={m.uci} className="move-row games-move" onClick={() => onPlay(m.uci)} title={t('explorer.scoreTitle', { score: pct(scoreOf(m)) })}>
                <span className={`san ${hasMove(rep, posKey, m.uci) ? 'in-rep' : ''}`}>
                  {m.san}
                  {q && <MoveBadge cls={q.cls} />}
                </span>
                <span className="small muted">
                  {m.n} ({pct(m.n / total)})
                </span>
                <span>{q && <EvalMini cp={q.cp} />}</span>
                <Wdl s={m} />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
