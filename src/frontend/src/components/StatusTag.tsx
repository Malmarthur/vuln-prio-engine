import { type ReactNode } from 'react';

// Operational statuses (resolution, ingestion, jobs). Red is kept for failures;
// green/amber/orange stay reserved for the priority scale.
export type StatusTone = 'positive' | 'neutral' | 'pending' | 'warning' | 'error' | 'muted';

const TONES: Record<StatusTone, string> = {
  positive: 'border-accent-300 bg-accent-50 text-accent-800',
  neutral: 'border-gray-300 bg-white text-gray-700',
  pending: 'border-accent-200 bg-white text-accent-700',
  warning: 'border-dashed border-gray-500 bg-white text-gray-800',
  error: 'border-red-300 bg-red-50 text-red-700',
  muted: 'border-gray-200 bg-gray-50 text-gray-500',
};

export default function StatusTag({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap border px-1.5 font-mono text-[10px] font-medium uppercase leading-[18px] ${TONES[tone]}`}>
      {children}
    </span>
  );
}
