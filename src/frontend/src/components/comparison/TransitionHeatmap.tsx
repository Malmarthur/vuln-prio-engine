const PRIORITY_ORDER = ['V0', 'V1', 'V2', 'V3', 'A0', 'A1', 'A2', 'A3', 'P0', 'P1', 'P2', 'P3', 'UNSCORED'];

export default function TransitionHeatmap({ matrix }: { matrix: Record<string, Record<string, number>> }) {
  const labels = Array.from(new Set([...Object.keys(matrix), ...Object.values(matrix).flatMap((row) => Object.keys(row))]))
    .sort((a, b) => PRIORITY_ORDER.indexOf(a) - PRIORITY_ORDER.indexOf(b));
  const max = Math.max(...Object.values(matrix).flatMap((row) => Object.values(row)), 1);
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[300px]" role="table" aria-label="Priority transition matrix">
        <div className="mb-2 grid items-end gap-1" style={{ gridTemplateColumns: `58px repeat(${labels.length}, minmax(38px,1fr))` }}>
          <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">From ↓</span>
          {labels.map((label) => <span key={label} className="text-center text-[10px] font-semibold text-slate-500">{label}</span>)}
        </div>
        {labels.map((from) => (
          <div key={from} className="mb-1 grid gap-1" style={{ gridTemplateColumns: `58px repeat(${labels.length}, minmax(38px,1fr))` }}>
            <span className="flex items-center text-[10px] font-semibold text-slate-500">{from}</span>
            {labels.map((to) => {
              const value = matrix[from]?.[to] ?? 0;
              const intensity = value / max;
              return (
                <div
                  key={`${from}-${to}`}
                  className={`flex aspect-square min-h-9 items-center justify-center rounded-md text-[10px] font-semibold tabular-nums ${intensity > 0.58 ? 'text-white' : 'text-slate-600'}`}
                  style={{ backgroundColor: value ? `rgba(79,70,229,${0.08 + intensity * 0.84})` : 'rgb(248 250 252)' }}
                  title={`${from} → ${to}: ${value.toLocaleString()}`}
                  role="cell"
                >{value ? compact(value) : '·'}</div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function compact(value: number) {
  return value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k` : value.toLocaleString();
}
