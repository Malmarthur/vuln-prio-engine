import { fillBuckets } from './helpers';

/** Score distribution — colored by priority zone. */
export default function ScoreLineChart({
  data,
  thresholds,
}: {
  data: Array<{ bucket: string; count: number }>;
  thresholds: Record<string, number>;
}) {
  const W = 320, H = 110;
  const pL = 36, pR = 8, pT = 8, pB = 18;
  const iW = W - pL - pR;
  const iH = H - pT - pB;
  const bottomY = pT + iH;

  const pts = fillBuckets(data);
  const maxC = Math.max(...pts.map((p) => p.count), 1);

  const sx = (x: number) => pL + (x / 100) * iW;
  const sy = (c: number) => pT + iH - (c / maxC) * iH;

  const ptStr = pts.map((p) => `${sx(p.x)},${sy(p.count)}`).join(' ');
  const areaStr = `${sx(pts[0].x)},${bottomY} ${ptStr} ${sx(pts[pts.length - 1].x)},${bottomY}`;

  const t = thresholds;
  const zones = [
    { id: 'v3', lo: 0,             hi: t['V2'] ?? 26, stroke: '#16a34a', fill: '#22c55e' },
    { id: 'v2', lo: t['V2'] ?? 26, hi: t['V1'] ?? 51, stroke: '#ca8a04', fill: '#eab308' },
    { id: 'v1', lo: t['V1'] ?? 51, hi: t['V0'] ?? 76, stroke: '#ea580c', fill: '#f97316' },
    { id: 'v0', lo: t['V0'] ?? 76, hi: 100,            stroke: '#dc2626', fill: '#ef4444' },
  ];

  const getZone = (x: number) =>
    zones.find((z) => x >= z.lo && x < z.hi) ?? zones[zones.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible">
      <defs>
        {zones.map((z) => (
          <clipPath key={z.id} id={`csc-${z.id}`}>
            <rect x={sx(z.lo)} y={0} width={Math.max(0, sx(z.hi) - sx(z.lo))} height={H} />
          </clipPath>
        ))}
      </defs>

      {/* Zone background bands */}
      {zones.map((z) => (
        <rect key={z.id} x={sx(z.lo)} y={pT}
          width={Math.max(0, sx(z.hi) - sx(z.lo))} height={iH}
          fill={z.fill} opacity={0.07} />
      ))}

      {/* Horizontal grid lines */}
      {[0.25, 0.5, 0.75].map((r) => (
        <line key={r} x1={pL} y1={sy(maxC * r)} x2={W - pR} y2={sy(maxC * r)}
          stroke="#e5e7eb" strokeWidth={1} />
      ))}

      {/* Threshold vertical dashes */}
      {['V0', 'V1', 'V2'].map((level) => {
        const tv = t[level];
        if (tv == null) return null;
        return (
          <line key={level} x1={sx(tv)} y1={pT} x2={sx(tv)} y2={bottomY}
            stroke="#d1d5db" strokeWidth={1} strokeDasharray="3,2" />
        );
      })}

      {/* Filled area under the curve — per zone */}
      {zones.map((z) => (
        <polygon key={z.id} clipPath={`url(#csc-${z.id})`}
          points={areaStr} fill={z.fill} opacity={0.2} />
      ))}

      {/* Colored line segments — per zone */}
      {zones.map((z) => (
        <polyline key={z.id} clipPath={`url(#csc-${z.id})`}
          points={ptStr} fill="none" stroke={z.stroke} strokeWidth={2}
          strokeLinejoin="round" strokeLinecap="round" />
      ))}

      {/* Data point circles */}
      {pts.map((p) => {
        if (p.count === 0) return null;
        const z = getZone(p.x);
        return (
          <circle key={p.x} cx={sx(p.x)} cy={sy(p.count)} r={3}
            fill="white" stroke={z.stroke} strokeWidth={1.5}>
            <title>{p.count.toLocaleString()} CVEs — score {p.x - 5}–{p.x + 5}</title>
          </circle>
        );
      })}

      {/* Axes */}
      <line x1={pL} y1={bottomY} x2={W - pR} y2={bottomY} stroke="#d1d5db" strokeWidth={1} />
      <line x1={pL} y1={pT}      x2={pL}     y2={bottomY} stroke="#d1d5db" strokeWidth={1} />

      {/* X axis labels */}
      {[0, 25, 50, 75, 100].map((x) => (
        <text key={x} x={sx(x)} y={H - 2} textAnchor="middle" fontSize={9} fill="#9ca3af">{x}</text>
      ))}

      {/* Y axis max */}
      <text x={pL - 3} y={pT + 5} textAnchor="end" fontSize={9} fill="#9ca3af">
        {maxC >= 1000 ? `${Math.round(maxC / 1000)}k` : maxC}
      </text>
    </svg>
  );
}
