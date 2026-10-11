import { ComparisonCandidateSummary, ComparisonSummary, ScoringScope } from '../../api/client';
import { DistributionBar, sortLevels } from './ComparisonOverview';
import DivergenceTable from './DivergenceTable';
import { ChartSelection, ComparisonView, Movement, TOP_N_SIZES, TopChange } from './filters';
import { CandidateMarker, ReferenceMarker } from './markers';
import TransitionHeatmap from './TransitionHeatmap';

export default function CandidateInspector({
  summary,
  candidate,
  onSelect,
  view,
  onViewChange,
  filtered,
  scope,
  followed,
  onToggleFollow,
  onFollowMatching,
}: {
  summary: ComparisonSummary;
  candidate: ComparisonCandidateSummary;
  onSelect: (candidate: ComparisonCandidateSummary) => void;
  view: ComparisonView;
  onViewChange: (view: ComparisonView) => void;
  filtered: boolean;
  scope: ScoringScope;
  followed: Set<string>;
  onToggleFollow: (entityId: string) => void;
  onFollowMatching: () => Promise<void>;
}) {
  const levels = sortLevels(Array.from(new Set([
    ...Object.keys(summary.baseline.distribution),
    ...Object.keys(candidate.distribution),
    ...Object.keys(candidate.transition_matrix),
    ...Object.values(candidate.transition_matrix).flatMap((row) => Object.keys(row)),
  ])));
  const candidateIndex = summary.candidates.findIndex((item) => item.id === candidate.id);
  const { selection } = view;
  const select = (patch: Partial<ChartSelection>) => onViewChange({ ...view, selection: { ...selection, ...patch } });
  const toggleMovement = (movement: Movement) => select({ movement: selection.movement === movement ? '' : movement });
  const top = candidate.top_n?.[String(view.topN)];
  const toggleTop = (change: TopChange) => select({ topChange: selection.topChange === change ? '' : change });
  return (
    <section className="space-y-4" aria-labelledby="candidate-inspector-heading">
      <div className="panel">
        <div className="flex overflow-x-auto border-b border-gray-300 bg-gray-50" role="tablist" aria-label="Candidate analysis">
          {summary.candidates.map((item, index) => {
            const selected = item.id === candidate.id;
            return (
              <button
                key={item.id}
                role="tab"
                aria-selected={selected}
                onClick={() => onSelect(item)}
                className={`flex min-w-0 shrink-0 items-center gap-2 border-r border-gray-300 px-4 py-2 text-[13px] ${selected ? 'bg-white font-semibold text-gray-900 shadow-[inset_0_2px_0_#335778]' : 'text-gray-600 hover:bg-white/70 hover:text-gray-900'}`}
              >
                <CandidateMarker index={index} />
                <span className="max-w-[200px] truncate">{item.name}</span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-3">
          <h2 id="candidate-inspector-heading" className="text-[15px] font-semibold text-gray-900">{candidate.name}</h2>
          <p className="text-xs text-gray-500">Measured against {summary.baseline.name}{filtered ? ' · filtered slice' : ''}</p>
        </div>
        <div className="grid grid-cols-2 border-t-0 p-4 pt-3 xl:grid-cols-4">
          <Metric label="Promoted" value={candidate.promoted.toLocaleString()} detail="Moved closer to rank #1" accent pressed={selection.movement === 'promoted'} onClick={() => toggleMovement('promoted')} />
          <Metric label="Demoted" value={candidate.demoted.toLocaleString()} detail="Moved lower in the queue" pressed={selection.movement === 'demoted'} onClick={() => toggleMovement('demoted')} />
          <Metric label="Median score Δ" value={filtered ? '—' : `${candidate.median_score_delta > 0 ? '+' : ''}${candidate.median_score_delta.toFixed(2)}`} detail={filtered ? 'Whole population only' : `Mean ${candidate.mean_score_delta > 0 ? '+' : ''}${candidate.mean_score_delta.toFixed(2)}`} />
          <Metric label="Spearman correlation" value={filtered ? '—' : candidate.spearman_rank_correlation?.toFixed(3) ?? 'n/a'} detail={filtered ? 'Whole population only' : '1.000 means identical order'} />
        </div>
        {top && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-gray-200 px-4 py-2.5">
            <label className="flex items-center gap-2 text-xs text-gray-600">
              <span className="label-caps !text-[10px]">Top of the queue</span>
              <select value={view.topN} onChange={(event) => onViewChange({ ...view, topN: Number(event.target.value) })} className="field py-0.5 pl-2 pr-7 text-xs" aria-label="Top N size">
                {TOP_N_SIZES.map((size) => <option key={size} value={size}>Top {size}</option>)}
              </select>
            </label>
            <TopButton label="entered" value={`+${top.entered.toLocaleString()}`} pressed={selection.topChange === 'entered'} onClick={() => toggleTop('entered')} accent />
            <TopButton label="left" value={`−${top.left.toLocaleString()}`} pressed={selection.topChange === 'left'} onClick={() => toggleTop('left')} />
            <TopButton label="stayed" value={top.overlap.toLocaleString()} pressed={selection.topChange === 'stayed'} onClick={() => toggleTop('stayed')} />
            <span className="text-[11px] text-gray-500">Items entering or leaving the reference's top {view.topN} under this candidate.</span>
          </div>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="panel min-w-0">
          <div className="panel-header"><div><h3 className="panel-title">Distribution shift</h3><p className="panel-subtitle">Click a band: reference bands filter the origin, candidate bands the destination.</p></div></div>
          <div className="space-y-5 p-4">
            <DistributionRow marker={<ReferenceMarker />} name={summary.baseline.name} distribution={summary.baseline.distribution} selectedLevel={selection.from} onSelectLevel={(from) => select({ from })} axis="from" />
            <DistributionRow marker={<CandidateMarker index={candidateIndex} />} name={candidate.name} distribution={candidate.distribution} selectedLevel={selection.to} onSelectLevel={(to) => select({ to })} axis="to" />
          </div>
        </section>
        <section className="panel min-w-0">
          <div className="panel-header"><div><h3 className="panel-title">Priority transitions</h3><p className="panel-subtitle">Rows: reference priority. Columns: candidate priority. Click a cell or a header to filter.</p></div></div>
          <div className="p-4"><TransitionHeatmap matrix={candidate.transition_matrix} selection={{ from: selection.from, to: selection.to }} onSelect={(value) => select(value)} /></div>
        </section>
      </div>

      {summary.details_available
        ? <DivergenceTable jobId={summary.job_id} candidateId={candidate.id} levels={levels} scope={scope} view={view} onViewChange={onViewChange} followed={followed} onToggleFollow={onToggleFollow} onFollowMatching={onFollowMatching} />
        : <section className="notice-warning flex-col gap-1"><h3 className="font-semibold">Detailed movements have expired</h3><p>The aggregate comparison is preserved, but a later scoring run replaced its detailed rows. Re-run this comparison to inspect individual items.</p></section>}
    </section>
  );
}

function DistributionRow({ marker, name, distribution, selectedLevel, onSelectLevel, axis }: { marker: React.ReactNode; name: string; distribution: Record<string, number>; selectedLevel: string; onSelectLevel: (level: string) => void; axis: 'from' | 'to' }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">{marker}<span className="truncate text-[13px] font-medium text-gray-800">{name}</span></span>
        <span className="font-mono text-[11px] text-gray-500">{Object.values(distribution).reduce((sum, value) => sum + value, 0).toLocaleString()} items</span>
      </div>
      <DistributionBar distribution={distribution} selectedLevel={selectedLevel} onSelectLevel={onSelectLevel} axis={axis} />
    </div>
  );
}

function Metric({ label, value, detail, accent = false, pressed, onClick }: { label: string; value: string; detail: string; accent?: boolean; pressed?: boolean; onClick?: () => void }) {
  const body = (
    <>
      <div className="label-caps !text-[10px]">{label}</div>
      <div className={`mt-0.5 font-mono text-xl font-semibold ${accent ? 'text-accent-700' : 'text-gray-900'}`}>{value}</div>
      <div className="text-[11px] text-gray-500">{detail}</div>
    </>
  );
  const base = 'border-l border-gray-200 px-3 py-1 text-left first:border-l-0 first:pl-0';
  if (!onClick) return <div className={base}>{body}</div>;
  return <button type="button" aria-pressed={pressed} onClick={onClick} title="Click to filter the items below" className={`${base} hover:bg-gray-50 ${pressed ? 'bg-accent-50 shadow-[inset_0_-2px_0_#335778]' : ''}`}>{body}</button>;
}

function TopButton({ label, value, pressed, onClick, accent = false }: { label: string; value: string; pressed: boolean; onClick: () => void; accent?: boolean }) {
  return (
    <button type="button" aria-pressed={pressed} onClick={onClick} className={`inline-flex items-baseline gap-1.5 border px-2 py-0.5 text-xs ${pressed ? 'border-gray-800 bg-gray-800 text-white' : 'border-gray-300 bg-white text-gray-700 hover:border-gray-500'}`}>
      <span className={`font-mono font-semibold ${!pressed && accent ? 'text-accent-700' : ''}`}>{value}</span>{label}
    </button>
  );
}
