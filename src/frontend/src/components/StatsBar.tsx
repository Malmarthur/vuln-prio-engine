import { useEffect, useState } from 'react';
import { fetchStats, VulnerabilityStats } from '../api/client';
import CompactKpi, { CompactKpiStrip } from './CompactKpi';

const SEV_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NONE'] as const;
const SEV_COLORS: Record<string, string> = {
  CRITICAL: 'text-red-600',
  HIGH: 'text-orange-500',
  MEDIUM: 'text-yellow-500',
  LOW: 'text-blue-500',
  NONE: 'text-gray-400',
};

export default function StatsBar() {
  const [stats, setStats] = useState<VulnerabilityStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStats().then(setStats).catch((e: Error) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
        Failed to load stats: {error}
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="h-[70px] animate-pulse rounded-md border border-gray-200 bg-white"
          />
        ))}
      </div>
    );
  }

  const sevDist = stats.severity_distribution || {};

  return (
    <div className="mb-4">
      <CompactKpiStrip>
        <CompactKpi label="Total CVEs" value={stats.total.toLocaleString()} />
        <CompactKpi label="KEV exploited" value={stats.kev_count.toLocaleString()} tone="red" />
        <CompactKpi
          label="EPSS Coverage"
          value={stats.epss_covered.toLocaleString()}
          detail={
            stats.avg_epss_score != null
              ? `Avg: ${(stats.avg_epss_score * 100).toFixed(2)}%`
              : undefined
          }
        />
        <div className="col-span-2 min-w-0 rounded-md border border-gray-200 bg-white px-3 py-2 lg:col-span-3">
          <p className="truncate text-[11px] font-medium uppercase text-gray-500">Severity (CVSS 3.1)</p>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
            {SEV_ORDER.map((s) =>
              sevDist[s] ? (
                <span key={s} className={`font-medium ${SEV_COLORS[s]}`}>
                  {s[0]}: {sevDist[s].toLocaleString()}
                </span>
              ) : null,
            )}
          </div>
        </div>
      </CompactKpiStrip>
    </div>
  );
}
