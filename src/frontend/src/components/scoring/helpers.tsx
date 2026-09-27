// ---------------------------------------------------------------------------
// Shared helpers for the Scoring panel
// ---------------------------------------------------------------------------

export function TypeBadge({ type }: { type: string }) {
  return (
    <span className="inline-block shrink-0 border border-gray-300 px-1 font-mono text-[10px] uppercase leading-4 text-gray-500">
      {type}
    </span>
  );
}

export function HorizontalBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-2.5 flex-1 overflow-hidden bg-gray-100">
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
