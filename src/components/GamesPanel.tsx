import { scoreOf, type OpeningTree } from '../games/tree';
import { colorLabel } from '../lib/chess';
import { pct } from '../lib/util';
import { hasMove, type Repertoire } from '../repertoire/model';
import { setView } from '../store/store';
import { Wdl } from './Wdl';

interface Props {
  tree: OpeningTree;
  totalGames: number;
  posKey: string;
  rep: Repertoire;
  onPlay: (uci: string) => void;
}

/** Statistics of the moves played from this position in your own games (like the lichess personal explorer). */
export function GamesPanel({ tree, totalGames, posKey, rep, onPlay }: Props) {
  const node = tree.nodes.get(posKey);
  const total = node ? node.moves.reduce((s, m) => s + m.n, 0) : 0;

  return (
    <section className="panel">
      <header className="panel-head">
        <span className="panel-title">Mes parties avec les {colorLabel(tree.color)}</span>
        <span className="grow" />
        {node && (
          <span className="small muted">
            {node.n} parties, {pct(scoreOf(node))}
          </span>
        )}
      </header>
      {totalGames === 0 ? (
        <p className="muted small">
          Importez vos parties Lichess ou Chess.com pour voir ce que vous jouez ici.{' '}
          <button className="btn small ghost" onClick={() => setView('import')}>
            Importer
          </button>
        </p>
      ) : !node || !node.moves.length ? (
        <p className="muted small">Aucune de vos parties n'a continué depuis cette position.</p>
      ) : (
        <div className="move-rows">
          {node.moves.slice(0, 12).map((m) => (
            <div key={m.uci} className="move-row games-move" onClick={() => onPlay(m.uci)} title={`Score ${pct(scoreOf(m))}`}>
              <span className={`san ${hasMove(rep, posKey, m.uci) ? 'in-rep' : ''}`}>{m.san}</span>
              <span className="small muted">
                {m.n} ({pct(m.n / total)})
              </span>
              <Wdl s={m} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
