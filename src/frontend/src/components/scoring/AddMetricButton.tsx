import { useState } from 'react';
import { ColumnConfig, EligibleColumn, ScoringProfile } from '../../api/client';
import { TypeBadge } from './helpers';

interface Props {
  eligibleColumns: Record<string, EligibleColumn>;
  profile: ScoringProfile;
  allFallbacks: Set<string>;
  onAdd: (col: string, config: ColumnConfig) => void;
}

export default function AddMetricButton({ eligibleColumns, profile, allFallbacks, onAdd }: Props) {
  const [open, setOpen] = useState(false);

  // Columns not yet in the profile (neither top-level nor fallback)
  const available = Object.entries(eligibleColumns).filter(
    ([col]) => !(col in profile.columns) && !allFallbacks.has(col),
  );

  if (available.length === 0) return null;

  const handleSelect = (col: string) => {
    const meta = eligibleColumns[col];
    const newConfig: ColumnConfig = {
      enabled: true,
      weight: 0,
      type: meta.type,
      label: meta.label,
      range: meta.range,
      default_value: 100,
      values: meta.type === 'boolean' ? { true: 100, false: 0 } : {},
    };
    onAdd(col, newConfig);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full h-full min-h-[100px] flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600 transition-colors"
      >
        <span className="text-2xl leading-none">+</span>
        <span className="text-xs font-medium">Add Metric</span>
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          {/* Dropdown */}
          <div className="absolute left-0 top-full mt-1 z-50 bg-white rounded-lg shadow-lg border border-gray-200 w-64 max-h-72 overflow-y-auto">
            <div className="px-3 py-2 border-b border-gray-100">
              <p className="text-xs font-medium text-gray-500">Available columns</p>
            </div>
            {available.map(([col, meta]) => (
              <button
                key={col}
                onClick={() => handleSelect(col)}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="text-sm text-gray-800 font-medium truncate">{meta.label}</p>
                  <p className="text-xs text-gray-400 font-mono truncate">{col}</p>
                </div>
                <TypeBadge type={meta.type} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
