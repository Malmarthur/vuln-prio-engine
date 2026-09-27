import { ComparisonCandidateSummary, ComparisonSummary } from '../../api/client';
import { DistributionBar, sortLevels } from './ComparisonOverview';
import DivergenceTable from './DivergenceTable';
import { CandidateMarker, ReferenceMarker } from './markers';
import TransitionHeatmap from './TransitionHeatmap';

export default function CandidateInspector({ summary, candidate, onSelect }: { summary: ComparisonSummary; candidate: ComparisonCandidateSummary; onSelect: (candidate: ComparisonCandidateSummary) => void }) {
  const levels = sortLevels(Array.from(new Set([
    ...Object.keys(summary.baseline.distribution),
    ...Object.keys(candidate.distribution),
    ...Object.keys(candidate.transition_matrix),
    ...Object.values(candidate.transition_matrix).flatMap((row) => Object.keys(row)),
  ])));
  const candidateIndex = summary.candidates.findIndex((item) => item.id === candidate.id);
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
          <p className="text-xs text-gray-500">Measured against {summary.baseline.name}</p>
        </div>
        <div className="grid grid-cols-2 border-t-0 p-4 pt-3 xl:grid-cols-4">
          <Metric label="Promoted" value={candidate.promoted.toLocaleString()} detail="Moved closer to rank #1" accent />
          <Metric label="Demoted" value={candidate.demoted.toLocaleString()} detail="Moved lower in the queue" />
          <Metric label="Median score Δ" value={`${candidate.median_score_delta > 0 ? '+' : ''}${candidate.median_score_delta.toFixed(2)}`} detail={`Mean ${candidate.mean_score_delta > 0 ? '+' : ''}${candidate.mean_score_delta.toFixed(2)}`} />
          <Metric label="Spearman correlation" value={candidate.spearman_rank_correlation?.toFixed(3) ?? 'n/a'} detail="1.000 means identical order" />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="panel min-w-0">
          <div className="panel-header"><div><h3 className="panel-title">Distribution shift</h3><p className="panel-subtitle">How the population moves across priority bands.</p></div></div>
          <div className="space-y-5 p-4">
            <DistributionRow marker={<ReferenceMarker />} name={summary.baseline.name} distribution={summary.baseline.distribution} />
            <DistributionRow marker={<CandidateMarker index={candidateIndex} />} name={candidate.name} distribution={candidate.distribution} />
          </div>
        </section>
        <section className="panel min-w-0">
          <div className="panel-header"><div><h3 className="panel-title">Priority transitions</h3><p className="panel-subtitle">Rows: reference priority. Columns: candidate priority. Outlined cells are unchanged.</p></div></div>
          <div className="p-4"><TransitionHeatmap matrix={candidate.transition_matrix} /></div>
        </section>
      </div>

      {summary.details_available ? <DivergenceTable jobId={summary.job_id} candidateId={candidate.id} levels={levels} /> : <section className="notice-warning flex-col gap-1"><h3 className="font-semibold">Detailed movements have expired</h3><p>The aggregate comparison is preserved, but a later scoring run replaced its detailed rows. Re-run this comparison to inspect individual items.</p></section>}
    </section>
  );
}

function DistributionRow({ marker, name, distribution }: { marker: React.ReactNode; name: string; distribution: Record<string, number> }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">{marker}<span className="truncate text-[13px] font-medium text-gray-800">{name}</span></span>
        <span className="font-mono text-[11px] text-gray-500">{Object.values(distribution).reduce((sum, value) => sum + value, 0).toLocaleString()} items</span>
      </div>
      <DistributionBar distribution={distribution} />
    </div>
  );
}

function Metric({ label, value, detail, accent = false }: { label: string; value: string; detail: string; accent?: boolean }) {
  return (
    <div className="border-l border-gray-200 px-3 py-1 first:border-l-0 first:pl-0">
      <div className="label-caps !text-[10px]">{label}</div>
      <div className={`mt-0.5 font-mono text-xl font-semibold ${accent ? 'text-accent-700' : 'text-gray-900'}`}>{value}</div>
      <div className="text-[11px] text-gray-500">{detail}</div>
    </div>
  );
}
