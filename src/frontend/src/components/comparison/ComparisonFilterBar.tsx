import { Search, SlidersHorizontal, Star, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ScoringScope } from '../../api/client';
import {
  AttributeFilters,
  ComparisonView,
  CRITICALITIES,
  DEFAULT_VIEW,
  describeAttributes,
  EXPOSURES,
  SEVERITIES,
  scopeFields,
  viewChips,
} from './filters';

function ToggleGroup({ label, options, value, onChange }: { label: string; options: string[]; value: string[]; onChange: (value: string[]) => void }) {
  return (
    <fieldset>
      <legend className="label-caps mb-1 !text-[10px]">{label}</legend>
      <div className="flex flex-wrap gap-1">
        {options.map((option) => {
          const active = value.includes(option);
          return (
            <button
              key={option}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(active ? value.filter((item) => item !== option) : [...value, option])}
              className={`border px-2 py-0.5 text-[11px] font-medium capitalize ${active ? 'border-gray-800 bg-gray-800 text-white' : 'border-gray-300 bg-white text-gray-600 hover:border-gray-500'}`}
            >{option.toLowerCase()}</button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Attribute filter inputs shared by the view filter popover and the population composer. */
export function AttributeFilterFields({
  scope,
  value,
  onChange,
  followedCount,
  showSearch = true,
}: {
  scope: ScoringScope;
  value: AttributeFilters;
  onChange: (value: AttributeFilters) => void;
  followedCount?: number;
  showSearch?: boolean;
}) {
  const fields = scopeFields(scope);
  const set = (patch: Partial<AttributeFilters>) => onChange({ ...value, ...patch });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {showSearch && (
        <label className="sm:col-span-2">
          <span className="label-caps mb-1 block !text-[10px]">Search</span>
          <input value={value.q} onChange={(event) => set({ q: event.target.value })} placeholder={fields.vulnerability ? 'CVE, asset, vendor or product' : 'Asset, vendor or product'} className="field w-full py-1" />
        </label>
      )}
      <label>
        <span className="label-caps mb-1 block !text-[10px]">Vendor</span>
        <input value={value.vendor} onChange={(event) => set({ vendor: event.target.value })} placeholder="e.g. microsoft" className="field w-full py-1" />
      </label>
      <label>
        <span className="label-caps mb-1 block !text-[10px]">Product</span>
        <input value={value.product} onChange={(event) => set({ product: event.target.value })} placeholder="e.g. exchange" className="field w-full py-1" />
      </label>
      {fields.vulnerability && <>
        <label>
          <span className="label-caps mb-1 block !text-[10px]">Known exploited (KEV)</span>
          <select value={value.kev} onChange={(event) => set({ kev: event.target.value as AttributeFilters['kev'] })} className="field w-full py-1 text-xs">
            <option value="">Any</option>
            <option value="true">In KEV only</option>
            <option value="false">Not in KEV</option>
          </select>
        </label>
        <label>
          <span className="label-caps mb-1 block !text-[10px]">Minimum EPSS</span>
          <input type="number" min={0} max={1} step={0.01} value={value.minEpss} onChange={(event) => set({ minEpss: event.target.value })} placeholder="0 – 1" className="field w-full py-1" />
        </label>
        <div className="sm:col-span-2"><ToggleGroup label="CVSS severity" options={SEVERITIES} value={value.severities} onChange={(severities) => set({ severities })} /></div>
      </>}
      {fields.asset && <>
        <ToggleGroup label="Business criticality" options={CRITICALITIES} value={value.criticalities} onChange={(criticalities) => set({ criticalities })} />
        <ToggleGroup label="Internet exposure" options={EXPOSURES} value={value.exposures} onChange={(exposures) => set({ exposures })} />
      </>}
      <label className="flex items-center gap-2 text-xs text-gray-700 sm:col-span-2">
        <input type="checkbox" checked={value.followedOnly} onChange={(event) => set({ followedOnly: event.target.checked })} />
        <Star className="h-3.5 w-3.5 text-accent-600" /> Followed items only{followedCount != null && <span className="font-mono text-gray-500">({followedCount.toLocaleString()})</span>}
      </label>
    </div>
  );
}

/**
 * Search, attribute filters and the active filter chips. Attribute filters
 * recompute the charts; chart selections only filter the item table.
 */
export default function ComparisonFilterBar({
  scope,
  view,
  onChange,
  followedCount,
  filteredTotal,
  populationTotal,
  loading,
}: {
  scope: ScoringScope;
  view: ComparisonView;
  onChange: (view: ComparisonView) => void;
  followedCount: number;
  filteredTotal: number | null;
  populationTotal: number;
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(view.attributes.q);
  const popover = useRef<HTMLDivElement>(null);
  const chips = viewChips(view);
  const attributeCount = describeAttributes({ ...view.attributes, q: '' }).length;

  useEffect(() => { setQuery(view.attributes.q); }, [view.attributes.q]);
  useEffect(() => {
    if (query === view.attributes.q) return;
    const timer = window.setTimeout(() => onChange({ ...view, attributes: { ...view.attributes, q: query } }), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (popover.current && !popover.current.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    window.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', close); window.removeEventListener('keydown', escape); };
  }, [open]);

  return (
    <section className="panel overflow-visible" aria-label="Comparison filters">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
        <label className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-gray-400" />
          <span className="sr-only">Search items</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={scopeFields(scope).vulnerability ? 'Search CVE, asset, vendor or product' : 'Search asset, vendor or product'} className="field w-full py-1 pl-8 pr-3" />
        </label>
        <div className="relative" ref={popover}>
          <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className={`btn-secondary btn-sm ${attributeCount ? '!border-accent-600 !text-accent-800' : ''}`}>
            <SlidersHorizontal className="h-3.5 w-3.5" /> Filters{attributeCount ? ` (${attributeCount})` : ''}
          </button>
          {open && (
            <div className="absolute right-0 top-full z-40 mt-1 w-[min(420px,90vw)] border border-gray-300 bg-white p-3 shadow-lg">
              <AttributeFilterFields scope={scope} value={view.attributes} onChange={(attributes) => onChange({ ...view, attributes })} followedCount={followedCount} showSearch={false} />
            </div>
          )}
        </div>
        <span className="font-mono text-[11px] text-gray-500" role="status">
          {loading ? 'Updating…' : filteredTotal != null ? `${filteredTotal.toLocaleString()} of ${populationTotal.toLocaleString()} items` : `${populationTotal.toLocaleString()} items`}
        </span>
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-gray-200 bg-gray-50 px-4 py-2">
          <span className="label-caps mr-1 !text-[10px]">Active</span>
          {chips.map((chip) => (
            <span key={chip.id} className="inline-flex items-center gap-1 border border-gray-300 bg-white py-0.5 pl-2 pr-1 text-[11px] font-medium text-gray-700">
              {chip.label}
              <button type="button" onClick={() => onChange(chip.clear(view))} className="p-0.5 text-gray-400 hover:text-gray-900" aria-label={`Remove filter ${chip.label}`}><X className="h-3 w-3" /></button>
            </span>
          ))}
          <button type="button" onClick={() => onChange({ ...DEFAULT_VIEW, topN: view.topN, sort: view.sort })} className="ml-1 text-[11px] font-semibold text-gray-600 underline hover:text-gray-900">Clear all</button>
        </div>
      )}
    </section>
  );
}
