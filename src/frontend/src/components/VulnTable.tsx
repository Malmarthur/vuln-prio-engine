import { Fragment, useEffect, useState } from 'react';
import { fetchVulnerabilities, PaginatedVulnerabilities } from '../api/client';
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
  hideSmall?: boolean;
}

const COLUMNS: Column[] = [
  { key: null, label: 'Identifier' },
  { key: null, label: 'Summary' },
  { key: null, label: 'Priority' },
  { key: 'priority_score', label: 'Score' },
  { key: null, label: 'Severity' },
  { key: 'cvss_v31_score', label: 'CVSS' },
  { key: 'epss_score', label: 'EPSS' },
  { key: null, label: 'KEV' },
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
    setLoading(true);
    setError(null);
    fetchVulnerabilities(params)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [params]);

  const handleSort = (col: string | null) => {
    if (!col) return;
    setParams((p) => ({
      ...p,
      sort_by: col,
      sort_order: p.sort_by === col && p.sort_order === 'desc' ? 'asc' : 'desc',
      page: 1,
    }));
  };

  return (
    <>
      <Filters filters={params} onChange={setParams} />

      {error && (
        <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              {COLUMNS.map((c) => (
                <th
                  key={c.label}
                  onClick={() => handleSort(c.key)}
                  className={`px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider ${
                    c.key ? 'cursor-pointer select-none hover:text-gray-900' : ''
                  } ${c.hideSmall ? 'hidden md:table-cell' : ''}`}
                >
                  {c.label}
                  {c.key && params.sort_by === c.key && (
                    <span className="ml-1">
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
                <td
                  colSpan={COLUMNS.length}
                  className="px-3 py-12 text-center text-gray-400"
                >
                  Loading...
                </td>
              </tr>
            ) : data.items.length === 0 ? (
              <tr>
                <td
                  colSpan={COLUMNS.length}
                  className="px-3 py-12 text-center text-gray-400"
                >
                  No vulnerabilities found. Try adjusting filters or trigger an
                  ingestion from Settings.
                </td>
              </tr>
            ) : (
              data.items.map((vuln) => {
                const rowKey = vuln.cve_id || vuln.euvd_id || vuln.id;
                return (
                  <Fragment key={rowKey}>
                    <VulnRow
                      vuln={vuln}
                      expanded={expandedCve === rowKey}
                      onToggle={() =>
                        setExpandedCve(expandedCve === rowKey ? null : rowKey)
                      }
                    />
                    {expandedCve === rowKey && (
                      <tr>
                        <td colSpan={COLUMNS.length} className="p-0">
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
    </>
  );
}
