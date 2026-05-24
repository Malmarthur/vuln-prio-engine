import { ReactNode } from 'react';

interface CompactKpiProps {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: 'neutral' | 'red' | 'orange' | 'blue' | 'green' | 'muted';
}

const TONES: Record<NonNullable<CompactKpiProps['tone']>, string> = {
  neutral: 'border-gray-200 bg-white text-gray-900',
  red: 'border-red-100 bg-red-50 text-red-700',
  orange: 'border-orange-100 bg-orange-50 text-orange-700',
  blue: 'border-blue-100 bg-blue-50 text-blue-700',
  green: 'border-green-100 bg-green-50 text-green-700',
  muted: 'border-gray-200 bg-gray-100 text-gray-500',
};

export default function CompactKpi({ label, value, detail, tone = 'neutral' }: CompactKpiProps) {
  return (
    <div className={`min-w-0 rounded-md border px-3 py-2 ${TONES[tone]}`}>
      <div className="truncate text-[11px] font-medium uppercase text-gray-500">{label}</div>
      <div className="mt-0.5 truncate text-base font-semibold tabular-nums">{value}</div>
      {detail && <div className="mt-0.5 truncate text-xs text-gray-500">{detail}</div>}
    </div>
  );
}

export function CompactKpiStrip({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {children}
    </div>
  );
}
