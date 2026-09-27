import { useEffect, useRef } from 'react';
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
  // Keep a ref to the latest callback so the effect doesn't need it as a dep
  const ensureValuesRef = useRef(onEnsureColumnValues);
  ensureValuesRef.current = onEnsureColumnValues;

  // Fetch distinct values when modal opens (for categorical/boolean)
  useEffect(() => {
    if (meta.type !== 'numeric') {
      ensureValuesRef.current(columnName);
    }
  }, [columnName, meta.type]);

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto border border-gray-300 bg-white shadow-xl" role="dialog" aria-modal="true">
        {/* Header */}
        <div className="panel-header sticky top-0 z-10">
          <div>
            <p className="font-mono text-[11px] text-gray-500">{columnName}</p>
            <h2 className="panel-title">{config.label || meta.label}</h2>
          </div>
          <button
            onClick={onClose}
            className="btn-ghost btn-sm px-2 text-base leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="space-y-4 px-4 py-4">
          {/* Label */}
          <div>
            <label className="label-caps mb-1 block !text-[10px]">Display name</label>
            <input
              type="text"
              value={config.label ?? meta.label}
              onChange={(e) => onUpdate({ label: e.target.value || undefined })}
              placeholder={meta.label}
              className="field w-full py-1"
            />
          </div>

          {/* Type + Range (read-only) */}
          <div className="flex items-center gap-3">
            <div>
              <p className="label-caps mb-1 !text-[10px]">Type</p>
              <TypeBadge type={meta.type} />
            </div>
            {meta.type === 'numeric' && meta.range && (
              <div>
                <p className="label-caps mb-1 !text-[10px]">Range</p>
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
              role="switch"
              aria-checked={config.enabled}
              aria-label="Metric enabled"
              className={`relative inline-flex h-4 w-7 shrink-0 items-center border transition-colors ${
                config.enabled ? 'border-accent-700 bg-accent-700' : 'border-gray-400 bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-2.5 w-2.5 bg-white transition-transform ${
                  config.enabled ? 'translate-x-[14px]' : 'translate-x-0.5'
                }`}
              />
            </button>
            <span className="text-[13px] text-gray-700">{config.enabled ? 'Enabled' : 'Disabled'}</span>
          </div>

          {/* Weight + Default */}
          <div className="flex gap-4">
            <label className="flex-1">
              <span className="label-caps mb-1 block !text-[10px]">Weight %</span>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={config.weight}
                onChange={(e) => onUpdate({ weight: Number(e.target.value) })}
                className="field w-full py-1 text-right font-mono"
              />
            </label>
            <label className="flex-1">
              <span className="label-caps mb-1 block !text-[10px]">Default (null)</span>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={config.default_value}
                onChange={(e) => onUpdate({ default_value: Number(e.target.value) })}
                className="field w-full py-1 text-right font-mono"
              />
            </label>
          </div>

          {/* Value mappings — boolean / categorical */}
          {meta.type !== 'numeric' && (
            <div>
              <p className="label-caps mb-2 !text-[10px]">Value mappings (0–100)</p>
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
                        className="field w-16 py-0.5 text-right font-mono"
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Fallback chain */}
          <div>
            <p className="label-caps mb-2 !text-[10px]">Fallback chain (first non-null wins)</p>
            <div className="space-y-0.5 border border-gray-200 bg-gray-50 p-2">
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
                        className="px-1 py-0.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200 disabled:opacity-25 disabled:cursor-not-allowed"
                        title="Move up"
                      >↑</button>
                      <button
                        onClick={() => onMoveFallback(idx, 1)}
                        disabled={idx === fbCount - 1}
                        className="px-1 py-0.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200 disabled:opacity-25 disabled:cursor-not-allowed"
                        title="Move down"
                      >↓</button>
                      <button
                        onClick={() => onRemoveFallback(fbCol)}
                        className="px-1.5 py-0.5 text-gray-400 hover:text-red-600 hover:bg-red-50"
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
                    className="field w-full py-0.5 text-xs text-gray-600"
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
        <div className="flex items-center justify-between border-t border-gray-300 bg-gray-50 px-4 py-2.5">
          <button
            onClick={handleRemove}
            className="btn-danger btn-sm"
          >
            Remove metric
          </button>
          <button
            onClick={onClose}
            className="btn-primary btn-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
