import { ReactNode } from 'react';

type KpiTone = 'neutral' | 'critical' | 'high' | 'muted';

interface CompactKpiProps {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: KpiTone;
  className?: string;
}

const VALUE_TONES: Record<KpiTone, string> = {
  neutral: 'text-gray-900',
  critical: 'text-red-700',
  high: 'text-orange-700',
  muted: 'text-gray-400',
};

const MARKERS: Partial<Record<KpiTone, string>> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
};

export default function CompactKpi({ label, value, detail, tone = 'neutral', className = '' }: CompactKpiProps) {
  const marker = MARKERS[tone];
  return (
    <div className={`relative min-w-0 border-b border-r border-gray-300 bg-white px-3 py-2 ${className}`}>
      {marker && <span className={`absolute inset-y-0 left-0 w-[3px] ${marker}`} aria-hidden="true" />}
      <div className="label-caps truncate !text-[10px]">{label}</div>
      <div className={`mt-0.5 truncate text-[17px] font-semibold tabular-nums ${VALUE_TONES[tone]}`}>{value}</div>
      {detail && <div className="truncate text-[11px] text-gray-500">{detail}</div>}
    </div>
  );
}

export function CompactKpiStrip({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 border-l border-t border-gray-300 sm:grid-cols-4 lg:grid-cols-7">
      {children}
    </div>
  );
}
