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
      className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border px-3 py-2 text-left transition-colors hover:border-accent-400 hover:bg-accent-50/30 ${
        config.enabled ? 'border-gray-300 bg-white' : 'border-dashed border-gray-300 bg-gray-50'
      }`}
    >
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className={`truncate text-[13px] font-medium ${config.enabled ? 'text-gray-900' : 'text-gray-400'}`}>{displayLabel}</span>
          <TypeBadge type={meta.type} />
        </span>
        <span className="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-gray-400">
          <span className="truncate">{columnName}</span>
          {fallbackCount > 0 && <span className="shrink-0">↳ {fallbackCount} fallback{fallbackCount > 1 ? 's' : ''}</span>}
        </span>
      </span>
      <span className={`font-mono text-[13px] font-semibold ${config.enabled && config.weight > 0 ? 'text-gray-900' : 'text-gray-400'}`}>
        {config.enabled ? `${config.weight}%` : 'off'}
      </span>
    </button>
  );
}
