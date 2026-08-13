import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ComparisonItem, PaginatedComparisonItems, fetchComparisonItems } from '../../api/client';
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
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-labelledby="divergence-heading">
      <div className="border-b border-slate-100 p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div><h3 id="divergence-heading" className="text-sm font-semibold text-slate-900">Most divergent items</h3><p className="mt-1 text-xs text-slate-500">Rank movement is positive when an item moves closer to the top of the queue.</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-[210px] flex-1 lg:flex-none">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <span className="sr-only">Search divergent items</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search CVE, asset or finding" className="w-full rounded-lg border-slate-200 py-2 pl-9 pr-3 text-xs focus:border-indigo-400 focus:ring-indigo-400" />
            </label>
            <FilterSelect label="Movement" value={movement} onChange={(value) => setMovement(value as Movement)} options={[['', 'All movements'], ['promoted', 'Promoted'], ['demoted', 'Demoted'], ['unchanged', 'Unchanged']]} />
            <FilterSelect label="From priority" value={fromPriority} onChange={setFromPriority} options={[['', 'Any origin'], ...levels.map((level) => [level, `From ${level}`])]} />
            <FilterSelect label="To priority" value={toPriority} onChange={setToPriority} options={[['', 'Any destination'], ...levels.map((level) => [level, `To ${level}`])]} />
            <FilterSelect label="Sort" value={sort} onChange={(value) => setSort(value as Sort)} options={[['abs_rank_delta', 'Largest rank shift'], ['abs_score_delta', 'Largest score shift'], ['label', 'Name']]} icon />
          </div>
        </div>
      </div>

      {error && <div className="m-5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      <div className="hidden md:block">
        <table className="w-full table-fixed text-left">
          <thead className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400"><tr><th className="w-[34%] px-5 py-3">Item</th><th className="w-[20%] px-3 py-3">Priority</th><th className="w-[14%] px-3 py-3">Score Δ</th><th className="w-[18%] px-3 py-3">Rank</th><th className="w-[14%] px-3 py-3">Movement</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {data?.items.map((item) => <DivergenceRow key={item.entity_id} item={item} onClick={() => setSelected(item)} />)}
          </tbody>
        </table>
      </div>
      <div className="divide-y divide-slate-100 md:hidden">
        {data?.items.map((item) => <DivergenceCard key={item.entity_id} item={item} onClick={() => setSelected(item)} />)}
      </div>
      {loading && <div className="p-8 text-center text-sm text-slate-400" role="status">Loading divergences…</div>}
      {!loading && !data?.items.length && !error && <div className="p-10 text-center"><div className="text-sm font-medium text-slate-600">No matching movements</div><div className="mt-1 text-xs text-slate-400">Try clearing one of the filters.</div></div>}
      <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500 sm:px-5">
        <span>{(data?.total ?? 0).toLocaleString()} items</span>
        <div className="flex items-center gap-2"><button onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1} className="rounded-md border border-slate-200 p-1.5 disabled:opacity-30" aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button><span className="min-w-20 text-center tabular-nums">{page} / {pageCount}</span><button onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={page >= pageCount} className="rounded-md border border-slate-200 p-1.5 disabled:opacity-30" aria-label="Next page"><ChevronRight className="h-4 w-4" /></button></div>
      </div>
      {selected && <ItemDrawer item={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}

function FilterSelect({ label, value, onChange, options, icon = false }: { label: string; value: string; onChange: (value: string) => void; options: string[][]; icon?: boolean }) {
  return <label className="relative"><span className="sr-only">{label}</span>{icon && <SlidersHorizontal className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />}<select value={value} onChange={(event) => onChange(event.target.value)} className={`rounded-lg border-slate-200 py-2 pr-8 text-xs text-slate-600 focus:border-indigo-400 focus:ring-indigo-400 ${icon ? 'pl-8' : 'pl-3'}`}>{options.map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select></label>;
}

function DivergenceRow({ item, onClick }: { item: ComparisonItem; onClick: () => void }) {
  return <tr onClick={onClick} className="cursor-pointer text-xs text-slate-600 transition-colors hover:bg-indigo-50/30"><td className="truncate px-5 py-3.5 font-semibold text-slate-800" title={item.label}>{item.label}</td><td className="px-3 py-3.5"><PriorityTransition item={item} /></td><td className="px-3 py-3.5 font-mono tabular-nums">{signed(item.score_delta)}</td><td className="px-3 py-3.5 font-mono tabular-nums">{item.baseline_rank?.toLocaleString() ?? '—'} <span className="text-slate-300">→</span> {item.candidate_rank?.toLocaleString() ?? '—'}</td><td className="px-3 py-3.5"><Movement value={item.rank_delta} /></td></tr>;
}

function DivergenceCard({ item, onClick }: { item: ComparisonItem; onClick: () => void }) {
  return <button onClick={onClick} className="w-full p-4 text-left"><div className="truncate text-sm font-semibold text-slate-800">{item.label}</div><div className="mt-3 grid grid-cols-3 gap-2 text-xs"><div><span className="block text-[10px] uppercase text-slate-400">Priority</span><PriorityTransition item={item} /></div><div><span className="block text-[10px] uppercase text-slate-400">Score Δ</span><span className="font-mono">{signed(item.score_delta)}</span></div><div><span className="block text-[10px] uppercase text-slate-400">Movement</span><Movement value={item.rank_delta} /></div></div></button>;
}

function PriorityTransition({ item }: { item: ComparisonItem }) { return <span className="font-semibold"><span className="text-slate-500">{item.baseline_priority ?? '—'}</span><span className="mx-1.5 text-slate-300">→</span><span className="text-slate-900">{item.candidate_priority ?? '—'}</span></span>; }
function Movement({ value }: { value: number | null }) { if (!value) return <span className="text-slate-400">No change</span>; return <span className={`inline-flex items-center gap-1 font-semibold ${value > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{value > 0 ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}{Math.abs(value).toLocaleString()}</span>; }
function signed(value: number | null) { if (value == null) return '—'; return `${value > 0 ? '+' : ''}${value.toFixed(2)}`; }

function ItemDrawer({ item, onClose }: { item: ComparisonItem; onClose: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);
  return <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/20 backdrop-blur-[1px]" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><aside className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="item-detail-title"><div className="flex items-start justify-between gap-4"><div><div className="text-[10px] font-bold uppercase tracking-[0.14em] text-indigo-600">Divergent item</div><h3 id="item-detail-title" className="mt-2 break-words text-lg font-semibold text-slate-950">{item.label}</h3></div><button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close detail"><X className="h-5 w-5" /></button></div><div className="mt-8 grid grid-cols-[1fr_auto_1fr] items-center gap-3"><Snapshot title="Reference" priority={item.baseline_priority} score={item.baseline_score} rank={item.baseline_rank} /><span className="text-slate-300">→</span><Snapshot title="Candidate" priority={item.candidate_priority} score={item.candidate_score} rank={item.candidate_rank} /></div><div className="mt-6 rounded-xl bg-slate-50 p-4"><div className="text-xs font-semibold text-slate-700">Net movement</div><div className="mt-3 grid grid-cols-2 gap-3"><div><div className="text-[10px] uppercase text-slate-400">Score delta</div><div className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-800">{signed(item.score_delta)}</div></div><div><div className="text-[10px] uppercase text-slate-400">Rank delta</div><div className="mt-1 text-lg"><Movement value={item.rank_delta} /></div></div></div></div></aside></div>;
}

function Snapshot({ title, priority, score, rank }: { title: string; priority: string | null; score: number | null; rank: number | null }) { return <div className="rounded-xl border border-slate-200 p-4"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{title}</div><div className="mt-3 text-2xl font-semibold text-slate-900">{priority ?? '—'}</div><dl className="mt-4 space-y-2 text-xs"><div className="flex justify-between"><dt className="text-slate-400">Score</dt><dd className="font-mono font-semibold tabular-nums text-slate-700">{score?.toFixed(2) ?? '—'}</dd></div><div className="flex justify-between"><dt className="text-slate-400">Rank</dt><dd className="font-mono font-semibold tabular-nums text-slate-700">{rank?.toLocaleString() ?? '—'}</dd></div></dl></div>; }
