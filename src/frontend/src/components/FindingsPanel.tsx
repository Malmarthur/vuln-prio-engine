import { Fragment, KeyboardEvent, useEffect, useState } from 'react';
import {
  Finding,
  FindingStats,
  fetchFindingStats,
  fetchFindings,
  runFindingMatching,
  runFindingScoring,
} from '../api/client';
import { getErrorMessage } from '../lib/utils';
import CompactKpi, { CompactKpiStrip } from './CompactKpi';
import Pagination from './Pagination';

const PRIORITY_COLORS: Record<string, string> = {
  P0: 'bg-red-100 text-red-700 border-red-200',
  P1: 'bg-orange-100 text-orange-700 border-orange-200',
  P2: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  P3: 'bg-blue-100 text-blue-700 border-blue-200',
};

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

  return (
    <div className="space-y-5">
      <CompactKpiStrip>
        <CompactKpi label="Findings" value={formatNumber(stats?.total_findings)} />
        <CompactKpi label="Scored" value={formatNumber(stats?.scored_findings)} />
        <CompactKpi label="Unscored" value={formatNumber(stats?.unscored_findings)} tone="muted" />
        <CompactKpi label="P0 findings" value={formatNumber(stats?.priority_distribution.P0 ?? 0)} tone="red" />
        <CompactKpi label="Internet" value={formatNumber(stats?.exposure_distribution.internet ?? 0)} tone="orange" />
        <CompactKpi label="Internal" value={formatNumber(stats?.exposure_distribution.internal ?? 0)} />
      </CompactKpiStrip>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Findings</h2>
          <p className="text-sm text-gray-500">Matched asset software against NVD affected CPEs.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleMatch}
            disabled={calculating}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors min-w-[140px]"
          >
            {matching ? (
              <span className="flex items-center gap-2 justify-center">
                <span className="inline-block w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin" />
                Matching...
              </span>
            ) : (
              'Run Matching'
            )}
          </button>
          <button
            onClick={handleScore}
            disabled={calculating}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 transition-colors min-w-[140px]"
          >
            {scoring ? (
              <span className="flex items-center gap-2 justify-center">
                <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Scoring...
              </span>
            ) : (
              'Score Findings'
            )}
          </button>
        </div>
      </div>

      {msg && <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{msg}</div>}
      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-3">
        <label className="min-w-[220px] flex-1">
          <span className="mb-1 block text-xs font-medium text-gray-500">Search</span>
          <input
            value={filters.search}
            onChange={(event) => {
              setPage(1);
              setFilters((prev) => ({ ...prev, search: event.target.value }));
            }}
            placeholder="Asset, CVE, or summary..."
            className="w-full rounded-md border-gray-300 text-sm focus:border-gray-500 focus:ring-gray-500"
          />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-gray-500">Priority</span>
          <select
            value={filters.priority_level}
            onChange={(event) => {
              setPage(1);
              setFilters((prev) => ({ ...prev, priority_level: event.target.value }));
            }}
            className="rounded-md border-gray-300 text-sm focus:border-gray-500 focus:ring-gray-500"
          >
            <option value="">All</option>
            {['P0', 'P1', 'P2', 'P3'].map((level) => <option key={level} value={level}>{level}</option>)}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-gray-500">Exposure</span>
          <select
            value={filters.internet_exposure}
            onChange={(event) => {
              setPage(1);
              setFilters((prev) => ({ ...prev, internet_exposure: event.target.value }));
            }}
            className="rounded-md border-gray-300 text-sm focus:border-gray-500 focus:ring-gray-500"
          >
            <option value="">All</option>
            {['internet', 'internal', 'isolated', 'unknown'].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1.5 pb-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={filters.kev_only}
            onChange={(event) => {
              setPage(1);
              setFilters((prev) => ({ ...prev, kev_only: event.target.checked }));
            }}
            className="rounded border-gray-300 text-gray-900 focus:ring-gray-500"
          />
          KEV only
        </label>
        <button
          onClick={() => {
            setPage(1);
            setFilters({ search: '', priority_level: '', kev_only: false, internet_exposure: '' });
          }}
          className="rounded-md px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
        >
          Reset
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              {['Priority', 'Asset', 'Component', 'CVE', 'CVSS', 'EPSS', 'Match'].map((label) => (
                <th key={label} className="px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-3 py-12 text-center text-gray-400">Loading...</td></tr>
            ) : findings.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-12 text-center text-gray-400">No findings yet. Import assets, ingest NVD, then run matching.</td></tr>
            ) : findings.map((finding) => (
              <Fragment key={finding.id}>
                <tr
                  className={`cursor-pointer border-b border-gray-100 transition-colors align-top ${
                    expandedFindingIds.includes(finding.id) ? 'bg-gray-50' : 'hover:bg-gray-50'
                  }`}
                  role="button"
                  tabIndex={0}
                  aria-expanded={expandedFindingIds.includes(finding.id)}
                  onClick={() => toggleFinding(finding.id)}
                  onKeyDown={(event) => handleFindingKeyDown(event, finding.id)}
                >
                  <td className="px-3 py-3">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-gray-300 text-xs font-semibold text-gray-500">
                        {expandedFindingIds.includes(finding.id) ? '-' : '+'}
                      </span>
                      <div>
                        {finding.priority_level ? (
                          <span className={`inline-flex rounded border px-2 py-0.5 text-xs font-semibold ${PRIORITY_COLORS[finding.priority_level] ?? 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                            {finding.priority_level} {finding.priority_score?.toFixed(1)}
                          </span>
                        ) : <span className="text-xs text-gray-400">Unscored</span>}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-sm">
                    <div className="font-medium text-gray-900">{finding.asset.name}</div>
                    <div className="text-xs text-gray-500">{finding.asset.internet_exposure} / {finding.asset.business_criticality}</div>
                  </td>
                  <td className="px-3 py-3 text-sm">
                    <div className="text-gray-900">{finding.component.name}</div>
                    <div className="text-xs text-gray-500">{finding.component.version ?? 'unknown version'}</div>
                  </td>
                  <td className="px-3 py-3 text-sm">
                    <div className="font-medium text-gray-900">{finding.vulnerability.cve_id}</div>
                    <div className="max-w-lg truncate text-xs text-gray-500">{finding.vulnerability.summary}</div>
                  </td>
                  <td className="px-3 py-3 text-sm text-gray-700">{finding.vulnerability.cvss_v31_score ?? '-'}</td>
                  <td className="px-3 py-3 text-sm text-gray-700">
                    {formatPercent(finding.vulnerability.epss_score)}
                  </td>
                  <td className="px-3 py-3 text-sm text-gray-700">
                    <div>{formatMatchType(finding.match_type)}</div>
                    <div className="text-xs text-gray-500">{finding.match_confidence.toFixed(1)}%</div>
                  </td>
                </tr>
                {expandedFindingIds.includes(finding.id) && (
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <td colSpan={7} className="px-3 py-4">
                      <FindingDetails finding={finding} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination page={page} perPage={50} total={total} onChange={setPage} />
    </div>
  );
}

function FindingDetails({ finding }: { finding: Finding }) {
  const componentVendor = finding.component.vendor ?? finding.component.cpe_vendor;
  const componentProduct = finding.component.product ?? finding.component.cpe_product;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-4">
        <section className="rounded-md border border-gray-200 bg-white p-3">
          <h3 className="text-sm font-semibold text-gray-900">Asset</h3>
          <dl className="mt-2 space-y-2 text-sm">
            <DetailRow label="Name" value={finding.asset.name} />
            <DetailRow label="Exposure" value={finding.asset.internet_exposure} />
            <DetailRow label="Criticality" value={finding.asset.business_criticality} />
            <DetailRow label="Patch complexity" value={finding.asset.patch_complexity} />
          </dl>
        </section>

        <section className="rounded-md border border-gray-200 bg-white p-3">
          <h3 className="text-sm font-semibold text-gray-900">Component</h3>
          <dl className="mt-2 space-y-2 text-sm">
            <DetailRow label="Name" value={finding.component.name} />
            <DetailRow label="Version" value={finding.component.version ?? '-'} />
            <DetailRow label="Vendor" value={componentVendor ?? '-'} />
            <DetailRow label="Product" value={componentProduct ?? '-'} />
          </dl>
        </section>

        <section className="rounded-md border border-gray-200 bg-white p-3">
          <h3 className="text-sm font-semibold text-gray-900">Vulnerability</h3>
          <dl className="mt-2 space-y-2 text-sm">
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

        <section className="rounded-md border border-gray-200 bg-white p-3">
          <h3 className="text-sm font-semibold text-gray-900">Finding</h3>
          <dl className="mt-2 space-y-2 text-sm">
            <DetailRow label="Status" value={finding.status} />
            <DetailRow label="Match" value={formatMatchType(finding.match_type)} />
            <DetailRow label="Confidence" value={`${finding.match_confidence.toFixed(1)}%`} />
            <DetailRow label="Priority" value={formatPriority(finding.priority_level, finding.priority_score)} />
            <DetailRow label="Score confidence" value={finding.priority_confidence == null ? '-' : `${finding.priority_confidence.toFixed(1)}%`} />
          </dl>
        </section>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="rounded-md border border-gray-200 bg-white p-3">
          <h3 className="text-sm font-semibold text-gray-900">Component CPE</h3>
          {finding.component.cpe ? (
            <div className="mt-2 space-y-2">
              <code className="block break-all rounded bg-gray-100 px-2 py-1 text-xs text-gray-800">
                {finding.component.cpe}
              </code>
              <div className="flex flex-wrap gap-1 text-xs text-gray-500">
                {finding.component.cpe_vendor && <span className="rounded bg-gray-100 px-1.5 py-0.5">vendor: {finding.component.cpe_vendor}</span>}
                {finding.component.cpe_product && <span className="rounded bg-gray-100 px-1.5 py-0.5">product: {finding.component.cpe_product}</span>}
                {finding.component.cpe_version && <span className="rounded bg-gray-100 px-1.5 py-0.5">version: {finding.component.cpe_version}</span>}
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-gray-400">No CPE on this component.</p>
          )}
          {finding.component.purl && (
            <code className="mt-2 block break-all rounded bg-gray-100 px-2 py-1 text-xs text-gray-800">
              {finding.component.purl}
            </code>
          )}
        </section>

        <section className="rounded-md border border-gray-200 bg-white p-3">
          <h3 className="text-sm font-semibold text-gray-900">Timeline and Summary</h3>
          <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
            <DetailRow label="First seen" value={formatDate(finding.first_seen_at)} />
            <DetailRow label="Last seen" value={formatDate(finding.last_seen_at)} />
          </dl>
          <p className="mt-3 text-sm text-gray-700">
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
      <dt className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</dt>
      <dd className="mt-0.5 break-words text-gray-800">{value}</dd>
    </div>
  );
}

function formatMatchType(value: string): string {
  return value.replace(/_/g, ' ');
}

function formatPercent(value: number | null): string {
  return value == null ? '-' : `${(value * 100).toFixed(2)}%`;
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
