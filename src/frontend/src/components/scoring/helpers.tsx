// ---------------------------------------------------------------------------
// Shared helpers for the Scoring panel
// ---------------------------------------------------------------------------

export const PRIORITY_COLORS: Record<string, { bar: string; badge: string }> = {
  V0: { bar: 'bg-red-500',    badge: 'bg-red-100 text-red-700' },
  V1: { bar: 'bg-orange-500', badge: 'bg-orange-100 text-orange-700' },
  V2: { bar: 'bg-yellow-400', badge: 'bg-yellow-100 text-yellow-800' },
  V3: { bar: 'bg-green-500',  badge: 'bg-green-100 text-green-700' },
};

export function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    numeric: 'bg-blue-100 text-blue-700',
    boolean: 'bg-purple-100 text-purple-700',
    categorical: 'bg-amber-100 text-amber-700',
  };
  return (
    <span className={`inline-block px-1.5 py-0.5 text-xs rounded ${colors[type] ?? 'bg-gray-100 text-gray-600'}`}>
      {type}
    </span>
  );
}

export function HorizontalBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded h-4 overflow-hidden">
        <div className={`h-4 rounded ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-16 text-right font-mono">
        {value.toLocaleString()}
      </span>
    </div>
  );
}

/** Fills all 10 bucket positions (0–10, 10–20, …, 90–100) with their counts.
 *  Missing buckets get count = 0. Returns points at bucket centers. */
export function fillBuckets(
  data: Array<{ bucket: string; count: number }>,
): Array<{ x: number; count: number }> {
  const map = new Map<number, number>();
  data.forEach((d) => {
    const lo = parseInt(d.bucket.split('-')[0], 10);
    map.set(lo, d.count);
  });
  return Array.from({ length: 10 }, (_, i) => ({
    x: i * 10 + 5,
    count: map.get(i * 10) ?? 0,
  }));
}
