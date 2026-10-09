import type { EngineLine } from '../engine/engine';
import { formatEval, lineCp, winPct } from '../engine/evaluation';
import type { Color } from '../lib/chess';

export function EvalBar({ line, orientation }: { line?: EngineLine; orientation: Color }) {
  let white = 50;
  if (line) {
    if (line.mate !== undefined) white = line.mate > 0 ? 100 : line.mate < 0 ? 0 : 50;
    else white = winPct(lineCp(line));
  }
  const whiteAhead = white >= 50;
  return (
    <div className={`evalbar ${orientation === 'black' ? 'flipped' : ''}`} title="Évaluation Stockfish">
      <div className="evalbar-white" style={{ height: `${white}%` }} />
      {line && (
        <span className={`evalbar-label ${whiteAhead ? 'on-white' : 'on-black'}`}>{formatEval(line).replace('+', '')}</span>
      )}
    </div>
  );
}
