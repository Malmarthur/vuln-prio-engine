import { useEffect, useState } from 'react';
import { fetchStats, VulnerabilityStats } from '../api/client';

const SEV_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NONE'] as const;
const SEV_COLORS: Record<string, string> = {
  CRITICAL: 'text-red-600',
  HIGH: 'text-orange-500',
  MEDIUM: 'text-yellow-500',
  LOW: 'text-blue-500',
  NONE: 'text-gray-400',
};

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
}

function StatCard({ label, value, sub }: StatCardProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 px-4 py-3">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="bg-white rounded-lg shadow-sm border border-gray-200 px-4 py-3 animate-pulse h-20"
          />
        ))}
      </div>
    );
  }

  const sevDist = stats.severity_distribution || {};

  return (
    <div className="mb-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total CVEs" value={stats.total.toLocaleString()} />
        <StatCard
          label="KEV Exploited"
          value={stats.kev_count.toLocaleString()}
        />
        <StatCard
          label="EPSS Coverage"
          value={stats.epss_covered.toLocaleString()}
          sub={
            stats.avg_epss_score != null
              ? `Avg: ${(stats.avg_epss_score * 100).toFixed(2)}%`
              : undefined
          }
        />
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 px-4 py-3">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            Severity (CVSS 3.1)
          </p>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm">
            {SEV_ORDER.map((s) =>
              sevDist[s] ? (
                <span key={s} className={`font-medium ${SEV_COLORS[s]}`}>
                  {s[0]}: {sevDist[s].toLocaleString()}
                </span>
              ) : null,
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
