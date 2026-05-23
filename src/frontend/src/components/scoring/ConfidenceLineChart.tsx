import { useMemo } from 'react';
import { fillBuckets } from './helpers';

// Layout constants never change — defined at module level to keep useMemo deps clean
const W = 320, H = 110;
const pL = 36, pR = 8, pT = 8, pB = 18;
const iW = W - pL - pR;
const iH = H - pT - pB;
const bottomY = pT + iH;

/** Confidence distribution — simple indigo line chart. */
export default function ConfidenceLineChart({
  data,
}: {
  data: Array<{ bucket: string; count: number }>;
}) {
  const { pts, maxC, ptStr, areaStr } = useMemo(() => {
    const pts = fillBuckets(data);
    const maxC = Math.max(...pts.map((p) => p.count), 1);
    const sx = (x: number) => pL + (x / 100) * iW;
    const sy = (c: number) => pT + iH - (c / maxC) * iH;
    const ptStr = pts.map((p) => `${sx(p.x)},${sy(p.count)}`).join(' ');
    const areaStr = `${sx(pts[0].x)},${bottomY} ${ptStr} ${sx(pts[pts.length - 1].x)},${bottomY}`;
    return { pts, maxC, ptStr, areaStr };
  }, [data]);

  const sx = (x: number) => pL + (x / 100) * iW;
  const sy = (c: number) => pT + iH - (c / maxC) * iH;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible">
      {/* Horizontal grid lines */}
      {[0.25, 0.5, 0.75].map((r) => (
        <line key={r} x1={pL} y1={sy(maxC * r)} x2={W - pR} y2={sy(maxC * r)}
          stroke="#e5e7eb" strokeWidth={1} />
      ))}

      {/* Filled area */}
      <polygon points={areaStr} fill="#818cf8" opacity={0.18} />

      {/* Line */}
      <polyline points={ptStr} fill="none" stroke="#6366f1" strokeWidth={2}
        strokeLinejoin="round" strokeLinecap="round" />

      {/* Data point circles */}
      {pts.map((p) => {
        if (p.count === 0) return null;
        return (
          <circle key={p.x} cx={sx(p.x)} cy={sy(p.count)} r={3}
            fill="white" stroke="#6366f1" strokeWidth={1.5}>
            <title>{p.count.toLocaleString()} CVEs — confidence {p.x - 5}–{p.x + 5}%</title>
          </circle>
        );
      })}

      {/* Axes */}
      <line x1={pL} y1={bottomY} x2={W - pR} y2={bottomY} stroke="#d1d5db" strokeWidth={1} />
      <line x1={pL} y1={pT}      x2={pL}     y2={bottomY} stroke="#d1d5db" strokeWidth={1} />

      {/* X axis labels */}
      {[0, 25, 50, 75, 100].map((x) => (
        <text key={x} x={sx(x)} y={H - 2} textAnchor="middle" fontSize={9} fill="#9ca3af">{x}%</text>
      ))}

      {/* Y axis max */}
      <text x={pL - 3} y={pT + 5} textAnchor="end" fontSize={9} fill="#9ca3af">
        {maxC >= 1000 ? `${Math.round(maxC / 1000)}k` : maxC}
      </text>
    </svg>
  );
}
