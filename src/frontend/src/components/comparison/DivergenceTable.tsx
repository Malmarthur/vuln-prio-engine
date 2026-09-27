import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ComparisonItem, PaginatedComparisonItems, fetchComparisonItems } from '../../api/client';
import { PriorityBadge } from '../../lib/priority';
import { getErrorMessage } from '../../lib/utils';

type Movement = 'promoted' | 'demoted' | 'unchanged' | '';
type Sort = 'abs_rank_delta' | 'abs_score_delta' | 'label';

export default function DivergenceTable({ jobId, candidateId, levels }: { jobId: string; candidateId: string; levels: string[] }) {
  const [data, setData] = useState<PaginatedComparisonItems | null>(null);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [movement, setMovement] = useState<Movement>('');
  const [fromPriority, setFromPriority] = useState('');
  const [toPriority, setToPriority] = useState('');
  const [sort, setSort] = useState<Sort>('abs_rank_delta');
  const [selected, setSelected] = useState<ComparisonItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => { setPage(1); }, [candidateId, debouncedQuery, movement, fromPriority, toPriority, sort]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchComparisonItems(jobId, {
      candidate_id: candidateId,
      page,
      per_page: 50,
      q: debouncedQuery || undefined,
      movement,
      from_priority: fromPriority || undefined,
      to_priority: toPriority || undefined,
      sort,
      order: 'desc',
    }, controller.signal)
      .then(setData)
      .catch((reason) => { if (!controller.signal.aborted) setError(getErrorMessage(reason)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [jobId, candidateId, page, debouncedQuery, movement, fromPriority, toPriority, sort]);

  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / 50));
  return (
    <section className="panel overflow-hidden" aria-labelledby="divergence-heading">
      <div className="panel-header">
        <div><h3 id="divergence-heading" className="panel-title">Most divergent items</h3><p className="panel-subtitle">Rank movement is positive when an item moves closer to the top of the queue.</p></div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-4 py-2.5">
        <label className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-gray-400" />
          <span className="sr-only">Search divergent items</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search CVE, asset or finding" className="field w-full py-1 pl-8 pr-3" />
        </label>
        <FilterSelect label="Movement" value={movement} onChange={(value) => setMovement(value as Movement)} options={[['', 'All movements'], ['promoted', 'Promoted'], ['demoted', 'Demoted'], ['unchanged', 'Unchanged']]} />
        <FilterSelect label="From priority" value={fromPriority} onChange={setFromPriority} options={[['', 'Any origin'], ...levels.map((level) => [level, `From ${level}`])]} />
        <FilterSelect label="To priority" value={toPriority} onChange={setToPriority} options={[['', 'Any destination'], ...levels.map((level) => [level, `To ${level}`])]} />
        <FilterSelect label="Sort" value={sort} onChange={(value) => setSort(value as Sort)} options={[['abs_rank_delta', 'Sort: largest rank shift'], ['abs_score_delta', 'Sort: largest score shift'], ['label', 'Sort: name']]} />
      </div>

      {error && <div className="notice-error m-4">{error}</div>}
      <div className="hidden md:block">
        <table className="data-table w-full table-fixed">
          <thead><tr><th className="w-[36%]">Item</th><th className="w-[18%]">Priority</th><th className="w-[12%] !text-right">Score Δ</th><th className="w-[20%] !text-right">Rank</th><th className="w-[14%] !text-right">Movement</th></tr></thead>
          <tbody>
            {data?.items.map((item) => <DivergenceRow key={item.entity_id} item={item} onClick={() => setSelected(item)} />)}
          </tbody>
        </table>
      </div>
      <div className="divide-y divide-gray-200 md:hidden">
        {data?.items.map((item) => <DivergenceCard key={item.entity_id} item={item} onClick={() => setSelected(item)} />)}
      </div>
      {loading && <div className="p-8 text-center text-[13px] text-gray-500" role="status">Loading divergences…</div>}
      {!loading && !data?.items.length && !error && <div className="p-10 text-center"><div className="text-[13px] font-medium text-gray-700">No matching movements</div><div className="mt-1 text-xs text-gray-500">Try clearing one of the filters.</div></div>}
      <div className="flex items-center justify-between border-t border-gray-300 bg-gray-50 px-4 py-2 text-xs text-gray-600">
        <span className="font-mono">{(data?.total ?? 0).toLocaleString()} items</span>
        <div className="flex items-center gap-1"><button onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1} className="btn-secondary btn-sm px-1.5" aria-label="Previous page"><ChevronLeft className="h-3.5 w-3.5" /></button><span className="min-w-20 text-center font-mono">{page} / {pageCount}</span><button onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={page >= pageCount} className="btn-secondary btn-sm px-1.5" aria-label="Next page"><ChevronRight className="h-3.5 w-3.5" /></button></div>
      </div>
      {selected && <ItemDrawer item={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[][] }) {
  return <label><span className="sr-only">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="field py-1 pl-2.5 pr-8 text-xs">{options.map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select></label>;
}

function DivergenceRow({ item, onClick }: { item: ComparisonItem; onClick: () => void }) {
  return <tr onClick={onClick} className="cursor-pointer text-gray-700"><td className="truncate font-medium text-gray-900" title={item.label}>{item.label}</td><td><PriorityTransition item={item} /></td><td className="text-right font-mono">{signed(item.score_delta)}</td><td className="text-right font-mono">{item.baseline_rank?.toLocaleString() ?? '—'} <span className="text-gray-400">→</span> {item.candidate_rank?.toLocaleString() ?? '—'}</td><td className="text-right"><Movement value={item.rank_delta} /></td></tr>;
}

function DivergenceCard({ item, onClick }: { item: ComparisonItem; onClick: () => void }) {
  return <button onClick={onClick} className="w-full p-4 text-left"><div className="truncate text-[13px] font-semibold text-gray-900">{item.label}</div><div className="mt-3 grid grid-cols-3 gap-2 text-xs"><div><span className="label-caps block !text-[10px]">Priority</span><PriorityTransition item={item} /></div><div><span className="label-caps block !text-[10px]">Score Δ</span><span className="font-mono">{signed(item.score_delta)}</span></div><div><span className="label-caps block !text-[10px]">Movement</span><Movement value={item.rank_delta} /></div></div></button>;
}

function PriorityTransition({ item }: { item: ComparisonItem }) { return <span className="inline-flex items-center gap-1.5"><PriorityBadge level={item.baseline_priority} /><span className="text-gray-400">→</span><PriorityBadge level={item.candidate_priority} /></span>; }
function Movement({ value }: { value: number | null }) { if (!value) return <span className="text-gray-400">No change</span>; return <span className={`inline-flex items-center gap-1 font-mono font-medium ${value > 0 ? 'text-accent-700' : 'text-gray-500'}`}>{value > 0 ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}{Math.abs(value).toLocaleString()}</span>; }
function signed(value: number | null) { if (value == null) return '—'; return `${value > 0 ? '+' : ''}${value.toFixed(2)}`; }

function ItemDrawer({ item, onClose }: { item: ComparisonItem; onClose: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-gray-950/30" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <aside className="h-full w-full max-w-md overflow-y-auto border-l border-gray-300 bg-white shadow-xl" role="dialog" aria-modal="true" aria-labelledby="item-detail-title">
        <div className="panel-header sticky top-0 z-10">
          <div className="min-w-0"><div className="label-caps !text-[10px]">Divergent item</div><h3 id="item-detail-title" className="break-words text-[14px] font-semibold text-gray-900">{item.label}</h3></div>
          <button onClick={onClose} className="btn-ghost btn-sm px-1.5" aria-label="Close detail"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3"><Snapshot title="Reference" priority={item.baseline_priority} score={item.baseline_score} rank={item.baseline_rank} /><span className="text-gray-400">→</span><Snapshot title="Candidate" priority={item.candidate_priority} score={item.candidate_score} rank={item.candidate_rank} /></div>
          <div className="mt-4 border border-gray-200 bg-gray-50 p-3"><div className="label-caps">Net movement</div><div className="mt-2 grid grid-cols-2 gap-3"><div><div className="text-[11px] text-gray-500">Score delta</div><div className="font-mono text-lg font-semibold text-gray-900">{signed(item.score_delta)}</div></div><div><div className="text-[11px] text-gray-500">Rank delta</div><div className="text-lg"><Movement value={item.rank_delta} /></div></div></div></div>
        </div>
      </aside>
    </div>
  );
}

function Snapshot({ title, priority, score, rank }: { title: string; priority: string | null; score: number | null; rank: number | null }) { return <div className="border border-gray-300 p-3"><div className="label-caps !text-[10px]">{title}</div><div className="mt-2"><PriorityBadge level={priority} className="!text-[13px]" /></div><dl className="mt-3 space-y-1 text-xs"><div className="flex justify-between"><dt className="text-gray-500">Score</dt><dd className="font-mono font-semibold text-gray-800">{score?.toFixed(2) ?? '—'}</dd></div><div className="flex justify-between"><dt className="text-gray-500">Rank</dt><dd className="font-mono font-semibold text-gray-800">{rank?.toLocaleString() ?? '—'}</dd></div></dl></div>; }
