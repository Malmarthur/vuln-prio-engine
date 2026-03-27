import { useEffect } from 'react';
import { ColumnConfig, EligibleColumn, ScoringProfile } from '../../api/client';
import { TypeBadge } from './helpers';

interface Props {
  columnName: string;
  config: ColumnConfig;
  meta: EligibleColumn;
  eligibleColumns: Record<string, EligibleColumn>;
  profile: ScoringProfile;
  colValues: Record<string, string[]>;
  allFallbacks: Set<string>;
  onUpdate: (patch: Partial<ColumnConfig>) => void;
  onRemove: () => void;
  onClose: () => void;
  onMoveFallback: (fbIdx: number, direction: -1 | 1) => void;
  onRemoveFallback: (fbCol: string) => void;
  onAddFallback: (fbCol: string) => void;
  onEnsureColumnValues: (col: string) => Promise<void>;
}

export default function MetricEditModal({
  columnName,
  config,
  meta,
  eligibleColumns,
  profile,
  colValues,
  allFallbacks,
  onUpdate,
  onRemove,
  onClose,
  onMoveFallback,
  onRemoveFallback,
  onAddFallback,
  onEnsureColumnValues,
}: Props) {
  // Fetch distinct values when modal opens (for categorical/boolean)
  useEffect(() => {
    if (meta.type !== 'numeric') {
      onEnsureColumnValues(columnName);
    }
  }, [columnName, meta.type]); // eslint-disable-line react-hooks/exhaustive-deps

  const cats: string[] =
    meta.type === 'boolean'
      ? ['true', 'false']
      : colValues[columnName] ?? Object.keys(config.values ?? {});

  // Columns available to add as fallbacks:
  // - same type, not already in this group, not a top-level entry elsewhere, not used as fallback elsewhere
  const inGroup = new Set([columnName, ...(config.fallbacks ?? [])]);
  const availableForFallback = Object.keys(eligibleColumns).filter(
    (c) =>
      !inGroup.has(c) &&
      !allFallbacks.has(c) &&
      !(c in profile.columns) &&
      eligibleColumns[c].type === meta.type,
  );

  const handleRemove = () => {
    if (!confirm(`Remove "${config.label || meta.label}" from the scoring profile?`)) return;
    onRemove();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <p className="text-xs text-gray-400 font-mono">{columnName}</p>
            <h2 className="text-base font-semibold text-gray-900">{config.label || meta.label}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-xl leading-none px-1"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Label */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Display Name</label>
            <input
              type="text"
              value={config.label ?? meta.label}
              onChange={(e) => onUpdate({ label: e.target.value || undefined })}
              placeholder={meta.label}
              className="w-full rounded border-gray-300 text-sm focus:border-gray-500 focus:ring-gray-500"
            />
          </div>

          {/* Type + Range (read-only) */}
          <div className="flex items-center gap-3">
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Type</p>
              <TypeBadge type={meta.type} />
            </div>
            {meta.type === 'numeric' && meta.range && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Range</p>
                <span className="text-xs text-gray-500 font-mono">
                  {meta.range[0]} – {meta.range[1]}
                </span>
              </div>
            )}
          </div>

          {/* Enabled toggle */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => onUpdate({ enabled: !config.enabled })}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
                config.enabled ? 'bg-gray-900' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform ${
                  config.enabled ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
            <span className="text-sm text-gray-700">{config.enabled ? 'Enabled' : 'Disabled'}</span>
          </div>

          {/* Weight + Default */}
          <div className="flex gap-4">
            <label className="flex-1">
              <span className="block text-xs font-medium text-gray-500 mb-1">Weight %</span>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={config.weight}
                onChange={(e) => onUpdate({ weight: Number(e.target.value) })}
                className="w-full rounded border-gray-300 text-sm text-right focus:border-gray-500 focus:ring-gray-500"
              />
            </label>
            <label className="flex-1">
              <span className="block text-xs font-medium text-gray-500 mb-1">Default (null)</span>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={config.default_value}
                onChange={(e) => onUpdate({ default_value: Number(e.target.value) })}
                className="w-full rounded border-gray-300 text-sm text-right focus:border-gray-500 focus:ring-gray-500"
              />
            </label>
          </div>

          {/* Value mappings — boolean / categorical */}
          {meta.type !== 'numeric' && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">Value Mappings (0–100)</p>
              {(config.fallbacks?.length ?? 0) > 0 && (
                <p className="text-xs text-gray-400 mb-2">Applied to all columns in the fallback chain.</p>
              )}
              {cats.length === 0 ? (
                <p className="text-xs text-gray-400">
                  {meta.type === 'categorical'
                    ? 'No values found in database yet (ingest data first).'
                    : ''}
                </p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {cats.map((cat) => (
                    <label key={cat} className="flex items-center gap-1.5 text-sm text-gray-600">
                      <span className="min-w-[4rem] font-mono text-xs">{cat}</span>
                      <span className="text-gray-400">=</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        value={(config.values ?? {})[cat] ?? ''}
                        placeholder="0–100"
                        onChange={(e) => {
                          const newValues = { ...(config.values ?? {}), [cat]: Number(e.target.value) };
                          onUpdate({ values: newValues });
                        }}
                        className="w-16 rounded border-gray-300 text-sm text-right focus:border-gray-500 focus:ring-gray-500"
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Fallback chain */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Fallback Chain (first non-null wins)</p>
            <div className="space-y-0.5 rounded-lg border border-gray-100 bg-gray-50 p-2">
              {/* Primary column */}
              <div className="flex items-center gap-2 text-xs text-gray-500 py-0.5 px-1">
                <span className="text-gray-300 w-4 text-center font-mono">1.</span>
                <span className="font-mono">{meta.label}</span>
                <span className="text-gray-300">(primary)</span>
              </div>
              {/* Fallbacks */}
              {(config.fallbacks ?? []).map((fbCol, idx) => {
                const fbMeta = eligibleColumns[fbCol];
                const fbCount = (config.fallbacks ?? []).length;
                return (
                  <div key={fbCol} className="flex items-center gap-2 text-xs text-gray-600 py-0.5 px-1">
                    <span className="text-gray-300 w-4 text-center font-mono">{idx + 2}.</span>
                    <span className="font-mono">{fbMeta?.label ?? fbCol}</span>
                    <div className="ml-auto flex items-center gap-0.5">
                      <button
                        onClick={() => onMoveFallback(idx, -1)}
                        disabled={idx === 0}
                        className="px-1 py-0.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200 disabled:opacity-25 disabled:cursor-not-allowed"
                        title="Move up"
                      >↑</button>
                      <button
                        onClick={() => onMoveFallback(idx, 1)}
                        disabled={idx === fbCount - 1}
                        className="px-1 py-0.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200 disabled:opacity-25 disabled:cursor-not-allowed"
                        title="Move down"
                      >↓</button>
                      <button
                        onClick={() => onRemoveFallback(fbCol)}
                        className="px-1.5 py-0.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
                        title="Remove from chain"
                      >×</button>
                    </div>
                  </div>
                );
              })}
              {/* Add fallback dropdown */}
              {availableForFallback.length > 0 && (
                <div className="pt-1 px-1">
                  <select
                    value=""
                    onChange={(e) => { if (e.target.value) onAddFallback(e.target.value); }}
                    className="text-xs rounded border-gray-200 text-gray-500 focus:border-gray-400 focus:ring-gray-400 py-0.5 w-full"
                  >
                    <option value="">+ Add fallback…</option>
                    {availableForFallback.map((fc) => (
                      <option key={fc} value={fc}>{eligibleColumns[fc]?.label ?? fc}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-200">
          <button
            onClick={handleRemove}
            className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors"
          >
            Remove Metric
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-800 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
