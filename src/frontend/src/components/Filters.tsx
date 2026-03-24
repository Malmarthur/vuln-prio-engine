import { useState, useEffect } from 'react';

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

interface FiltersProps {
  filters: FilterParams;
  onChange: (filters: FilterParams) => void;
}

const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NONE'];
const PRIORITIES = ['V0', 'V1', 'V2', 'V3'];

export default function Filters({ filters, onChange }: FiltersProps) {
  const [searchInput, setSearchInput] = useState(filters.search || '');

  // Sync local state when parent resets filters (e.g. Reset button)
  useEffect(() => {
    setSearchInput(filters.search || '');
  }, [filters.search]);

  // Debounce search input: propagate to parent after 300ms of no typing
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== (filters.search || '')) {
        onChange({ ...filters, search: searchInput, page: 1 });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key: keyof FilterParams, value: string | number | boolean) =>
    onChange({ ...filters, [key]: value, page: 1 });

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
      <div className="flex flex-wrap gap-3 items-end">
        {/* Search */}
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Search
          </label>
          <input
            type="text"
            placeholder="CVE ID or keyword..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full rounded-md border-gray-300 shadow-sm text-sm focus:border-gray-500 focus:ring-gray-500"
          />
        </div>

        {/* Severity */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Severity
          </label>
          <select
            value={filters.severity || ''}
            onChange={(e) => set('severity', e.target.value)}
            className="rounded-md border-gray-300 shadow-sm text-sm focus:border-gray-500 focus:ring-gray-500"
          >
            <option value="">All</option>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {/* KEV Only */}
        <label className="flex items-center gap-1.5 text-sm text-gray-700 pb-0.5">
          <input
            type="checkbox"
            checked={filters.kev_only || false}
            onChange={(e) => set('kev_only', e.target.checked)}
            className="rounded border-gray-300 text-gray-900 focus:ring-gray-500"
          />
          KEV only
        </label>

        {/* Min EPSS */}
        <div className="w-24">
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Min EPSS
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            max="1"
            placeholder="0-1"
            value={filters.min_epss ?? ''}
            onChange={(e) => set('min_epss', e.target.value)}
            className="w-full rounded-md border-gray-300 shadow-sm text-sm focus:border-gray-500 focus:ring-gray-500"
          />
        </div>

        {/* Min CVSS */}
        <div className="w-24">
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Min CVSS
          </label>
          <input
            type="number"
            step="0.1"
            min="0"
            max="10"
            placeholder="0-10"
            value={filters.min_cvss ?? ''}
            onChange={(e) => set('min_cvss', e.target.value)}
            className="w-full rounded-md border-gray-300 shadow-sm text-sm focus:border-gray-500 focus:ring-gray-500"
          />
        </div>

        {/* Date from */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            From
          </label>
          <input
            type="date"
            value={filters.date_from || ''}
            onChange={(e) => set('date_from', e.target.value)}
            className="rounded-md border-gray-300 shadow-sm text-sm focus:border-gray-500 focus:ring-gray-500"
          />
        </div>

        {/* Date to */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            To
          </label>
          <input
            type="date"
            value={filters.date_to || ''}
            onChange={(e) => set('date_to', e.target.value)}
            className="rounded-md border-gray-300 shadow-sm text-sm focus:border-gray-500 focus:ring-gray-500"
          />
        </div>

        {/* Priority */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Priority
          </label>
          <select
            value={filters.priority_level || ''}
            onChange={(e) => set('priority_level', e.target.value)}
            className="rounded-md border-gray-300 shadow-sm text-sm focus:border-gray-500 focus:ring-gray-500"
          >
            <option value="">All</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        {/* Reset */}
        <button
          onClick={() =>
            onChange({
              page: 1,
              per_page: filters.per_page,
              sort_by: filters.sort_by,
              sort_order: filters.sort_order,
            })
          }
          className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
