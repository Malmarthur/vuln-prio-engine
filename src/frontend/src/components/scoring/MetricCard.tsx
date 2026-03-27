import { ColumnConfig, EligibleColumn } from '../../api/client';
import { TypeBadge } from './helpers';

interface Props {
  columnName: string;
  config: ColumnConfig;
  meta: EligibleColumn;
  onClick: () => void;
}

export default function MetricCard({ columnName, config, meta, onClick }: Props) {
  const displayLabel = config.label || meta.label;
  const fallbackCount = config.fallbacks?.length ?? 0;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-lg border p-3 transition-all hover:shadow-md hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 ${
        config.enabled
          ? 'border-gray-300 bg-white'
          : 'border-gray-200 bg-gray-50'
      }`}
    >
      {/* Top row: label + type badge */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span className={`text-sm font-medium leading-tight ${config.enabled ? 'text-gray-900' : 'text-gray-400'}`}>
          {displayLabel}
        </span>
        <TypeBadge type={meta.type} />
      </div>

      {/* Source column name */}
      <div className="text-xs text-gray-400 font-mono mb-2 truncate">
        {columnName}
      </div>

      {/* Bottom row: weight + fallback indicator */}
      <div className="flex items-center justify-between">
        <span className={`text-xs font-mono ${config.enabled && config.weight > 0 ? 'text-gray-700' : 'text-gray-400'}`}>
          {config.enabled ? `${config.weight}%` : 'disabled'}
        </span>
        {fallbackCount > 0 && (
          <span className="text-xs text-gray-400">
            ↳ {fallbackCount} fallback{fallbackCount > 1 ? 's' : ''}
          </span>
        )}
      </div>
    </button>
  );
}
