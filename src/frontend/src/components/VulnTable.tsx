import { Fragment, useCallback, useEffect, useState } from 'react';
import { fetchVulnerabilities, PaginatedVulnerabilities } from '../api/client';
import { useActivityFinished } from '../lib/activity';
import { getErrorMessage } from '../lib/utils';
import Filters from './Filters';
import Pagination from './Pagination';
import VulnDetail from './VulnDetail';
import VulnRow from './VulnRow';

export interface FilterParams {
  page: number;
  per_page: number;
  sort_by: string;
  sort_order: string;
  search?: string;
  severity?: string;
  kev_only?: boolean;
  min_epss?: string | number;
  min_cvss?: string | number;
  date_from?: string;
  date_to?: string;
  priority_level?: string;
}

interface Column {
  key: string | null;
  label: string;
  align?: 'right' | 'center';
  hideSmall?: boolean;
}

const COLUMNS: Column[] = [
  { key: null, label: 'Identifier' },
  { key: null, label: 'Summary' },
  { key: null, label: 'Priority' },
  { key: 'priority_score', label: 'Score', align: 'right' },
  { key: null, label: 'Severity' },
  { key: 'cvss_v31_score', label: 'CVSS', align: 'right' },
  { key: 'epss_score', label: 'EPSS', align: 'right' },
  { key: null, label: 'KEV', align: 'center' },
  { key: 'published_date', label: 'Published', hideSmall: true },
];

const DEFAULT_PARAMS: FilterParams = {
  page: 1,
  per_page: 50,
  sort_by: 'published_date',
  sort_order: 'desc',
};

export default function VulnTable() {
  const [params, setParams] = useState<FilterParams>(DEFAULT_PARAMS);
  const [data, setData] = useState<PaginatedVulnerabilities>({ items: [], total: 0, page: 1, per_page: 50 });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCve, setExpandedCve] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchVulnerabilities(params as unknown as Record<string, string | number | boolean | null | undefined>, controller.signal)
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((e: unknown) => {
        // Ignore abort errors — a new request is already in flight
        if (e instanceof Error && e.name === 'AbortError') return;
        setError(getErrorMessage(e));
        setLoading(false);
      });
    return () => controller.abort();
  }, [params]);

  // New scores or ingested data: refetch the current page with the same filters.
  useActivityFinished((task) => task.kind === 'ingestion' || (task.kind === 'run' && (task.scope === 'vulnerability' || task.scope === 'preset')), () => setParams((p) => ({ ...p })));

  const handleSort = (col: string | null) => {
    if (!col) return;
    setParams((p) => ({
      ...p,
      sort_by: col,
      sort_order: p.sort_by === col && p.sort_order === 'desc' ? 'asc' : 'desc',
      page: 1,
    }));
  };

  // Stable callback — VulnRow (React.memo) won't re-render just because the
  // parent re-renders; only rows whose `expanded` prop actually changes will.
  const handleToggle = useCallback((key: string) => {
    setExpandedCve((prev) => prev === key ? null : key);
  }, []);

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Vulnerability catalog</h2>
          <p className="panel-subtitle">Priority (V0–V3) is Harmonia's score; severity is the raw CVSS rating from the source.</p>
        </div>
      </div>
      <Filters filters={params} onChange={setParams} />

      {error && <div className="notice-error m-4">{error}</div>}

      <div className="overflow-x-auto">
        <table className="data-table w-full">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th
                  key={c.label}
                  onClick={() => handleSort(c.key)}
                  aria-sort={c.key && params.sort_by === c.key ? (params.sort_order === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={`${c.key ? 'cursor-pointer select-none hover:text-gray-900' : ''} ${c.align === 'right' ? '!text-right' : c.align === 'center' ? '!text-center' : ''} ${c.hideSmall ? 'hidden md:table-cell' : ''}`}
                >
                  {c.label}
                  {c.key && params.sort_by === c.key && (
                    <span className="ml-1 text-accent-700">
                      {params.sort_order === 'asc' ? '\u25B2' : '\u25BC'}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={COLUMNS.length} className="py-12 text-center text-gray-500">
                  Loading…
                </td>
              </tr>
            ) : data.items.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="py-12 text-center text-gray-500">
                  No vulnerabilities found. Adjust the filters or run an ingestion from Settings.
                </td>
              </tr>
            ) : (
              data.items.map((vuln) => {
                const rowKey = vuln.cve_id || vuln.euvd_id || vuln.id;
                return (
                  <Fragment key={rowKey}>
                    <VulnRow
                      vuln={vuln}
                      rowKey={rowKey}
                      expanded={expandedCve === rowKey}
                      onToggle={handleToggle}
                    />
                    {expandedCve === rowKey && vuln.cve_id && (
                      <tr className="hover:!bg-transparent">
                        <td colSpan={COLUMNS.length} className="!p-0">
                          <VulnDetail cveId={vuln.cve_id} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        page={params.page}
        perPage={params.per_page}
        total={data.total}
        onChange={(p: number) => setParams((prev) => ({ ...prev, page: p }))}
      />
    </section>
  );
}
