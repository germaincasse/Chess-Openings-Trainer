import { useEffect, useState } from 'react';
import { Chess } from 'chess.js';
import { sharedEngine, stopSharedEngine, type EngineResult } from './engine';

/** Live analysis of the board position with the shared engine. */
export function useAnalysis(fen: string, enabled: boolean, multiPv: number, depth: number) {
  const [result, setResult] = useState<EngineResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      stopSharedEngine();
      setResult(null);
      return;
    }
    if (new Chess(fen).isGameOver()) {
      stopSharedEngine();
      setResult(null);
      return;
    }
    let alive = true;
    const engine = sharedEngine();
    const onUpdate = (r: EngineResult) => {
      if (alive && !r.cancelled) setResult(r);
    };
    engine.analyzeNow(fen, { multiPv, depth }, onUpdate).then((r) => {
      if (!alive) return;
      if (engine.error) setError(engine.error);
      else if (!r.cancelled) setResult(r);
    });
    return () => {
      alive = false;
    };
  }, [fen, enabled, multiPv, depth]);

  return { result, error };
}
