import { useState, useEffect, useRef } from 'react';

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

  // Keep refs up-to-date so the debounce effect always reads the latest values
  // without re-running when filters/onChange change (that would reset the timer)
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Sync local state when parent resets filters (e.g. Reset button)
  useEffect(() => {
    setSearchInput(filters.search || '');
  }, [filters.search]);

  // Debounce search input: propagate to parent after 300ms of no typing
  useEffect(() => {
    const timer = setTimeout(() => {
      const f = filtersRef.current;
      if (searchInput !== (f.search || '')) {
        onChangeRef.current({ ...f, search: searchInput, page: 1 });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const set = (key: keyof FilterParams, value: string | number | boolean) =>
    onChange({ ...filters, [key]: value, page: 1 });

  return (
    <div className="border-b border-gray-200 px-4 py-2.5">
      <div className="flex flex-wrap items-end gap-3">
        {/* Search */}
        <div className="flex-1 min-w-[200px]">
          <label className="label-caps mb-1 block !text-[10px]">
            Search
          </label>
          <input
            type="text"
            placeholder="CVE ID or keyword..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="field w-full py-1"
          />
        </div>

        {/* Severity */}
        <div>
          <label className="label-caps mb-1 block !text-[10px]">
            Severity
          </label>
          <select
            value={filters.severity || ''}
            onChange={(e) => set('severity', e.target.value)}
            className="field py-1"
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
        <label className="flex items-center gap-1.5 pb-1.5 text-[13px] text-gray-700">
          <input
            type="checkbox"
            checked={filters.kev_only || false}
            onChange={(e) => set('kev_only', e.target.checked)}
            className="rounded-sm border-gray-400 text-accent-700 focus:ring-accent-500"
          />
          KEV only
        </label>

        {/* Min EPSS */}
        <div className="w-24">
          <label className="label-caps mb-1 block !text-[10px]">
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
            className="field w-full py-1"
          />
        </div>

        {/* Min CVSS */}
        <div className="w-24">
          <label className="label-caps mb-1 block !text-[10px]">
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
            className="field w-full py-1"
          />
        </div>

        {/* Date from */}
        <div>
          <label className="label-caps mb-1 block !text-[10px]">
            From
          </label>
          <input
            type="date"
            value={filters.date_from || ''}
            onChange={(e) => set('date_from', e.target.value)}
            className="field py-1"
          />
        </div>

        {/* Date to */}
        <div>
          <label className="label-caps mb-1 block !text-[10px]">
            To
          </label>
          <input
            type="date"
            value={filters.date_to || ''}
            onChange={(e) => set('date_to', e.target.value)}
            className="field py-1"
          />
        </div>

        {/* Priority */}
        <div>
          <label className="label-caps mb-1 block !text-[10px]">
            Priority
          </label>
          <select
            value={filters.priority_level || ''}
            onChange={(e) => set('priority_level', e.target.value)}
            className="field py-1"
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
          className="btn-ghost btn-sm mb-0.5"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
