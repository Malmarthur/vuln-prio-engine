import { ArrowDownRight, ArrowUpRight, ChevronRight, Minus } from 'lucide-react';
import { ComparisonCandidateSummary, ComparisonSummary } from '../../api/client';

const PRIORITY_COLORS: Record<string, string> = {
  V0: 'bg-red-500', V1: 'bg-orange-500', V2: 'bg-amber-400', V3: 'bg-emerald-500',
  A0: 'bg-red-500', A1: 'bg-orange-500', A2: 'bg-amber-400', A3: 'bg-emerald-500',
  P0: 'bg-red-500', P1: 'bg-orange-500', P2: 'bg-amber-400', P3: 'bg-emerald-500',
  UNSCORED: 'bg-slate-300',
};

const CANDIDATE_DOTS = ['bg-indigo-500', 'bg-violet-500', 'bg-cyan-500', 'bg-fuchsia-500'];

function DistributionBar({ distribution }: { distribution: Record<string, number> }) {
  const total = Object.values(distribution).reduce((sum, value) => sum + value, 0) || 1;
  const levels = Object.keys(distribution).sort();
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100" aria-label="Priority distribution">
        {levels.map((level) => (
          <span key={level} className={PRIORITY_COLORS[level] ?? 'bg-slate-400'} style={{ width: `${distribution[level] / total * 100}%` }} title={`${level}: ${distribution[level].toLocaleString()}`} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400">
        {levels.map((level) => <span key={level}><i className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${PRIORITY_COLORS[level] ?? 'bg-slate-400'}`} />{level} {Math.round(distribution[level] / total * 100)}%</span>)}
      </div>
    </div>
  );
}

function MovementBar({ promoted, demoted }: { promoted: number; demoted: number }) {
  const max = Math.max(promoted, demoted, 1);
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-full bg-slate-100" title={`${promoted.toLocaleString()} promoted, ${demoted.toLocaleString()} demoted`}>
      <div className="flex h-2 justify-end bg-slate-50"><span className="h-full rounded-l-full bg-rose-400" style={{ width: `${demoted / max * 100}%` }} /></div>
      <div className="h-2 bg-slate-50"><span className="block h-full rounded-r-full bg-emerald-500" style={{ width: `${promoted / max * 100}%` }} /></div>
    </div>
  );
}

export default function ComparisonOverview({
  summary,
  selectedId,
  onSelect,
}: {
  summary: ComparisonSummary;
  selectedId: string;
  onSelect: (candidate: ComparisonCandidateSummary) => void;
}) {
  const mostDisruptive = [...summary.candidates].sort((a, b) => (b.promoted + b.demoted) - (a.promoted + a.demoted))[0];
  return (
    <section className="space-y-4" aria-labelledby="comparison-overview-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-600">Comparison overview</div>
          <h2 id="comparison-overview-heading" className="mt-1 text-xl font-semibold tracking-tight text-slate-950">Where priorities move</h2>
          <p className="mt-1 text-sm text-slate-500">{mostDisruptive ? `${mostDisruptive.name} creates the largest shift, moving ${(mostDisruptive.promoted + mostDisruptive.demoted).toLocaleString()} items.` : 'Review how each strategy changes the queue.'}</p>
        </div>
        <div className="text-xs text-slate-400">Reference: <span className="font-semibold text-slate-600">{summary.baseline.name}</span></div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="hidden grid-cols-[minmax(180px,1.15fr)_minmax(210px,1.5fr)_minmax(150px,1fr)_90px_90px_40px] gap-4 border-b border-slate-100 bg-slate-50/70 px-5 py-3 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400 lg:grid">
          <span>Strategy</span><span>Priority distribution</span><span>Queue movement</span><span>Score Δ</span><span>Spearman</span><span />
        </div>
        {summary.candidates.map((candidate, index) => (
          <button
            key={candidate.id}
            type="button"
            onClick={() => onSelect(candidate)}
            className={`grid w-full gap-4 border-b border-slate-100 px-5 py-4 text-left transition-colors last:border-b-0 hover:bg-slate-50/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 lg:grid-cols-[minmax(180px,1.15fr)_minmax(210px,1.5fr)_minmax(150px,1fr)_90px_90px_40px] lg:items-center ${selectedId === candidate.id ? 'bg-indigo-50/40' : 'bg-white'}`}
          >
            <div className="flex items-center gap-3">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${CANDIDATE_DOTS[index % CANDIDATE_DOTS.length]}`} />
              <div className="min-w-0"><div className="truncate text-sm font-semibold text-slate-900">{candidate.name}</div><div className="mt-0.5 text-xs text-slate-400">{(candidate.promoted + candidate.demoted).toLocaleString()} changed</div></div>
            </div>
            <DistributionBar distribution={candidate.distribution} />
            <div>
              <MovementBar promoted={candidate.promoted} demoted={candidate.demoted} />
              <div className="mt-2 flex justify-between text-[10px] font-medium"><span className="text-rose-500">↓ {candidate.demoted.toLocaleString()}</span><span className="text-emerald-600">↑ {candidate.promoted.toLocaleString()}</span></div>
            </div>
            <div><div className="text-[10px] uppercase text-slate-400 lg:hidden">Median score Δ</div><div className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-slate-700">{candidate.median_score_delta > 0 ? '+' : ''}{candidate.median_score_delta.toFixed(2)}</div></div>
            <div><div className="text-[10px] uppercase text-slate-400 lg:hidden">Spearman</div><div className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-slate-700" title="Rank-order similarity, where 1 means identical ordering">{candidate.spearman_rank_correlation?.toFixed(3) ?? 'n/a'}</div></div>
            <ChevronRight className="hidden h-4 w-4 text-slate-300 lg:block" />
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <LegendCard icon={<ArrowUpRight className="h-4 w-4" />} tone="text-emerald-600 bg-emerald-50" title="Promoted" text="Moved closer to rank #1" />
        <LegendCard icon={<ArrowDownRight className="h-4 w-4" />} tone="text-rose-600 bg-rose-50" title="Demoted" text="Moved lower in the queue" />
        <LegendCard icon={<Minus className="h-4 w-4" />} tone="text-slate-500 bg-slate-100" title="Unchanged" text="Kept the same rank" />
      </div>
    </section>
  );
}

function LegendCard({ icon, tone, title, text }: { icon: React.ReactNode; tone: string; title: string; text: string }) {
  return <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3"><span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tone}`}>{icon}</span><div><div className="text-xs font-semibold text-slate-700">{title}</div><div className="text-[11px] text-slate-400">{text}</div></div></div>;
}

export { DistributionBar };
