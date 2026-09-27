import { ArrowDown, ArrowUp, ChevronRight } from 'lucide-react';
import { ComparisonCandidateSummary, ComparisonSummary } from '../../api/client';
import { priorityBarClass, priorityTier } from '../../lib/priority';
import { CandidateMarker } from './markers';

const COLUMNS = 'lg:grid-cols-[minmax(200px,1.1fr)_minmax(220px,1.5fr)_minmax(170px,1fr)_88px_88px_24px]';

function sortLevels(levels: string[]): string[] {
  return [...levels].sort((a, b) => (priorityTier(a) ?? 9) - (priorityTier(b) ?? 9) || a.localeCompare(b));
}

function DistributionBar({ distribution }: { distribution: Record<string, number> }) {
  const total = Object.values(distribution).reduce((sum, value) => sum + value, 0) || 1;
  const levels = sortLevels(Object.keys(distribution));
  return (
    <div>
      <div className="flex h-3 gap-px overflow-hidden bg-gray-100" aria-label="Priority distribution">
        {levels.map((level) => (
          <span key={level} className={priorityBarClass(level)} style={{ width: `${distribution[level] / total * 100}%` }} title={`${level}: ${distribution[level].toLocaleString()}`} />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10px] text-gray-500">
        {levels.map((level) => <span key={level} className="inline-flex items-center gap-1"><i className={`inline-block h-2 w-2 ${priorityBarClass(level)}`} />{level} {Math.round(distribution[level] / total * 100)}%</span>)}
      </div>
    </div>
  );
}

function MovementBar({ promoted, demoted }: { promoted: number; demoted: number }) {
  const max = Math.max(promoted, demoted, 1);
  return (
    <div className="grid grid-cols-2 gap-px bg-gray-300" title={`${promoted.toLocaleString()} promoted, ${demoted.toLocaleString()} demoted`}>
      <div className="flex h-2.5 justify-end bg-gray-100"><span className="h-full bg-gray-400" style={{ width: `${demoted / max * 100}%` }} /></div>
      <div className="h-2.5 bg-gray-100"><span className="block h-full bg-accent-600" style={{ width: `${promoted / max * 100}%` }} /></div>
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
    <section className="panel" aria-labelledby="comparison-overview-heading">
      <div className="panel-header">
        <div>
          <h2 id="comparison-overview-heading" className="panel-title">Where priorities move</h2>
          <p className="panel-subtitle">{mostDisruptive ? `${mostDisruptive.name} produces the largest shift: ${(mostDisruptive.promoted + mostDisruptive.demoted).toLocaleString()} items change rank.` : 'How each strategy changes the queue.'}</p>
        </div>
        <div className="text-xs text-gray-500">Reference: <span className="font-semibold text-gray-800">{summary.baseline.name}</span></div>
      </div>

      <div className={`hidden gap-4 border-b border-gray-300 bg-gray-50 px-4 py-1.5 lg:grid ${COLUMNS}`}>
        <span className="label-caps !text-[10px]">Strategy</span>
        <span className="label-caps !text-[10px]">Priority distribution</span>
        <span className="label-caps !text-[10px]">Rank movement</span>
        <span className="label-caps !text-[10px] text-right">Median Δ</span>
        <span className="label-caps !text-[10px] text-right">Spearman</span>
        <span />
      </div>
      {summary.candidates.map((candidate, index) => {
        const selected = selectedId === candidate.id;
        return (
          <button
            key={candidate.id}
            type="button"
            onClick={() => onSelect(candidate)}
            className={`relative grid w-full gap-4 border-b border-gray-200 px-4 py-3 text-left transition-colors last:border-b-0 lg:items-center ${COLUMNS} ${selected ? 'bg-accent-50/60' : 'bg-white hover:bg-gray-50'}`}
          >
            {selected && <span className="absolute inset-y-0 left-0 w-[3px] bg-accent-600" aria-hidden="true" />}
            <div className="flex min-w-0 items-center gap-2.5">
              <CandidateMarker index={index} />
              <div className="min-w-0"><div className="truncate text-[13px] font-semibold text-gray-900">{candidate.name}</div><div className="text-[11px] text-gray-500">{(candidate.promoted + candidate.demoted).toLocaleString()} items changed rank</div></div>
            </div>
            <DistributionBar distribution={candidate.distribution} />
            <div>
              <MovementBar promoted={candidate.promoted} demoted={candidate.demoted} />
              <div className="mt-1.5 flex justify-between font-mono text-[10px]">
                <span className="inline-flex items-center gap-0.5 text-gray-500"><ArrowDown className="h-3 w-3" />{candidate.demoted.toLocaleString()}</span>
                <span className="inline-flex items-center gap-0.5 text-accent-700"><ArrowUp className="h-3 w-3" />{candidate.promoted.toLocaleString()}</span>
              </div>
            </div>
            <div className="lg:text-right"><div className="label-caps !text-[10px] lg:hidden">Median score Δ</div><div className="font-mono text-[13px] font-semibold text-gray-800">{candidate.median_score_delta > 0 ? '+' : ''}{candidate.median_score_delta.toFixed(2)}</div></div>
            <div className="lg:text-right"><div className="label-caps !text-[10px] lg:hidden">Spearman</div><div className="font-mono text-[13px] font-semibold text-gray-800" title="Rank-order similarity, where 1 means identical ordering">{candidate.spearman_rank_correlation?.toFixed(3) ?? 'n/a'}</div></div>
            <ChevronRight className="hidden h-4 w-4 text-gray-400 lg:block" />
          </button>
        );
      })}
      <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-gray-300 bg-gray-50 px-4 py-2 text-[11px] text-gray-500">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-3 bg-accent-600" />Promoted — moved closer to rank #1</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-3 bg-gray-400" />Demoted — moved lower in the queue</span>
        <span>Spearman 1.000 = identical ordering</span>
      </div>
    </section>
  );
}

export { DistributionBar, sortLevels };
