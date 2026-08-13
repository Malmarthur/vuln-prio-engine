import { Check, ChevronDown, Play, Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { NamedScoringProfile, ScoringPreset, ScoringScope } from '../../api/client';
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
    <section className="overflow-visible rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Build your comparison</h2>
          <p className="mt-0.5 text-sm text-slate-500">Choose a reference, then add the scoring strategies you want to challenge.</p>
        </div>
        <div className="inline-flex self-start rounded-lg bg-slate-100 p-1" aria-label="Comparison scope">
          {SCOPES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onScopeChange(item.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${scope === item.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 p-5 xl:grid-cols-[minmax(260px,0.85fr)_36px_minmax(0,1.6fr)_auto] xl:items-stretch">
        <div className="relative rounded-xl border-2 border-indigo-200 bg-indigo-50/40 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-indigo-700">Reference</span>
            <label className="relative">
              <span className="sr-only">Reference scenario</span>
              <select
                value={baselineId}
                onChange={(event) => onBaselineChange(event.target.value)}
                className="max-w-[150px] appearance-none border-0 bg-transparent py-1 pl-2 pr-7 text-xs font-medium text-slate-500 focus:ring-0"
              >
                {options.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-1 top-1.5 h-3.5 w-3.5 text-slate-400" />
            </label>
          </div>
          <div className="text-base font-semibold text-slate-950">{baseline?.name ?? 'Select a reference'}</div>
          <p className="mt-1 min-h-10 text-xs leading-5 text-slate-500">{baseline?.description || 'The benchmark every candidate will be measured against.'}</p>
          {baseline && <div className="mt-4"><ScenarioSignature scope={scope} profiles={profiles} {...signatureProps(baseline)} /></div>}
        </div>

        <div className="hidden items-center justify-center xl:flex" aria-hidden="true">
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-semibold text-slate-400">vs</span>
        </div>

        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-3">
          <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
            {candidates.map((candidate, index) => (
              <article key={candidate.id} className="group rounded-lg border border-slate-200 bg-white p-3 transition-colors hover:border-slate-300">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${['bg-indigo-500', 'bg-violet-500', 'bg-cyan-500', 'bg-fuchsia-500'][index % 4]}`} />
                      <h3 className="truncate text-sm font-semibold text-slate-900">{candidate.name}</h3>
                    </div>
                    <p className="mt-1 truncate text-[11px] text-slate-400">{candidate.description || 'Scoring candidate'}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onCandidatesChange(candidateIds.filter((id) => id !== candidate.id))}
                    className="rounded-md p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                    aria-label={`Remove ${candidate.name}`}
                  ><X className="h-3.5 w-3.5" /></button>
                </div>
                <div className="mt-3"><ScenarioSignature scope={scope} profiles={profiles} {...signatureProps(candidate)} /></div>
              </article>
            ))}

            <div className="relative">
              <button
                type="button"
                onClick={() => setPickerOpen((value) => !value)}
                className="flex min-h-[104px] w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white/60 text-xs font-semibold text-slate-500 transition-colors hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                aria-expanded={pickerOpen}
              ><Plus className="h-4 w-4" /> Add candidate</button>
              {pickerOpen && (
                <div className="absolute left-0 top-full z-30 mt-2 w-[min(340px,85vw)] rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                  <input
                    autoFocus
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search scenarios…"
                    className="mb-2 w-full rounded-lg border-slate-200 bg-slate-50 text-sm focus:border-indigo-400 focus:ring-indigo-400"
                  />
                  <div className="max-h-56 overflow-y-auto">
                    {available.map((item) => {
                      const selected = candidateIds.includes(item.id);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => onCandidatesChange(selected ? candidateIds.filter((id) => id !== item.id) : [...candidateIds, item.id])}
                          className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
                        >
                          <span className="truncate font-medium text-slate-700">{item.name}</span>
                          {selected && <Check className="h-4 w-4 text-indigo-600" />}
                        </button>
                      );
                    })}
                    {!available.length && <p className="px-3 py-5 text-center text-xs text-slate-400">No matching scenarios</p>}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-end justify-end">
          <button
            type="button"
            onClick={onRun}
            disabled={running || !baselineId || !candidateIds.length}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 xl:w-auto"
          ><Play className="h-4 w-4 fill-current" /> {running ? 'Running…' : 'Run comparison'}</button>
        </div>
      </div>
    </section>
  );
}
