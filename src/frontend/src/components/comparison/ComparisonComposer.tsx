import { Check, Play, Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { NamedScoringProfile, ScoringPreset, ScoringScope } from '../../api/client';
import { CandidateMarker, ReferenceMarker } from './markers';
import ScenarioSignature from './ScenarioSignature';

const SCOPES: Array<{ id: ScoringScope; label: string }> = [
  { id: 'preset', label: 'Presets' },
  { id: 'vulnerability', label: 'Vulnerabilities' },
  { id: 'asset', label: 'Assets' },
  { id: 'finding', label: 'Findings' },
];

type Scenario = ScoringPreset | NamedScoringProfile;

export default function ComparisonComposer({
  scope,
  onScopeChange,
  options,
  baselineId,
  onBaselineChange,
  candidateIds,
  onCandidatesChange,
  profiles,
  running,
  onRun,
}: {
  scope: ScoringScope;
  onScopeChange: (scope: ScoringScope) => void;
  options: Scenario[];
  baselineId: string;
  onBaselineChange: (id: string) => void;
  candidateIds: string[];
  onCandidatesChange: (ids: string[]) => void;
  profiles: NamedScoringProfile[];
  running: boolean;
  onRun: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const baseline = options.find((item) => item.id === baselineId);
  const candidates = candidateIds.map((id) => options.find((item) => item.id === id)).filter(Boolean) as Scenario[];
  const available = useMemo(() => options.filter((item) =>
    item.id !== baselineId
    && item.name.toLowerCase().includes(query.toLowerCase())
  ), [options, baselineId, query]);

  const signatureProps = (scenario: Scenario) => scope === 'preset'
    ? { preset: scenario as ScoringPreset }
    : { profile: scenario as NamedScoringProfile };

  return (
    <section className="panel overflow-visible">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Comparison setup</h2>
          <p className="panel-subtitle">Choose a reference, then add the scoring strategies to measure against it.</p>
        </div>
        <div className="inline-flex border border-gray-300 bg-white" aria-label="Comparison scope">
          {SCOPES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onScopeChange(item.id)}
              className={`border-r border-gray-300 px-3 py-1 text-xs font-medium last:border-r-0 ${scope === item.id ? 'bg-gray-800 text-white' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 p-4 xl:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.7fr)]">
        <div className="relative border border-gray-300 bg-gray-50 p-3 pl-4">
          <span className="absolute inset-y-0 left-0 w-[3px] bg-gray-800" aria-hidden="true" />
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="flex items-center gap-2"><ReferenceMarker /><span className="label-caps">Reference</span></span>
            <label className="relative">
              <span className="sr-only">Reference scenario</span>
              <select
                value={baselineId}
                onChange={(event) => onBaselineChange(event.target.value)}
                className="field max-w-[170px] py-0.5 pl-2 pr-7 text-xs"
              >
                {options.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
          </div>
          <div className="text-base font-semibold text-gray-900">{baseline?.name ?? 'Select a reference'}</div>
          <p className="mt-0.5 min-h-10 text-xs leading-5 text-gray-500">{baseline?.description || 'The benchmark every candidate is measured against.'}</p>
          {baseline && <div className="mt-3 border-t border-gray-200 pt-3"><ScenarioSignature scope={scope} profiles={profiles} {...signatureProps(baseline)} /></div>}
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
            {candidates.map((candidate, index) => (
              <article key={candidate.id} className="border border-gray-300 bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2">
                    <CandidateMarker index={index} />
                    <div className="min-w-0">
                      <h3 className="truncate text-[13px] font-semibold leading-5 text-gray-900">{candidate.name}</h3>
                      <p className="truncate text-[11px] text-gray-500">{candidate.description || 'Scoring candidate'}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onCandidatesChange(candidateIds.filter((id) => id !== candidate.id))}
                    className="p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-800"
                    aria-label={`Remove ${candidate.name}`}
                  ><X className="h-3.5 w-3.5" /></button>
                </div>
                <div className="mt-3 border-t border-gray-100 pt-2.5"><ScenarioSignature scope={scope} profiles={profiles} {...signatureProps(candidate)} /></div>
              </article>
            ))}

            <div className="relative">
              <button
                type="button"
                onClick={() => setPickerOpen((value) => !value)}
                className="flex h-full min-h-[96px] w-full items-center justify-center gap-2 border border-dashed border-gray-300 text-xs font-medium text-gray-500 transition-colors hover:border-accent-400 hover:text-accent-700"
                aria-expanded={pickerOpen}
              ><Plus className="h-3.5 w-3.5" /> Add candidate</button>
              {pickerOpen && (
                <div className="absolute left-0 top-full z-30 mt-1 w-[min(340px,85vw)] border border-gray-300 bg-white p-2 shadow-lg">
                  <input
                    autoFocus
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search scenarios…"
                    className="field mb-2 w-full"
                  />
                  <div className="max-h-56 overflow-y-auto">
                    {available.map((item) => {
                      const selected = candidateIds.includes(item.id);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => onCandidatesChange(selected ? candidateIds.filter((id) => id !== item.id) : [...candidateIds, item.id])}
                          className="flex w-full items-center justify-between gap-3 px-2.5 py-1.5 text-left text-[13px] hover:bg-gray-50"
                        >
                          <span className="truncate text-gray-800">{item.name}</span>
                          {selected && <Check className="h-4 w-4 text-accent-700" />}
                        </button>
                      );
                    })}
                    {!available.length && <p className="px-3 py-5 text-center text-xs text-gray-400">No matching scenarios</p>}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-auto flex items-center justify-between gap-3 border-t border-gray-200 pt-3">
            <span className="text-xs text-gray-500">{candidates.length} candidate{candidates.length === 1 ? '' : 's'} against {baseline?.name ?? 'no reference'}</span>
            <button
              type="button"
              onClick={onRun}
              disabled={running || !baselineId || !candidateIds.length}
              className="btn-primary"
            ><Play className="h-3.5 w-3.5 fill-current" /> {running ? 'Running…' : 'Run comparison'}</button>
          </div>
        </div>
      </div>
    </section>
  );
}
