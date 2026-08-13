import { ArrowDownRight, ArrowUpRight, BarChart3, GitCompareArrows } from 'lucide-react';
import { ComparisonCandidateSummary, ComparisonSummary } from '../../api/client';
import { DistributionBar } from './ComparisonOverview';
import DivergenceTable from './DivergenceTable';
import TransitionHeatmap from './TransitionHeatmap';

export default function CandidateInspector({ summary, candidate, onSelect }: { summary: ComparisonSummary; candidate: ComparisonCandidateSummary; onSelect: (candidate: ComparisonCandidateSummary) => void }) {
  const levels = Array.from(new Set([
    ...Object.keys(summary.baseline.distribution),
    ...Object.keys(candidate.distribution),
    ...Object.keys(candidate.transition_matrix),
    ...Object.values(candidate.transition_matrix).flatMap((row) => Object.keys(row)),
  ])).sort();
  return (
    <section className="space-y-4" aria-labelledby="candidate-inspector-heading">
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1.5" role="tablist" aria-label="Candidate analysis">
        {summary.candidates.map((item, index) => (
          <button key={item.id} role="tab" aria-selected={item.id === candidate.id} onClick={() => onSelect(item)} className={`flex min-w-0 shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${item.id === candidate.id ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}><span className={`h-2 w-2 rounded-full ${['bg-indigo-400', 'bg-violet-400', 'bg-cyan-400', 'bg-fuchsia-400'][index % 4]}`} /><span className="max-w-[180px] truncate">{item.name}</span></button>
        ))}
      </div>

      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-600">Candidate analysis</div>
        <h2 id="candidate-inspector-heading" className="mt-1 text-xl font-semibold tracking-tight text-slate-950">{candidate.name}</h2>
        <p className="mt-1 text-sm text-slate-500">Detailed impact against {summary.baseline.name}.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={<ArrowUpRight className="h-4 w-4" />} label="Promoted" value={candidate.promoted.toLocaleString()} detail="Closer to rank #1" tone="emerald" />
        <Metric icon={<ArrowDownRight className="h-4 w-4" />} label="Demoted" value={candidate.demoted.toLocaleString()} detail="Lower in the queue" tone="rose" />
        <Metric icon={<BarChart3 className="h-4 w-4" />} label="Median score delta" value={`${candidate.median_score_delta > 0 ? '+' : ''}${candidate.median_score_delta.toFixed(2)}`} detail={`Mean ${candidate.mean_score_delta > 0 ? '+' : ''}${candidate.mean_score_delta.toFixed(2)}`} tone="indigo" />
        <Metric icon={<GitCompareArrows className="h-4 w-4" />} label="Spearman correlation" value={candidate.spearman_rank_correlation?.toFixed(3) ?? 'n/a'} detail="1.000 means identical order" tone="slate" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="mb-5"><h3 className="text-sm font-semibold text-slate-900">Distribution shift</h3><p className="mt-1 text-xs text-slate-500">How the population moves across priority bands.</p></div>
          <div className="space-y-6">
            <DistributionRow name={summary.baseline.name} distribution={summary.baseline.distribution} />
            <DistributionRow name={candidate.name} distribution={candidate.distribution} />
          </div>
        </section>
        <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="mb-5 flex items-start justify-between gap-4"><div><h3 className="text-sm font-semibold text-slate-900">Priority transitions</h3><p className="mt-1 text-xs text-slate-500">Rows are original priorities; columns are candidate priorities.</p></div><span className="rounded-full bg-indigo-50 px-2 py-1 text-[10px] font-semibold text-indigo-600">Darker = more items</span></div>
          <TransitionHeatmap matrix={candidate.transition_matrix} />
        </section>
      </div>

      {summary.details_available ? <DivergenceTable jobId={summary.job_id} candidateId={candidate.id} levels={levels} /> : <section className="rounded-xl border border-amber-200 bg-amber-50 p-5"><h3 className="text-sm font-semibold text-amber-900">Detailed movements have expired</h3><p className="mt-1 text-sm text-amber-700">The aggregate comparison is preserved, but another scoring run replaced its detailed rows. Re-run this comparison to inspect individual items.</p></section>}
    </section>
  );
}

function DistributionRow({ name, distribution }: { name: string; distribution: Record<string, number> }) { return <div><div className="mb-2 flex items-center justify-between gap-3"><span className="truncate text-xs font-semibold text-slate-700">{name}</span><span className="text-[10px] tabular-nums text-slate-400">{Object.values(distribution).reduce((sum, value) => sum + value, 0).toLocaleString()} items</span></div><DistributionBar distribution={distribution} /></div>; }

function Metric({ icon, label, value, detail, tone }: { icon: React.ReactNode; label: string; value: string; detail: string; tone: 'emerald' | 'rose' | 'indigo' | 'slate' }) {
  const colors = { emerald: 'bg-emerald-50 text-emerald-600', rose: 'bg-rose-50 text-rose-600', indigo: 'bg-indigo-50 text-indigo-600', slate: 'bg-slate-100 text-slate-600' }[tone];
  return <div className="rounded-xl border border-slate-200 bg-white p-4"><div className={`flex h-8 w-8 items-center justify-center rounded-lg ${colors}`}>{icon}</div><div className="mt-4 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">{label}</div><div className="mt-1 font-mono text-2xl font-semibold tabular-nums tracking-tight text-slate-900">{value}</div><div className="mt-1 text-[11px] text-slate-400">{detail}</div></div>;
}
