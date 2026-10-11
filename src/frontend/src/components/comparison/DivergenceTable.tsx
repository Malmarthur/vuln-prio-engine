import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Star, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ComparisonExplanation, ComparisonItem, PaginatedComparisonItems, ScoringScope, explainComparisonItem, fetchComparisonItems } from '../../api/client';
import { PriorityBadge } from '../../lib/priority';
import { getErrorMessage } from '../../lib/utils';
import { ComparisonView, ItemSort, Movement as MovementValue, viewQuery } from './filters';

const PER_PAGE = 50;

export default function DivergenceTable({
  jobId,
  candidateId,
  levels,
  scope,
  view,
  onViewChange,
  followed,
  onToggleFollow,
  onFollowMatching,
}: {
  jobId: string;
  candidateId: string;
  levels: string[];
  scope: ScoringScope;
  view: ComparisonView;
  onViewChange: (view: ComparisonView) => void;
  followed: Set<string>;
  onToggleFollow: (entityId: string) => void;
  onFollowMatching: () => Promise<void>;
}) {
  const [data, setData] = useState<PaginatedComparisonItems | null>(null);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ComparisonItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const query = viewQuery(view);
  const queryKey = JSON.stringify(query);
  const { selection } = view;
  const setSelection = (patch: Partial<ComparisonView['selection']>) => onViewChange({ ...view, selection: { ...selection, ...patch } });

  useEffect(() => { setPage(1); }, [candidateId, queryKey, view.sort]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchComparisonItems(jobId, {
      ...query,
      candidate_id: candidateId,
      page,
      per_page: PER_PAGE,
      sort: view.sort,
      order: view.sort === 'label' || view.sort.endsWith('_rank') ? 'asc' : 'desc',
    }, controller.signal)
      .then(setData)
      .catch((reason) => { if (!controller.signal.aborted) setError(getErrorMessage(reason)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [jobId, candidateId, page, queryKey, view.sort]);

  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / PER_PAGE));
  const followMatching = async () => {
    setFollowing(true);
    try { await onFollowMatching(); } finally { setFollowing(false); }
  };
  return (
    <section className="panel overflow-hidden" aria-labelledby="divergence-heading">
      <div className="panel-header">
        <div><h3 id="divergence-heading" className="panel-title">Most divergent items</h3><p className="panel-subtitle">Rank movement is positive when an item moves closer to the top of the queue. Star an item to follow it across comparisons.</p></div>
        <button type="button" onClick={followMatching} disabled={following || !data?.total} className="btn-secondary btn-sm shrink-0" title="Follow every item matching the current filters (largest rank shifts first, at most 1,000)">
          <Star className="h-3.5 w-3.5" /> {following ? 'Following…' : `Follow ${Math.min(data?.total ?? 0, 1000).toLocaleString()} matching`}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-4 py-2.5">
        <FilterSelect label="Movement" value={selection.movement} onChange={(value) => setSelection({ movement: value as MovementValue })} options={[['', 'All movements'], ['promoted', 'Promoted'], ['demoted', 'Demoted'], ['unchanged', 'Unchanged']]} />
        <FilterSelect label="From priority" value={selection.from} onChange={(from) => setSelection({ from })} options={[['', 'Any origin'], ...levels.map((level) => [level, `From ${level}`])]} />
        <FilterSelect label="To priority" value={selection.to} onChange={(to) => setSelection({ to })} options={[['', 'Any destination'], ...levels.map((level) => [level, `To ${level}`])]} />
        <FilterSelect label="Sort" value={view.sort} onChange={(value) => onViewChange({ ...view, sort: value as ItemSort })} options={[['abs_rank_delta', 'Sort: largest rank shift'], ['abs_score_delta', 'Sort: largest score shift'], ['baseline_rank', 'Sort: reference rank'], ['candidate_rank', 'Sort: candidate rank'], ['label', 'Sort: name']]} />
      </div>

      {error && <div className="notice-error m-4">{error}</div>}
      <div className="hidden md:block">
        <table className="data-table w-full table-fixed">
          <thead><tr><th className="w-[36px]"><span className="sr-only">Follow</span></th><th className="w-[34%]">Item</th><th className="w-[18%]">Priority</th><th className="w-[12%] !text-right">Score Δ</th><th className="w-[20%] !text-right">Rank</th><th className="w-[14%] !text-right">Movement</th></tr></thead>
          <tbody>
            {data?.items.map((item) => <DivergenceRow key={item.entity_id} item={item} followed={followed.has(item.entity_id)} onFollow={() => onToggleFollow(item.entity_id)} onClick={() => setSelected(item)} />)}
          </tbody>
        </table>
      </div>
      <div className="divide-y divide-gray-200 md:hidden">
        {data?.items.map((item) => <DivergenceCard key={item.entity_id} item={item} followed={followed.has(item.entity_id)} onFollow={() => onToggleFollow(item.entity_id)} onClick={() => setSelected(item)} />)}
      </div>
      {loading && <div className="p-8 text-center text-[13px] text-gray-500" role="status">Loading divergences…</div>}
      {!loading && !data?.items.length && !error && <div className="p-10 text-center"><div className="text-[13px] font-medium text-gray-700">No matching movements</div><div className="mt-1 text-xs text-gray-500">Try clearing one of the filters.</div></div>}
      <div className="flex items-center justify-between border-t border-gray-300 bg-gray-50 px-4 py-2 text-xs text-gray-600">
        <span className="font-mono">{(data?.total ?? 0).toLocaleString()} items</span>
        <div className="flex items-center gap-1"><button onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1} className="btn-secondary btn-sm px-1.5" aria-label="Previous page"><ChevronLeft className="h-3.5 w-3.5" /></button><span className="min-w-20 text-center font-mono">{page} / {pageCount}</span><button onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={page >= pageCount} className="btn-secondary btn-sm px-1.5" aria-label="Next page"><ChevronRight className="h-3.5 w-3.5" /></button></div>
      </div>
      {selected && <ItemDrawer jobId={jobId} candidateId={candidateId} scope={scope} item={selected} followed={followed.has(selected.entity_id)} onFollow={() => onToggleFollow(selected.entity_id)} onClose={() => setSelected(null)} />}
    </section>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[][] }) {
  return <label><span className="sr-only">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="field py-1 pl-2.5 pr-8 text-xs">{options.map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select></label>;
}

export function FollowButton({ followed, onClick, label }: { followed: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={(event) => { event.stopPropagation(); onClick(); }}
      aria-pressed={followed}
      aria-label={`${followed ? 'Unfollow' : 'Follow'} ${label}`}
      title={followed ? 'Following — click to stop' : 'Follow this item'}
      className="p-0.5 text-gray-400 hover:text-accent-700"
    ><Star className={`h-3.5 w-3.5 ${followed ? 'fill-accent-600 text-accent-600' : ''}`} /></button>
  );
}

function DivergenceRow({ item, followed, onFollow, onClick }: { item: ComparisonItem; followed: boolean; onFollow: () => void; onClick: () => void }) {
  return <tr onClick={onClick} className="cursor-pointer text-gray-700"><td><FollowButton followed={followed} onClick={onFollow} label={item.label} /></td><td className="truncate font-medium text-gray-900" title={item.label}>{item.label}</td><td><PriorityTransition item={item} /></td><td className="text-right font-mono">{signed(item.score_delta)}</td><td className="text-right font-mono">{item.baseline_rank?.toLocaleString() ?? '—'} <span className="text-gray-400">→</span> {item.candidate_rank?.toLocaleString() ?? '—'}</td><td className="text-right"><Movement value={item.rank_delta} /></td></tr>;
}

function DivergenceCard({ item, followed, onFollow, onClick }: { item: ComparisonItem; followed: boolean; onFollow: () => void; onClick: () => void }) {
  return <div onClick={onClick} className="w-full cursor-pointer p-4 text-left"><div className="flex items-center gap-2"><FollowButton followed={followed} onClick={onFollow} label={item.label} /><div className="truncate text-[13px] font-semibold text-gray-900">{item.label}</div></div><div className="mt-3 grid grid-cols-3 gap-2 text-xs"><div><span className="label-caps block !text-[10px]">Priority</span><PriorityTransition item={item} /></div><div><span className="label-caps block !text-[10px]">Score Δ</span><span className="font-mono">{signed(item.score_delta)}</span></div><div><span className="label-caps block !text-[10px]">Movement</span><Movement value={item.rank_delta} /></div></div></div>;
}

function PriorityTransition({ item }: { item: ComparisonItem }) { return <span className="inline-flex items-center gap-1.5"><PriorityBadge level={item.baseline_priority} /><span className="text-gray-400">→</span><PriorityBadge level={item.candidate_priority} /></span>; }
export function Movement({ value }: { value: number | null }) { if (!value) return <span className="text-gray-400">No change</span>; return <span className={`inline-flex items-center gap-1 font-mono font-medium ${value > 0 ? 'text-accent-700' : 'text-gray-500'}`}>{value > 0 ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}{Math.abs(value).toLocaleString()}</span>; }
function signed(value: number | null) { if (value == null) return '—'; return `${value > 0 ? '+' : ''}${value.toFixed(2)}`; }

const STAGE_LABELS: Record<string, string> = { vulnerability: 'Vulnerability', asset: 'Asset', finding: 'Finding' };

function ItemDrawer({ jobId, candidateId, scope, item, followed, onFollow, onClose }: { jobId: string; candidateId: string; scope: ScoringScope; item: ComparisonItem; followed: boolean; onFollow: () => void; onClose: () => void }) {
  const [explanation, setExplanation] = useState<ComparisonExplanation | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);
  useEffect(() => {
    const controller = new AbortController();
    setExplanation(null);
    setError(null);
    explainComparisonItem(jobId, item.entity_id, candidateId, controller.signal)
      .then(setExplanation)
      .catch((reason) => { if (!controller.signal.aborted) setError(getErrorMessage(reason)); });
    return () => controller.abort();
  }, [jobId, candidateId, item.entity_id]);
  const stages = explanation ? Array.from(new Set(explanation.factors.map((factor) => factor.stage))) : [];
  const signalGroups = explanation ? Array.from(new Set(explanation.signals.map((signal) => signal.group))) : [];
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-gray-950/30" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <aside className="h-full w-full max-w-md overflow-y-auto border-l border-gray-300 bg-white shadow-xl" role="dialog" aria-modal="true" aria-labelledby="item-detail-title">
        <div className="panel-header sticky top-0 z-10">
          <div className="min-w-0"><div className="label-caps !text-[10px]">Divergent item</div><h3 id="item-detail-title" className="break-words text-[14px] font-semibold text-gray-900">{item.label}</h3></div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={onFollow} aria-pressed={followed} className="btn-ghost btn-sm"><Star className={`h-3.5 w-3.5 ${followed ? 'fill-accent-600 text-accent-600' : ''}`} /> {followed ? 'Following' : 'Follow'}</button>
            <button onClick={onClose} className="btn-ghost btn-sm px-1.5" aria-label="Close detail"><X className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="space-y-4 p-4">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3"><Snapshot title="Reference" priority={item.baseline_priority} score={item.baseline_score} rank={item.baseline_rank} /><span className="text-gray-400">→</span><Snapshot title="Candidate" priority={item.candidate_priority} score={item.candidate_score} rank={item.candidate_rank} /></div>
          <div className="border border-gray-200 bg-gray-50 p-3"><div className="label-caps">Net movement</div><div className="mt-2 grid grid-cols-2 gap-3"><div><div className="text-[11px] text-gray-500">Score delta</div><div className="font-mono text-lg font-semibold text-gray-900">{signed(item.score_delta)}</div></div><div><div className="text-[11px] text-gray-500">Rank delta</div><div className="text-lg"><Movement value={item.rank_delta} /></div></div></div></div>

          <section aria-labelledby="why-heading">
            <h4 id="why-heading" className="text-[13px] font-semibold text-gray-900">Why it moved</h4>
            <p className="mt-0.5 text-[11px] leading-4 text-gray-500">The item's input signals, and the share of the weight each scenario gives every factor at run time. Changed shares are highlighted. Per-factor contributions are not recomputed.</p>
            {error && <div className="notice-error mt-2">{error}</div>}
            {!explanation && !error && <div className="mt-3 h-24 animate-pulse bg-gray-100" role="status" aria-label="Loading explanation" />}
            {explanation && <>
              <dl className="mt-3 divide-y divide-gray-100 border border-gray-200 text-xs">
                {signalGroups.map((group) => (
                  <div key={group}>
                    {signalGroups.length > 1 && <div className="label-caps bg-gray-50 px-2.5 py-1 !text-[10px]">{STAGE_LABELS[group]}</div>}
                    {explanation.signals.filter((signal) => signal.group === group).map((signal) => (
                      <div key={signal.key} className="flex justify-between gap-3 px-2.5 py-1"><dt className="text-gray-500">{signal.label}</dt><dd className="truncate font-mono font-medium text-gray-800">{formatSignal(signal.value)}</dd></div>
                    ))}
                  </div>
                ))}
              </dl>
              {stages.map((stage) => (
                <div key={stage} className="mt-3">
                  {(scope === 'preset' || scope === 'finding') && <div className="label-caps mb-1 !text-[10px]">{STAGE_LABELS[stage]} weights</div>}
                  <div className="space-y-1.5">
                    {explanation.factors.filter((factor) => factor.stage === stage).map((factor) => (
                      <div key={factor.key} className={`grid grid-cols-[minmax(0,1fr)_120px] items-center gap-2 px-1 py-0.5 text-[11px] ${factor.changed ? 'bg-accent-50' : ''}`}>
                        <span className={`truncate ${factor.changed ? 'font-semibold text-gray-900' : 'text-gray-600'}`} title={factor.label}>{factor.label}</span>
                        <span className="space-y-0.5">
                          <ShareBar label="REF" share={factor.baseline_share} tone="bg-gray-500" />
                          <ShareBar label="CAND" share={factor.candidate_share} tone="bg-accent-600" />
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </>}
          </section>
        </div>
      </aside>
    </div>
  );
}

function ShareBar({ label, share, tone }: { label: string; share: number | null; tone: string }) {
  return <span className="grid grid-cols-[30px_1fr_34px] items-center gap-1 font-mono text-[9px] text-gray-500"><span>{label}</span><span className="h-1.5 bg-gray-100"><span className={`block h-full ${tone}`} style={{ width: `${share ?? 0}%` }} /></span><span className="text-right">{share == null ? 'off' : `${Math.round(share)}%`}</span></span>;
}

function formatSignal(value: string | number | boolean | null) {
  if (value == null) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(value < 1 ? 4 : 1);
  return value;
}

function Snapshot({ title, priority, score, rank }: { title: string; priority: string | null; score: number | null; rank: number | null }) { return <div className="border border-gray-300 p-3"><div className="label-caps !text-[10px]">{title}</div><div className="mt-2"><PriorityBadge level={priority} className="!text-[13px]" /></div><dl className="mt-3 space-y-1 text-xs"><div className="flex justify-between"><dt className="text-gray-500">Score</dt><dd className="font-mono font-semibold text-gray-800">{score?.toFixed(2) ?? '—'}</dd></div><div className="flex justify-between"><dt className="text-gray-500">Rank</dt><dd className="font-mono font-semibold text-gray-800">{rank?.toLocaleString() ?? '—'}</dd></div></dl></div>; }
