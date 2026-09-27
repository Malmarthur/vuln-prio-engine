import { useEffect, useState } from 'react';
import { fetchStats, VulnerabilityStats } from '../api/client';
import { useActivityFinished } from '../lib/activity';
import { priorityBarClass } from '../lib/priority';
import CompactKpi, { CompactKpiStrip } from './CompactKpi';

const SEV_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NONE'] as const;

export default function StatsBar() {
  const [stats, setStats] = useState<VulnerabilityStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStats().then(setStats).catch((e: Error) => setError(e.message));
  }, []);

  useActivityFinished((task) => task.kind === 'ingestion' || (task.kind === 'run' && (task.scope === 'vulnerability' || task.scope === 'preset')), () => {
    fetchStats().then(setStats).catch((e: Error) => setError(e.message));
  });

  if (error) {
    return <div className="notice-error mb-4">Failed to load stats: {error}</div>;
  }

  if (!stats) {
    return <div className="panel mb-4 h-[62px] animate-pulse" />;
  }

  const sevDist = stats.severity_distribution || {};
  const sevTotal = SEV_ORDER.reduce((sum, level) => sum + (sevDist[level] ?? 0), 0) || 1;

  return (
    <div className="mb-4">
      <CompactKpiStrip>
        <CompactKpi label="Total CVEs" value={stats.total.toLocaleString()} />
        <CompactKpi label="KEV exploited" value={stats.kev_count.toLocaleString()} tone="critical" />
        <CompactKpi
          label="EPSS coverage"
          value={stats.epss_covered.toLocaleString()}
          detail={stats.avg_epss_score != null ? `Mean EPSS ${(stats.avg_epss_score * 100).toFixed(2)}%` : undefined}
        />
        <div className="col-span-2 min-w-0 border-b border-r border-gray-300 bg-white px-3 py-2 sm:col-span-4 lg:col-span-4">
          <p className="label-caps truncate !text-[10px]">Severity distribution (CVSS 3.1)</p>
          <div className="mt-1.5 flex h-2.5 gap-px overflow-hidden bg-gray-100">
            {SEV_ORDER.map((level) => sevDist[level] ? (
              <span key={level} className={priorityBarClass(level)} style={{ width: `${(sevDist[level] / sevTotal) * 100}%` }} title={`${level}: ${sevDist[level].toLocaleString()}`} />
            ) : null)}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px] text-gray-600">
            {SEV_ORDER.map((level) => sevDist[level] ? (
              <span key={level} className="inline-flex items-center gap-1">
                <i className={`inline-block h-2 w-2 ${priorityBarClass(level)}`} />
                {level.toLowerCase()} {sevDist[level].toLocaleString()}
              </span>
            ) : null)}
          </div>
        </div>
      </CompactKpiStrip>
    </div>
  );
}
