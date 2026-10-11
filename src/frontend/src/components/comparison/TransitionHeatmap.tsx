import { PriorityBadge, priorityTier } from '../../lib/priority';

// Cell intensity uses the neutral accent; priority colors only label the axes.
const CELL_RGB = '41, 71, 99';

function orderLevels(a: string, b: string) {
  if (a === 'UNSCORED') return 1;
  if (b === 'UNSCORED') return -1;
  return (priorityTier(a) ?? 9) - (priorityTier(b) ?? 9) || a.localeCompare(b);
}

export interface HeatmapSelection {
  from: string;
  to: string;
}

/**
 * Reference priority (rows) × candidate priority (columns). When `onSelect` is
 * given, cells and headers are buttons: a cell selects both levels, a header one.
 */
export default function TransitionHeatmap({
  matrix,
  selection,
  onSelect,
}: {
  matrix: Record<string, Record<string, number>>;
  selection?: HeatmapSelection;
  onSelect?: (selection: HeatmapSelection) => void;
}) {
  const labels = Array.from(new Set([...Object.keys(matrix), ...Object.values(matrix).flatMap((row) => Object.keys(row))])).sort(orderLevels);
  const max = Math.max(...Object.values(matrix).flatMap((row) => Object.values(row)), 1);
  const columns = `64px repeat(${labels.length}, minmax(44px,1fr))`;
  const from = selection?.from ?? '';
  const to = selection?.to ?? '';
  const active = Boolean(from || to);
  const matches = (row: string, column: string) => (!from || from === row) && (!to || to === column);
  const name = (level: string) => (level === 'UNSCORED' ? 'N/A' : level);
  const header = (level: string, axis: 'from' | 'to') => {
    const badge = <PriorityBadge level={level} label={name(level)} />;
    if (!onSelect) return badge;
    const pressed = axis === 'from' ? from === level : to === level;
    return (
      <button
        type="button"
        aria-pressed={pressed}
        aria-label={`${axis === 'from' ? 'From' : 'To'} ${name(level)}`}
        onClick={() => onSelect(axis === 'from' ? { from: pressed ? '' : level, to } : { from, to: pressed ? '' : level })}
        className={`p-0.5 ${pressed ? 'outline outline-2 outline-gray-900' : 'hover:outline hover:outline-1 hover:outline-gray-400'}`}
      >{badge}</button>
    );
  };
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[300px]" role="table" aria-label="Priority transition matrix">
        <div className="mb-1 grid items-end gap-px" style={{ gridTemplateColumns: columns }} role="row">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">From \ To</span>
          {labels.map((label) => <span key={label} className="flex justify-center" role="columnheader">{header(label, 'to')}</span>)}
        </div>
        <div className="grid gap-px bg-gray-200 p-px" style={{ gridTemplateColumns: columns }}>
          {labels.map((row) => [
            <span key={`${row}-label`} className="flex items-center bg-white pr-2" role="rowheader">{header(row, 'from')}</span>,
            ...labels.map((column) => {
              const value = matrix[row]?.[column] ?? 0;
              const intensity = value / max;
              const diagonal = row === column;
              const selected = active && matches(row, column);
              const exact = from === row && to === column;
              const className = `flex min-h-10 w-full items-center justify-center font-mono text-[11px] font-medium ${intensity > 0.5 ? 'text-white' : 'text-gray-700'} ${selected ? 'outline outline-2 -outline-offset-2 outline-gray-950' : diagonal ? 'outline outline-1 -outline-offset-2 outline-gray-900/40' : ''} ${active && !selected ? 'opacity-35' : ''}`;
              const style = { backgroundColor: value ? `rgba(${CELL_RGB}, ${0.07 + intensity * 0.88})` : '#ffffff' };
              const content = value ? compact(value) : <span className="text-gray-300">·</span>;
              const title = `${name(row)} → ${name(column)}: ${value.toLocaleString()}`;
              if (!onSelect) return <div key={`${row}-${column}`} className={className} style={style} title={title} role="cell">{content}</div>;
              return (
                <div key={`${row}-${column}`} role="cell" className="flex">
                  <button
                    type="button"
                    aria-pressed={exact}
                    aria-label={title}
                    title={`${title} — click to filter`}
                    onClick={() => onSelect(exact ? { from: '', to: '' } : { from: row, to: column })}
                    className={`${className} cursor-pointer transition-opacity hover:opacity-100 focus-visible:outline-accent-600`}
                    style={style}
                  >{content}</button>
                </div>
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
