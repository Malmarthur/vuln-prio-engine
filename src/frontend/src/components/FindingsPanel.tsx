import { Fragment, KeyboardEvent, useEffect, useState } from 'react';
import {
  Finding,
  FindingStats,
  fetchFindingStats,
  fetchFindings,
  runFindingMatching,
  runFindingScoring,
} from '../api/client';
import { ChevronRight } from 'lucide-react';
import { PriorityBadge } from '../lib/priority';
import { getErrorMessage } from '../lib/utils';
import CompactKpi, { CompactKpiStrip } from './CompactKpi';
import Pagination from './Pagination';

export default function FindingsPanel() {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [stats, setStats] = useState<FindingStats | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [matching, setMatching] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedFindingIds, setExpandedFindingIds] = useState<string[]>([]);
  const [filters, setFilters] = useState({
    search: '',
    priority_level: '',
    kev_only: false,
    internet_exposure: '',
  });
  const calculating = matching || scoring;

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([fetchFindings({ page, per_page: 50, ...filters }), fetchFindingStats()])
      .then(([findingPage, findingStats]) => {
        setFindings(findingPage.items);
        setTotal(findingPage.total);
        setStats(findingStats);
        setExpandedFindingIds((ids) => ids.filter((id) => findingPage.items.some((finding) => finding.id === id)));
      })
      .catch((e) => setError(getErrorMessage(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [page, filters]);

  const handleMatch = async () => {
    setMatching(true);
    setMsg(null);
    setError(null);
    try {
      const res = await runFindingMatching();
      setMsg(`Matched ${res.findings_matched.toLocaleString()} findings from ${res.components_processed.toLocaleString()} CPE-enabled components`);
      setPage(1);
      load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setMatching(false);
    }
  };

  const handleScore = async () => {
    setScoring(true);
    setMsg(null);
    setError(null);
    try {
      const res = await runFindingScoring();
      setMsg(`Scored ${res.rows_updated.toLocaleString()} findings`);
      load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setScoring(false);
    }
  };

  const toggleFinding = (findingId: string) => {
    setExpandedFindingIds((ids) => (
      ids.includes(findingId) ? ids.filter((id) => id !== findingId) : [...ids, findingId]
    ));
  };

  const handleFindingKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, findingId: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleFinding(findingId);
    }
  };

  const updateFilter = (patch: Partial<typeof filters>) => {
    setPage(1);
    setFilters((prev) => ({ ...prev, ...patch }));
  };

  return (
    <div className="space-y-4">
      <CompactKpiStrip>
        <CompactKpi label="Findings" value={formatNumber(stats?.total_findings)} />
        <CompactKpi label="Scored" value={formatNumber(stats?.scored_findings)} />
        <CompactKpi label="Unscored" value={formatNumber(stats?.unscored_findings)} tone="muted" />
        <CompactKpi label="P0 findings" value={formatNumber(stats?.priority_distribution.P0 ?? 0)} tone="critical" />
        <CompactKpi label="Internet-exposed" value={formatNumber(stats?.exposure_distribution.internet ?? 0)} tone="high" />
        <CompactKpi label="Internal" value={formatNumber(stats?.exposure_distribution.internal ?? 0)} />
        <CompactKpi label="Isolated" value={formatNumber(stats?.exposure_distribution.isolated ?? 0)} />
      </CompactKpiStrip>

      {msg && <div className="notice-info" role="status">{msg}</div>}
      {error && <div className="notice-error" role="alert">{error}</div>}

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Remediation queue</h2>
            <p className="panel-subtitle">Asset software matched against NVD affected CPEs, ordered by finding priority.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleMatch} disabled={calculating} className="btn-secondary btn-sm">
              {matching && <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />}
              {matching ? 'Matching…' : 'Run matching'}
            </button>
            <button onClick={handleScore} disabled={calculating} className="btn-primary btn-sm">
              {scoring && <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
              {scoring ? 'Scoring…' : 'Score findings'}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3 border-b border-gray-200 px-4 py-2.5">
          <label className="min-w-[220px] flex-1">
            <span className="label-caps mb-1 block !text-[10px]">Search</span>
            <input
              value={filters.search}
              onChange={(event) => updateFilter({ search: event.target.value })}
              placeholder="Asset, CVE or summary…"
              className="field w-full py-1"
            />
          </label>
          <label>
            <span className="label-caps mb-1 block !text-[10px]">Priority</span>
            <select value={filters.priority_level} onChange={(event) => updateFilter({ priority_level: event.target.value })} className="field py-1">
              <option value="">All</option>
              {['P0', 'P1', 'P2', 'P3'].map((level) => <option key={level} value={level}>{level}</option>)}
            </select>
          </label>
          <label>
            <span className="label-caps mb-1 block !text-[10px]">Exposure</span>
            <select value={filters.internet_exposure} onChange={(event) => updateFilter({ internet_exposure: event.target.value })} className="field py-1 capitalize">
              <option value="">All</option>
              {['internet', 'internal', 'isolated', 'unknown'].map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5 pb-1.5 text-[13px] text-gray-700">
            <input type="checkbox" checked={filters.kev_only} onChange={(event) => updateFilter({ kev_only: event.target.checked })} className="rounded-sm border-gray-400 text-accent-700 focus:ring-accent-500" />
            KEV only
          </label>
          <button onClick={() => { setPage(1); setFilters({ search: '', priority_level: '', kev_only: false, internet_exposure: '' }); }} className="btn-ghost btn-sm mb-0.5">
            Reset
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th>Priority</th><th>Asset</th><th>Component</th><th>CVE</th><th className="!text-right">CVSS</th><th className="!text-right">EPSS</th><th>Match</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="py-12 text-center text-gray-500">Loading…</td></tr>
              ) : findings.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-gray-500">No findings yet. Import assets, ingest NVD, then run matching.</td></tr>
              ) : findings.map((finding) => {
                const expanded = expandedFindingIds.includes(finding.id);
                return (
                  <Fragment key={finding.id}>
                    <tr
                      className={`cursor-pointer align-top ${expanded ? 'bg-gray-50' : ''}`}
                      role="button"
                      tabIndex={0}
                      aria-expanded={expanded}
                      onClick={() => toggleFinding(finding.id)}
                      onKeyDown={(event) => handleFindingKeyDown(event, finding.id)}
                    >
                      <td>
                        <div className="flex items-start gap-2">
                          <ChevronRight className={`mt-0.5 h-4 w-4 shrink-0 text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                          {finding.priority_level ? (
                            <div className="flex items-center gap-1.5">
                              <PriorityBadge level={finding.priority_level} />
                              <span className="font-mono text-xs text-gray-700">{finding.priority_score?.toFixed(1)}</span>
                            </div>
                          ) : <span className="text-xs text-gray-400">Unscored</span>}
                        </div>
                      </td>
                      <td className="whitespace-nowrap">
                        <div className="font-medium text-gray-900">{finding.asset.name}</div>
                        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-gray-500">
                          {finding.asset.priority_level ? <PriorityBadge level={finding.asset.priority_level} /> : <span>Asset unscored</span>}
                          <span className="capitalize">{finding.asset.internet_exposure} · {finding.asset.business_criticality}</span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap">
                        <div className="text-gray-900">{finding.component.name}</div>
                        <div className="font-mono text-[11px] text-gray-500">{finding.component.version ?? 'unknown version'}</div>
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5 font-mono font-medium text-gray-900">
                          {finding.vulnerability.cve_id}
                          {finding.vulnerability.kev_known_exploited && <span className="bg-red-700 px-1 font-sans text-[10px] font-semibold uppercase leading-4 text-white" title="CISA Known Exploited Vulnerability">KEV</span>}
                        </div>
                        <div className="max-w-md truncate text-xs text-gray-500">{finding.vulnerability.summary}</div>
                      </td>
                      <td className="text-right font-mono text-gray-800">{finding.vulnerability.cvss_v31_score ?? '—'}</td>
                      <td className="text-right font-mono text-gray-800">{formatPercent(finding.vulnerability.epss_score)}</td>
                      <td className="whitespace-nowrap text-gray-700">
                        <div>{formatMatchType(finding.match_type)}</div>
                        <div className="font-mono text-[11px] text-gray-500">{finding.match_confidence.toFixed(1)}%</div>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="bg-gray-50 hover:!bg-gray-50">
                        <td colSpan={7} className="!px-4 !py-4">
                          <FindingDetails finding={finding} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        <Pagination page={page} perPage={50} total={total} onChange={setPage} />
      </section>
    </div>
  );
}

function FindingDetails({ finding }: { finding: Finding }) {
  const componentVendor = finding.component.vendor ?? finding.component.cpe_vendor;
  const componentProduct = finding.component.product ?? finding.component.cpe_product;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-4">
        <section className="border border-gray-300 bg-white p-3">
          <h3 className="label-caps text-gray-700">Asset</h3>
          <dl className="mt-2 space-y-1.5 text-[13px]">
            <DetailRow label="Name" value={finding.asset.name} />
            <DetailRow label="Exposure" value={finding.asset.internet_exposure} />
            <DetailRow label="Criticality" value={finding.asset.business_criticality} />
            <DetailRow label="Patch complexity" value={finding.asset.patch_complexity} />
            <DetailRow label="Asset priority" value={formatPriority(finding.asset.priority_level, finding.asset.priority_score)} />
            <DetailRow label="Asset confidence" value={finding.asset.priority_confidence == null ? '-' : `${finding.asset.priority_confidence.toFixed(1)}%`} />
          </dl>
        </section>

        <section className="border border-gray-300 bg-white p-3">
          <h3 className="label-caps text-gray-700">Component</h3>
          <dl className="mt-2 space-y-1.5 text-[13px]">
            <DetailRow label="Name" value={finding.component.name} />
            <DetailRow label="Version" value={finding.component.version ?? '-'} />
            <DetailRow label="Vendor" value={componentVendor ?? '-'} />
            <DetailRow label="Product" value={componentProduct ?? '-'} />
          </dl>
        </section>

        <section className="border border-gray-300 bg-white p-3">
          <h3 className="label-caps text-gray-700">Vulnerability</h3>
          <dl className="mt-2 space-y-1.5 text-[13px]">
            <DetailRow label="CVE" value={finding.vulnerability.cve_id} />
            <DetailRow label="CVSS v3.1" value={finding.vulnerability.cvss_v31_score?.toFixed(1) ?? '-'} />
            <DetailRow label="EPSS" value={formatPercent(finding.vulnerability.epss_score)} />
            <DetailRow label="KEV" value={finding.vulnerability.kev_known_exploited ? 'Yes' : 'No'} />
            <DetailRow
              label="Vuln score"
              value={formatPriority(finding.vulnerability.vulnerability_priority_level, finding.vulnerability.vulnerability_priority_score)}
            />
          </dl>
        </section>

        <section className="border border-gray-300 bg-white p-3">
          <h3 className="label-caps text-gray-700">Finding</h3>
          <dl className="mt-2 space-y-1.5 text-[13px]">
            <DetailRow label="Status" value={finding.status} />
            <DetailRow label="Match" value={formatMatchType(finding.match_type)} />
            <DetailRow label="Confidence" value={`${finding.match_confidence.toFixed(1)}%`} />
            <DetailRow label="Priority" value={formatPriority(finding.priority_level, finding.priority_score)} />
            <DetailRow label="Score confidence" value={finding.priority_confidence == null ? '-' : `${finding.priority_confidence.toFixed(1)}%`} />
          </dl>
        </section>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="border border-gray-300 bg-white p-3">
          <h3 className="label-caps text-gray-700">Component CPE</h3>
          {finding.component.cpe ? (
            <div className="mt-2 space-y-2">
              <code className="block break-all border border-gray-200 bg-gray-50 px-2 py-1 font-mono text-[11px] text-gray-800">
                {finding.component.cpe}
              </code>
              <div className="flex flex-wrap gap-1 text-xs text-gray-500">
                {finding.component.cpe_vendor && <span className="border border-gray-200 px-1.5 font-mono text-[11px]">vendor: {finding.component.cpe_vendor}</span>}
                {finding.component.cpe_product && <span className="border border-gray-200 px-1.5 font-mono text-[11px]">product: {finding.component.cpe_product}</span>}
                {finding.component.cpe_version && <span className="border border-gray-200 px-1.5 font-mono text-[11px]">version: {finding.component.cpe_version}</span>}
              </div>
            </div>
          ) : (
            <p className="mt-2 text-[13px] text-gray-400">No CPE on this component.</p>
          )}
          {finding.component.purl && (
            <code className="mt-2 block break-all border border-gray-200 bg-gray-50 px-2 py-1 font-mono text-[11px] text-gray-800">
              {finding.component.purl}
            </code>
          )}
        </section>

        <section className="border border-gray-300 bg-white p-3">
          <h3 className="label-caps text-gray-700">Timeline and summary</h3>
          <dl className="mt-2 grid gap-2 text-[13px] sm:grid-cols-2">
            <DetailRow label="First seen" value={formatDate(finding.first_seen_at)} />
            <DetailRow label="Last seen" value={formatDate(finding.last_seen_at)} />
          </dl>
          <p className="mt-3 text-[13px] leading-5 text-gray-700">
            {finding.vulnerability.summary ?? 'No vulnerability summary available.'}
          </p>
        </section>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] text-gray-500">{label}</dt>
      <dd className="break-words text-gray-900">{value}</dd>
    </div>
  );
}

function formatMatchType(value: string): string {
  return value.replace(/_/g, ' ');
}

function formatPercent(value: number | null): string {
  return value == null ? '—' : `${(value * 100).toFixed(2)}%`;
}

function formatPriority(level: string | null, score: number | null): string {
  if (!level && score == null) return '-';
  if (!level) return score?.toFixed(1) ?? '-';
  if (score == null) return level;
  return `${level} ${score.toFixed(1)}`;
}

function formatDate(value: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function formatNumber(value: number | undefined): string {
  return value == null ? '...' : value.toLocaleString();
}
