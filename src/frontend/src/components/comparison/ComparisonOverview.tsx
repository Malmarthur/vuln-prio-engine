import { ArrowDown, ArrowUp, ChevronRight } from 'lucide-react';
import { ComparisonCandidateSummary, ComparisonSummary } from '../../api/client';
import { priorityBarClass, priorityTier } from '../../lib/priority';
import { ChartSelection, Movement } from './filters';
import { CandidateMarker } from './markers';

const COLUMNS = 'xl:grid-cols-[minmax(200px,1.1fr)_minmax(220px,1.5fr)_minmax(170px,1fr)_88px_88px_24px]';

function sortLevels(levels: string[]): string[] {
  return [...levels].sort((a, b) => (priorityTier(a) ?? 9) - (priorityTier(b) ?? 9) || a.localeCompare(b));
}

/**
 * Stacked priority distribution. With `onSelectLevel`, each band is a button
 * that filters on that level; the selected band stays opaque, the others fade.
 */
function DistributionBar({
  distribution,
  selectedLevel = '',
  onSelectLevel,
  axis = 'to',
}: {
  distribution: Record<string, number>;
  selectedLevel?: string;
  onSelectLevel?: (level: string) => void;
  axis?: 'from' | 'to';
}) {
  const total = Object.values(distribution).reduce((sum, value) => sum + value, 0) || 1;
  const levels = sortLevels(Object.keys(distribution));
  const fade = (level: string) => (selectedLevel && selectedLevel !== level ? 'opacity-30' : '');
  return (
    <div>
      <div className="flex h-3 gap-px overflow-hidden bg-gray-100" aria-label="Priority distribution">
        {levels.map((level) => {
          const width = `${distribution[level] / total * 100}%`;
          const title = `${level}: ${distribution[level].toLocaleString()}`;
          if (!onSelectLevel) return <span key={level} className={priorityBarClass(level)} style={{ width }} title={title} />;
          return (
            <button
              key={level}
              type="button"
              aria-pressed={selectedLevel === level}
              aria-label={`${axis === 'from' ? 'From' : 'To'} ${level}: ${distribution[level].toLocaleString()}`}
              onClick={(event) => { event.stopPropagation(); onSelectLevel(selectedLevel === level ? '' : level); }}
              className={`${priorityBarClass(level)} ${fade(level)} h-full cursor-pointer transition-opacity hover:opacity-100`}
              style={{ width }}
              title={`${title} — click to filter`}
            />
          );
        })}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10px] text-gray-500">
        {levels.map((level) => <span key={level} className={`inline-flex items-center gap-1 ${fade(level)}`}><i className={`inline-block h-2 w-2 ${priorityBarClass(level)}`} />{level} {Math.round(distribution[level] / total * 100)}%</span>)}
      </div>
    </div>
  );
}

function MovementBar({ promoted, demoted, selected, onSelect }: { promoted: number; demoted: number; selected: Movement; onSelect: (movement: Movement) => void }) {
  const max = Math.max(promoted, demoted, 1);
  const half = (movement: 'promoted' | 'demoted', count: number) => (
    <button
      type="button"
      aria-pressed={selected === movement}
      aria-label={`${movement === 'promoted' ? 'Promoted' : 'Demoted'}: ${count.toLocaleString()}`}
      title={`${count.toLocaleString()} ${movement} — click to filter`}
      onClick={(event) => { event.stopPropagation(); onSelect(selected === movement ? '' : movement); }}
      className={`flex h-2.5 bg-gray-100 ${movement === 'demoted' ? 'justify-end' : ''} ${selected && selected !== movement ? 'opacity-30' : ''} ${selected === movement ? 'outline outline-1 outline-gray-900' : ''}`}
    >
      <span className={`h-full ${movement === 'promoted' ? 'bg-accent-600' : 'bg-gray-400'}`} style={{ width: `${count / max * 100}%` }} />
    </button>
  );
  return <div className="grid grid-cols-2 gap-px bg-gray-300">{half('demoted', demoted)}{half('promoted', promoted)}</div>;
}

export default function ComparisonOverview({
  summary,
  selectedId,
  onSelect,
  selection,
  onFilter,
  filtered = false,
}: {
  summary: ComparisonSummary;
  selectedId: string;
  onSelect: (candidate: ComparisonCandidateSummary) => void;
  selection: ChartSelection;
  onFilter: (candidate: ComparisonCandidateSummary, patch: Partial<ChartSelection>) => void;
  filtered?: boolean;
}) {
  const mostDisruptive = [...summary.candidates].sort((a, b) => (b.promoted + b.demoted) - (a.promoted + a.demoted))[0];
  return (
    <section className="panel" aria-labelledby="comparison-overview-heading">
      <div className="panel-header">
        <div>
          <h2 id="comparison-overview-heading" className="panel-title">Where priorities move</h2>
          <p className="panel-subtitle">{mostDisruptive ? `${mostDisruptive.name} produces the largest shift: ${(mostDisruptive.promoted + mostDisruptive.demoted).toLocaleString()} ${filtered ? 'filtered ' : ''}items change rank.` : 'How each strategy changes the queue.'} Click a band or a movement to filter.</p>
        </div>
        <div className="text-xs text-gray-500">Reference: <span className="font-semibold text-gray-800">{summary.baseline.name}</span></div>
      </div>

      <div className={`hidden gap-4 border-b border-gray-300 bg-gray-50 px-4 py-1.5 xl:grid ${COLUMNS}`}>
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
          <div
            key={candidate.id}
            onClick={() => onSelect(candidate)}
            className={`relative grid w-full cursor-pointer gap-4 border-b border-gray-200 px-4 py-3 text-left transition-colors last:border-b-0 xl:items-center ${COLUMNS} ${selected ? 'bg-accent-50/60' : 'bg-white hover:bg-gray-50'}`}
          >
            {selected && <span className="absolute inset-y-0 left-0 w-[3px] bg-accent-600" aria-hidden="true" />}
            <button type="button" aria-pressed={selected} onClick={(event) => { event.stopPropagation(); onSelect(candidate); }} className="flex min-w-0 items-center gap-2.5 text-left">
              <CandidateMarker index={index} />
              <span className="min-w-0"><span className="block truncate text-[13px] font-semibold text-gray-900">{candidate.name}</span><span className="block text-[11px] text-gray-500">{(candidate.promoted + candidate.demoted).toLocaleString()} items changed rank</span></span>
            </button>
            <DistributionBar distribution={candidate.distribution} selectedLevel={selected ? selection.to : ''} onSelectLevel={(level) => onFilter(candidate, { to: level })} />
            <div>
              <MovementBar promoted={candidate.promoted} demoted={candidate.demoted} selected={selected ? selection.movement : ''} onSelect={(movement) => onFilter(candidate, { movement })} />
              <div className="mt-1.5 flex justify-between font-mono text-[10px]">
                <span className="inline-flex items-center gap-0.5 text-gray-500"><ArrowDown className="h-3 w-3" />{candidate.demoted.toLocaleString()}</span>
                <span className="inline-flex items-center gap-0.5 text-accent-700"><ArrowUp className="h-3 w-3" />{candidate.promoted.toLocaleString()}</span>
              </div>
            </div>
            <div className="xl:text-right"><div className="label-caps !text-[10px] xl:hidden">Median score Δ</div><div className="font-mono text-[13px] font-semibold text-gray-800" title={filtered ? 'Computed on the whole population' : undefined}>{filtered ? '—' : `${candidate.median_score_delta > 0 ? '+' : ''}${candidate.median_score_delta.toFixed(2)}`}</div></div>
            <div className="xl:text-right"><div className="label-caps !text-[10px] xl:hidden">Spearman</div><div className="font-mono text-[13px] font-semibold text-gray-800" title={filtered ? 'Computed on the whole population' : 'Rank-order similarity, where 1 means identical ordering'}>{filtered ? '—' : candidate.spearman_rank_correlation?.toFixed(3) ?? 'n/a'}</div></div>
            <ChevronRight className="hidden h-4 w-4 text-gray-400 xl:block" />
          </div>
        );
      })}
      <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-gray-300 bg-gray-50 px-4 py-2 text-[11px] text-gray-500">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-3 bg-accent-600" />Promoted — moved closer to rank #1</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-3 bg-gray-400" />Demoted — moved lower in the queue</span>
        <span>Spearman 1.000 = identical ordering{filtered ? ' (whole population only)' : ''}</span>
      </div>
    </section>
  );
}

export { DistributionBar, sortLevels };
