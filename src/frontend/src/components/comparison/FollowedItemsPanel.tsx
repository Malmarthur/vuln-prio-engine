import { ArrowDown, ArrowUp, Star, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ComparisonFollowed, ComparisonSummary, fetchComparisonFollowed } from '../../api/client';
import { PriorityBadge } from '../../lib/priority';
import { getErrorMessage } from '../../lib/utils';
import { entityNoun } from './filters';
import { CandidateMarker, ReferenceMarker } from './markers';

/** Each followed item's priority and rank in the reference and every candidate. */
export default function FollowedItemsPanel({
  summary,
  followedKey,
  followedCount,
  onUnfollow,
  onClearAll,
}: {
  summary: ComparisonSummary;
  /** Changes whenever the followed list changes, to refetch positions. */
  followedKey: string;
  followedCount: number;
  onUnfollow: (entityId: string) => void;
  onClearAll: () => void;
}) {
  const [data, setData] = useState<ComparisonFollowed | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!followedCount) { setData(null); return; }
    const controller = new AbortController();
    setError(null);
    fetchComparisonFollowed(summary.job_id, controller.signal)
      .then(setData)
      .catch((reason) => { if (!controller.signal.aborted) setError(getErrorMessage(reason)); });
    return () => controller.abort();
  }, [summary.job_id, followedKey, followedCount]);

  const scenarios = [{ id: summary.baseline.id, name: summary.baseline.name, marker: <ReferenceMarker /> }, ...summary.candidates.map((item, index) => ({ id: item.id, name: item.name, marker: <CandidateMarker index={index} /> }))];
  const noun = entityNoun(summary.scope, followedCount);
  return (
    <section className="panel" aria-labelledby="followed-heading">
      <div className="panel-header">
        <div>
          <h2 id="followed-heading" className="panel-title inline-flex items-center gap-1.5"><Star className="h-3.5 w-3.5 fill-accent-600 text-accent-600" /> Followed items</h2>
          <p className="panel-subtitle">
            {followedCount
              ? `${followedCount.toLocaleString()} followed ${noun}${data && data.in_population < Math.min(followedCount, 200) ? ` · ${data.in_population.toLocaleString()} in this comparison's population` : ''}. Positions in each scenario's queue.`
              : `Star ${entityNoun(summary.scope)} in the table below to follow them here across comparisons.`}
          </p>
        </div>
        {followedCount > 0 && <button type="button" onClick={onClearAll} className="btn-ghost btn-sm">Unfollow all</button>}
      </div>
      {error && <div className="notice-error m-4">{error}</div>}
      {followedCount > 0 && data && (
        <div className="relative overflow-x-auto">
          <table className="data-table w-full min-w-[520px]">
            <thead>
              <tr>
                <th className="w-[34%]">Item</th>
                {scenarios.map((scenario) => <th key={scenario.id}><span className="inline-flex items-center gap-1.5 normal-case">{scenario.marker}<span className="max-w-[120px] truncate" title={scenario.name}>{scenario.name}</span></span></th>)}
                <th className="w-[36px]"><span className="sr-only">Unfollow</span></th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((row) => {
                const reference = row.positions[summary.baseline.id];
                return (
                  <tr key={row.entity_id}>
                    <td className="truncate font-medium text-gray-900" title={row.label}>{row.label}</td>
                    {scenarios.map((scenario, index) => {
                      const position = row.positions[scenario.id];
                      const delta = index > 0 && position?.rank != null && reference?.rank != null ? reference.rank - position.rank : null;
                      return (
                        <td key={scenario.id}>
                          {position ? (
                            <span className="inline-flex items-center gap-1.5">
                              <PriorityBadge level={position.priority} />
                              <span className="font-mono text-[11px] text-gray-700">#{position.rank?.toLocaleString() ?? '—'}</span>
                              {delta ? <span className={`inline-flex items-center font-mono text-[10px] ${delta > 0 ? 'text-accent-700' : 'text-gray-500'}`}>{delta > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}{Math.abs(delta).toLocaleString()}</span> : null}
                            </span>
                          ) : <span className="text-[11px] text-gray-400">Not scored</span>}
                        </td>
                      );
                    })}
                    <td><button type="button" onClick={() => onUnfollow(row.entity_id)} className="p-0.5 text-gray-400 hover:text-gray-900" aria-label={`Unfollow ${row.label}`}><X className="h-3.5 w-3.5" /></button></td>
                  </tr>
                );
              })}
              {!data.items.length && <tr><td colSpan={scenarios.length + 2} className="py-6 text-center text-xs text-gray-500">None of the followed items is in this comparison's population.</td></tr>}
            </tbody>
          </table>
          {data.followed_total > data.items.length && data.items.length >= 200 && <p className="border-t border-gray-200 px-4 py-2 text-[11px] text-gray-500">Showing the 200 most recently followed items.</p>}
        </div>
      )}
      {followedCount > 0 && !data && !error && <div className="h-20 animate-pulse bg-gray-50" role="status" aria-label="Loading followed items" />}
    </section>
  );
}
