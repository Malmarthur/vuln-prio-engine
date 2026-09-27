// Single source of truth for priority/severity colors.
// Levels share one scale across stages: V0/A0/P0 and CVSS CRITICAL are tier 0
// (red), down to V3/A3/P3 and CVSS LOW at tier 3 (green).

export type PriorityTier = 0 | 1 | 2 | 3;

const CVSS_TIERS: Record<string, PriorityTier> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

export function priorityTier(level?: string | null): PriorityTier | null {
  if (!level) return null;
  const upper = level.toUpperCase();
  if (upper in CVSS_TIERS) return CVSS_TIERS[upper];
  const match = upper.match(/^[VAP]([0-3])$/);
  return match ? (Number(match[1]) as PriorityTier) : null;
}

const BAR = ['bg-red-500', 'bg-orange-500', 'bg-amber-400', 'bg-green-500'];
const BADGE = [
  'bg-red-600 text-white',
  'bg-orange-500 text-white',
  'bg-amber-400 text-gray-950',
  'bg-green-600 text-white',
];
const TEXT = ['text-red-600', 'text-orange-600', 'text-amber-700', 'text-green-700'];
const HEX = ['#b23c33', '#c26424', '#d5b038', '#3f8158'];

export const UNSCORED_HEX = '#c4c9d2';

export function priorityBarClass(level?: string | null): string {
  const tier = priorityTier(level);
  return tier === null ? 'bg-gray-300' : BAR[tier];
}

export function priorityTextClass(level?: string | null): string {
  const tier = priorityTier(level);
  return tier === null ? 'text-gray-500' : TEXT[tier];
}

export function priorityHex(level?: string | null): string {
  const tier = priorityTier(level);
  return tier === null ? UNSCORED_HEX : HEX[tier];
}

/** Hex color for a tier index, e.g. for SVG threshold bands. */
export function tierHex(tier: PriorityTier): string {
  return HEX[tier];
}

export function PriorityBadge({
  level,
  label,
  className = '',
}: {
  level?: string | null;
  label?: string;
  className?: string;
}) {
  const tier = priorityTier(level);
  const tone = tier === null ? 'border border-gray-300 bg-gray-50 text-gray-500' : BADGE[tier];
  return (
    <span
      className={`inline-flex min-w-[2.25rem] items-center justify-center rounded-sm px-1.5 py-px font-mono text-[11px] font-semibold leading-4 ${tone} ${className}`}
    >
      {label ?? level ?? '—'}
    </span>
  );
}
