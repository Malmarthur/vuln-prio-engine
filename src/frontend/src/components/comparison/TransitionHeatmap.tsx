import { PriorityBadge, priorityTier } from '../../lib/priority';

// Cell intensity uses the neutral accent; priority colors only label the axes.
const CELL_RGB = '41, 71, 99';

function orderLevels(a: string, b: string) {
  if (a === 'UNSCORED') return 1;
  if (b === 'UNSCORED') return -1;
  return (priorityTier(a) ?? 9) - (priorityTier(b) ?? 9) || a.localeCompare(b);
}

export default function TransitionHeatmap({ matrix }: { matrix: Record<string, Record<string, number>> }) {
  const labels = Array.from(new Set([...Object.keys(matrix), ...Object.values(matrix).flatMap((row) => Object.keys(row))])).sort(orderLevels);
  const max = Math.max(...Object.values(matrix).flatMap((row) => Object.values(row)), 1);
  const columns = `64px repeat(${labels.length}, minmax(44px,1fr))`;
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[300px]" role="table" aria-label="Priority transition matrix">
        <div className="mb-1 grid items-end gap-px" style={{ gridTemplateColumns: columns }} role="row">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">From \ To</span>
          {labels.map((label) => <span key={label} className="flex justify-center" role="columnheader"><PriorityBadge level={label} label={label === 'UNSCORED' ? 'N/A' : label} /></span>)}
        </div>
        <div className="grid gap-px bg-gray-200 p-px" style={{ gridTemplateColumns: columns }}>
          {labels.map((from) => [
            <span key={`${from}-label`} className="flex items-center bg-white pr-2" role="rowheader"><PriorityBadge level={from} label={from === 'UNSCORED' ? 'N/A' : from} /></span>,
            ...labels.map((to) => {
              const value = matrix[from]?.[to] ?? 0;
              const intensity = value / max;
              const diagonal = from === to;
              return (
                <div
                  key={`${from}-${to}`}
                  className={`flex min-h-10 items-center justify-center font-mono text-[11px] font-medium ${intensity > 0.5 ? 'text-white' : 'text-gray-700'} ${diagonal ? 'outline outline-1 -outline-offset-2 outline-gray-900/40' : ''}`}
                  style={{ backgroundColor: value ? `rgba(${CELL_RGB}, ${0.07 + intensity * 0.88})` : '#ffffff' }}
                  title={`${from} → ${to}: ${value.toLocaleString()}`}
                  role="cell"
                >{value ? compact(value) : <span className="text-gray-300">·</span>}</div>
              );
            }),
          ])}
        </div>
      </div>
    </div>
  );
}

function compact(value: number) {
  return value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k` : value.toLocaleString();
}
