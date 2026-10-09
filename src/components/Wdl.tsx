import type { Stats } from '../games/tree';

/** Win / draw / loss bar from the owner's point of view. */
export function Wdl({ s }: { s: Stats }) {
  if (!s.n) return <div className="wdl" />;
  const part = (x: number) => (x / s.n) * 100;
  const label = (x: number) => (part(x) >= 14 ? `${Math.round(part(x))}%` : '');
  return (
    <div className="wdl" title={`${s.w} victoires, ${s.d} nulles, ${s.l} défaites`}>
      <span className="w" style={{ width: `${part(s.w)}%` }}>{label(s.w)}</span>
      <span className="d" style={{ width: `${part(s.d)}%` }}>{label(s.d)}</span>
      <span className="l" style={{ width: `${part(s.l)}%` }}>{label(s.l)}</span>
    </div>
  );
}
