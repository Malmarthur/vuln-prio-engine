import { AlertTriangle, CheckCircle2, Clock3, Database, History, RotateCcw, Settings2, Square } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ComparisonFacets,
  ComparisonFilters,
  ComparisonHistoryItem,
  ComparisonSummary,
  FollowedEntityType,
  NamedScoringProfile,
  ScoringJob,
  ScoringPreset,
  ScoringScope,
  cancelScoringJob,
  fetchComparisonFacets,
  fetchComparisonHistory,
  fetchComparisonSummary,
  fetchFollowedItems,
  fetchNamedProfiles,
  fetchScoringJob,
  fetchScoringPresets,
  followComparisonMatches,
  followItems,
  startScoringComparison,
  unfollowItems,
} from '../../api/client';
import { getErrorMessage } from '../../lib/utils';
import CandidateInspector from './CandidateInspector';
import ComparisonComposer from './ComparisonComposer';
import ComparisonFilterBar from './ComparisonFilterBar';
import ComparisonHistoryDrawer from './ComparisonHistoryDrawer';
import ComparisonOverview from './ComparisonOverview';
import FollowedItemsPanel from './FollowedItemsPanel';
import {
  ChartSelection,
  ComparisonView,
  DEFAULT_VIEW,
  EMPTY_ATTRIBUTES,
  EMPTY_POPULATION,
  EMPTY_SELECTION,
  Population,
  attributeQuery,
  describeAttributes,
  entityNoun,
  entityTypeOf,
  fromSubset,
  hasAttributes,
  toSubset,
  viewQuery,
} from './filters';

const DRAFT_KEY = 'vulnprio.comparison-draft.v2';
// Survive reloads and browser restarts: the last opened comparison and how it was being viewed.
const LAST_JOB_KEY = 'vulnprio.comparison-last-job.v1';
const VIEW_KEY = 'vulnprio.comparison-view.v1';
type Scenario = ScoringPreset | NamedScoringProfile;
type RunRequest = { scope: ScoringScope; baselineId: string; candidateIds: string[]; subset?: ComparisonFilters | null };

export default function ComparisonWorkspace({ onManageProfiles, active = true }: { onManageProfiles: () => void; active?: boolean }) {
  const [scope, setScope] = useState<ScoringScope>('preset');
  const [presets, setPresets] = useState<ScoringPreset[]>([]);
  const [profiles, setProfiles] = useState<NamedScoringProfile[]>([]);
  const [baselineId, setBaselineId] = useState('');
  const [candidateIds, setCandidateIds] = useState<string[]>([]);
  const [population, setPopulation] = useState<Population>(EMPTY_POPULATION);
  const [job, setJob] = useState<ScoringJob | null>(null);
  const [summary, setSummary] = useState<ComparisonSummary | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [view, setView] = useState<ComparisonView>(DEFAULT_VIEW);
  const [facets, setFacets] = useState<ComparisonFacets | null>(null);
  const [facetsLoading, setFacetsLoading] = useState(false);
  const [followed, setFollowed] = useState<Partial<Record<FollowedEntityType, string[]>>>({});
  const [history, setHistory] = useState<ComparisonHistoryItem[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const summaryRef = useRef<ComparisonSummary | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  const options = useMemo<Scenario[]>(() => scope === 'preset' ? presets : profiles.filter((item) => item.stage === scope), [scope, presets, profiles]);
  const running = Boolean(job && ['pending', 'running'].includes(job.status));
  const filtered = Boolean(facets && hasAttributes(view.attributes));
  const display = useMemo(() => (summary && facets && filtered ? withFacets(summary, facets) : summary), [summary, facets, filtered]);
  const selectedCandidate = display?.candidates.find((item) => item.id === selectedCandidateId) ?? display?.candidates[0];
  const summaryType = summary ? entityTypeOf(summary.scope) : null;
  const followedSet = useMemo(() => new Set(summaryType ? followed[summaryType] ?? [] : []), [followed, summaryType]);
  const changed = useMemo(() => new Map(summary && summary.scope === scope ? (summary.changed_scenarios ?? []).map((item) => [item.id, item.reasons] as const) : []), [summary, scope]);

  const loadFollowed = useCallback((type: FollowedEntityType) => {
    fetchFollowedItems(type)
      .then((items) => setFollowed((current) => ({ ...current, [type]: items.map((item) => item.entity_id) })))
      .catch(() => undefined);
  }, []);

  const applySummary = useCallback((value: ComparisonSummary) => {
    const sameJob = summaryRef.current?.job_id === value.job_id;
    summaryRef.current = value;
    setSummary(value);
    if (sameJob) {
      setSelectedCandidateId((current) => value.candidates.some((item) => item.id === current) ? current : value.candidates[0]?.id ?? '');
    } else {
      const saved = readStorage<{ jobId: string; candidateId: string; view: ComparisonView }>(VIEW_KEY);
      const restored = saved?.jobId === value.job_id ? saved : null;
      setView(restored ? restoreView(restored.view) : DEFAULT_VIEW);
      setFacets(null);
      setSelectedCandidateId(restored && value.candidates.some((item) => item.id === restored.candidateId) ? restored.candidateId : value.candidates[0]?.id ?? '');
      setScope(value.scope);
      setBaselineId(value.baseline.id);
      setCandidateIds(value.candidates.map((item) => item.id));
      setPopulation(fromSubset(value.subset));
    }
    writeStorage(LAST_JOB_KEY, value.job_id);
    if (activeRef.current) updateJobUrl(value.job_id);
  }, []);

  useEffect(() => {
    Promise.all([fetchScoringPresets(), fetchNamedProfiles(), fetchComparisonHistory()])
      .then(([nextPresets, nextProfiles, nextHistory]) => {
        setPresets(nextPresets);
        setProfiles(nextProfiles);
        setHistory(nextHistory);
        if (summaryRef.current) return;
        const saved = readDraft();
        const nextScope = saved?.scope ?? 'preset';
        const nextOptions: Scenario[] = nextScope === 'preset' ? nextPresets : nextProfiles.filter((item) => item.stage === nextScope);
        const activePreset = nextPresets.find((item) => item.is_active);
        const savedBaseline = nextOptions.some((item) => item.id === saved?.baselineId) ? saved!.baselineId : (nextScope === 'preset' ? activePreset?.id : nextOptions[0]?.id) ?? '';
        const savedCandidates = saved?.candidateIds.filter((id) => nextOptions.some((item) => item.id === id) && id !== savedBaseline) ?? [];
        const suggested = nextOptions.filter((item) => item.id !== savedBaseline && item.is_builtin).map((item) => item.id);
        setScope(nextScope);
        setBaselineId(savedBaseline);
        setCandidateIds(savedCandidates.length ? savedCandidates : suggested);
        if (saved?.population?.attributes) setPopulation({ ...EMPTY_POPULATION, ...saved.population, attributes: { ...EMPTY_ATTRIBUTES, ...saved.population.attributes } });
      })
      .catch((reason) => setError(getErrorMessage(reason)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (loading) return;
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ scope, baselineId, candidateIds, population })); } catch { /* storage unavailable */ }
  }, [scope, baselineId, candidateIds, population, loading]);

  // Reopen the comparison named in the URL, else the last one opened.
  useEffect(() => {
    const fromUrl = new URL(window.location.href).searchParams.get('job');
    const jobId = fromUrl ?? readStorage<string>(LAST_JOB_KEY);
    if (!jobId) return;
    fetchScoringJob(jobId)
      .then((value) => {
        setJob(value);
        if (value.status === 'completed') return fetchComparisonSummary(value.id).then(applySummary);
      })
      .catch((reason) => {
        if (fromUrl) setError(getErrorMessage(reason));
        else removeStorage(LAST_JOB_KEY);
      });
  }, [applySummary]);

  useEffect(() => {
    if (!job || !['pending', 'running'].includes(job.status)) return;
    const timer = window.setInterval(() => {
      fetchScoringJob(job.id).then(async (next) => {
        setJob(next);
        if (next.status === 'completed') {
          applySummary(await fetchComparisonSummary(next.id));
          setHistory(await fetchComparisonHistory());
        } else if (next.status === 'failed') {
          setError(next.error || 'The comparison failed.');
        }
      }).catch((reason) => setError(getErrorMessage(reason)));
    }, 900);
    return () => window.clearInterval(timer);
  }, [job?.id, job?.status, applySummary]);

  // Coming back to the tab: profiles may have been edited meanwhile, so refresh
  // scenarios and the loaded summary (its change flags are computed on read).
  const wasActive = useRef(active);
  useEffect(() => {
    const resumed = active && !wasActive.current;
    wasActive.current = active;
    if (!resumed || loading) return;
    Promise.all([fetchScoringPresets(), fetchNamedProfiles(), fetchComparisonHistory()])
      .then(([nextPresets, nextProfiles, nextHistory]) => { setPresets(nextPresets); setProfiles(nextProfiles); setHistory(nextHistory); })
      .catch(() => undefined);
    const current = summaryRef.current;
    if (current) {
      updateJobUrl(current.job_id);
      fetchComparisonSummary(current.job_id).then(applySummary).catch(() => undefined);
    } else if (job) {
      updateJobUrl(job.id);
    }
    Object.keys(followed).forEach((type) => loadFollowed(type as FollowedEntityType));
  }, [active]);

  useEffect(() => { if (summaryType) loadFollowed(summaryType); }, [summaryType, loadFollowed]);
  useEffect(() => { loadFollowed(entityTypeOf(scope)); }, [scope, loadFollowed]);

  useEffect(() => {
    if (!summary) return;
    writeStorage(VIEW_KEY, { jobId: summary.job_id, candidateId: selectedCandidateId, view });
  }, [summary?.job_id, selectedCandidateId, view]);

  // Attribute filters recompute every chart for the filtered slice.
  const attributesKey = JSON.stringify(attributeQuery(view.attributes));
  useEffect(() => {
    if (!summary?.details_available || !hasAttributes(view.attributes)) { setFacets(null); setFacetsLoading(false); return; }
    const controller = new AbortController();
    setFacetsLoading(true);
    const timer = window.setTimeout(() => {
      fetchComparisonFacets(summary.job_id, attributeQuery(view.attributes), controller.signal)
        .then(setFacets)
        .catch((reason) => { if (!controller.signal.aborted) setError(getErrorMessage(reason)); })
        .finally(() => { if (!controller.signal.aborted) setFacetsLoading(false); });
    }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [summary?.job_id, summary?.details_available, attributesKey]);

  const changeScope = (nextScope: ScoringScope) => {
    const nextOptions: Scenario[] = nextScope === 'preset' ? presets : profiles.filter((item) => item.stage === nextScope);
    const nextBaseline = nextScope === 'preset' ? presets.find((item) => item.is_active)?.id ?? nextOptions[0]?.id ?? '' : nextOptions[0]?.id ?? '';
    setScope(nextScope);
    setBaselineId(nextBaseline);
    setCandidateIds(nextOptions.filter((item) => item.id !== nextBaseline && item.is_builtin).map((item) => item.id));
    // Explicit items belong to one entity type; criteria carry over.
    setPopulation((current) => ({ ...current, entityIds: [] }));
  };

  const changeBaseline = (id: string) => {
    setBaselineId(id);
    setCandidateIds((values) => values.filter((value) => value !== id));
  };

  const run = async (override?: RunRequest) => {
    const next = override ?? { scope, baselineId, candidateIds, subset: toSubset(population) };
    if (!next.baselineId || !next.candidateIds.length) return;
    setError(null);
    try {
      setScope(next.scope);
      setBaselineId(next.baselineId);
      setCandidateIds(next.candidateIds);
      if (override) setPopulation(fromSubset(next.subset));
      const created = await startScoringComparison(next.scope, next.baselineId, next.candidateIds, next.subset);
      setJob(created);
      writeStorage(LAST_JOB_KEY, created.id);
      updateJobUrl(created.id);
    } catch (reason) { setError(getErrorMessage(reason)); }
  };

  const rerunLoaded = () => summary && run({
    scope: summary.scope,
    baselineId: summary.baseline.id,
    candidateIds: summary.candidates.map((item) => item.id),
    subset: summary.subset,
  });

  const openHistoryItem = async (item: ComparisonHistoryItem) => {
    try { applySummary(await fetchComparisonSummary(item.job_id)); setHistoryOpen(false); }
    catch (reason) { setError(getErrorMessage(reason)); }
  };

  const rerunHistoryItem = async (item: ComparisonHistoryItem) => {
    setHistoryOpen(false);
    await run({ scope: item.scope, baselineId: item.baseline_id, candidateIds: item.candidate_ids, subset: item.subset });
  };

  const toggleFollow = async (entityId: string) => {
    if (!summaryType) return;
    const isFollowed = followedSet.has(entityId);
    setFollowed((current) => ({
      ...current,
      [summaryType]: isFollowed ? (current[summaryType] ?? []).filter((id) => id !== entityId) : [entityId, ...(current[summaryType] ?? [])],
    }));
    try {
      if (isFollowed) await unfollowItems(summaryType, [entityId]);
      else await followItems(summaryType, [entityId]);
    } catch (reason) {
      setError(getErrorMessage(reason));
      loadFollowed(summaryType);
    }
  };

  const unfollowAll = async () => {
    if (!summaryType) return;
    try { await unfollowItems(summaryType, 'all'); setFollowed((current) => ({ ...current, [summaryType]: [] })); }
    catch (reason) { setError(getErrorMessage(reason)); }
  };

  const followMatching = async () => {
    if (!summary || !selectedCandidate || !summaryType) return;
    try {
      await followComparisonMatches(summary.job_id, { ...viewQuery(view), candidate_id: selectedCandidate.id });
      loadFollowed(summaryType);
    } catch (reason) { setError(getErrorMessage(reason)); }
  };

  const filterFromOverview = (candidateId: string, patch: Partial<ChartSelection>) => {
    setSelectedCandidateId(candidateId);
    setView((current) => ({ ...current, selection: { ...current.selection, ...patch } }));
  };

  if (loading) return <WorkspaceSkeleton />;

  const populationTotal = summary ? Object.values(summary.baseline.distribution).reduce((sum, value) => sum + value, 0) : 0;
  const changedScenarios = summary?.changed_scenarios ?? [];
  const followedIds = summaryType ? followed[summaryType] ?? [] : [];

  return (
    <div className="space-y-4 pb-12">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <FreshnessBadge summary={summary} />
        <button onClick={onManageProfiles} className="btn-ghost"><Settings2 className="h-3.5 w-3.5" /> Manage scoring profiles</button>
        <button onClick={() => setHistoryOpen(true)} className="btn-secondary"><History className="h-3.5 w-3.5" /> Recent comparisons</button>
      </div>

      {error && <div className="notice-error" role="alert"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div className="flex-1">{error}</div><button onClick={() => setError(null)} className="text-xs font-semibold underline">Dismiss</button></div>}

      <ComparisonComposer scope={scope} onScopeChange={changeScope} options={options} baselineId={baselineId} onBaselineChange={changeBaseline} candidateIds={candidateIds} onCandidatesChange={setCandidateIds} profiles={profiles} running={running} onRun={() => run()} population={population} onPopulationChange={setPopulation} followedCount={(followed[entityTypeOf(scope)] ?? []).length} changed={changed} />

      {job && <JobProgress job={job} onCancel={() => cancelScoringJob(job.id).then(setJob).catch((reason) => setError(getErrorMessage(reason)))} />}

      {summary && display && <>
        {changedScenarios.length > 0 && (
          <div className="notice-warning flex-col sm:flex-row sm:items-center sm:justify-between" role="status">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <div>
                <div className="font-semibold">Scoring configuration changed since this run</div>
                <ul className="mt-0.5 space-y-0.5 text-xs">
                  {changedScenarios.map((item) => <li key={item.id}><span className="font-semibold">{item.name}</span> — {item.reasons.join('; ')}</li>)}
                </ul>
                <div className="mt-0.5 text-xs">These results reflect the previous configuration. Re-run to compare with the current profiles.</div>
              </div>
            </div>
            <button onClick={rerunLoaded} disabled={running} className="btn-secondary btn-sm shrink-0"><RotateCcw className="h-3 w-3" /> Re-run with current profiles</button>
          </div>
        )}
        {(summary.data_changed || summary.is_inconsistent) && <div className="notice-warning flex-col sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><div><div className="font-semibold">{summary.is_inconsistent ? 'Source data changed during this run' : 'This comparison uses older source data'}</div><div className="mt-0.5 text-xs">Aggregates remain available. Re-run to align the analysis with current data.</div></div></div>{!changedScenarios.length && <button onClick={rerunLoaded} disabled={running} className="btn-secondary btn-sm shrink-0">Re-run with current data</button>}</div>}
        {summary.subset && <PopulationNote summary={summary} total={populationTotal} />}
        {summary.details_available && <ComparisonFilterBar scope={summary.scope} view={view} onChange={setView} followedCount={followedIds.length} filteredTotal={filtered ? facets!.baseline_total : null} populationTotal={populationTotal} loading={facetsLoading} />}
        <div className={facetsLoading ? 'opacity-60 transition-opacity' : ''}>
          <ComparisonOverview summary={display} selectedId={selectedCandidate?.id ?? ''} onSelect={(candidate) => setSelectedCandidateId(candidate.id)} selection={view.selection} onFilter={(candidate, patch) => filterFromOverview(candidate.id, patch)} filtered={filtered} />
        </div>
        {summary.details_available && <FollowedItemsPanel summary={summary} followedKey={followedIds.join(',')} followedCount={followedIds.length} onUnfollow={toggleFollow} onClearAll={unfollowAll} />}
        {selectedCandidate && <CandidateInspector summary={display} candidate={selectedCandidate} onSelect={(candidate) => setSelectedCandidateId(candidate.id)} view={view} onViewChange={setView} filtered={filtered} scope={summary.scope} followed={followedSet} onToggleFollow={toggleFollow} onFollowMatching={followMatching} />}
      </>}

      {!summary && !running && <div className="border border-dashed border-gray-300 bg-white px-6 py-10 text-center"><Database className="mx-auto h-5 w-5 text-gray-400" /><div className="mt-2 text-[13px] font-semibold text-gray-700">No comparison loaded</div><div className="mt-1 text-xs text-gray-500">Run the comparison above, or open one from Recent comparisons.</div></div>}

      <ComparisonHistoryDrawer open={historyOpen} items={history} onClose={() => setHistoryOpen(false)} onOpen={openHistoryItem} onRerun={rerunHistoryItem} />
    </div>
  );
}

/** Replace the summary's aggregates with those of the filtered slice. */
function withFacets(summary: ComparisonSummary, facets: ComparisonFacets): ComparisonSummary {
  const byId = new Map(facets.candidates.map((item) => [item.id, item]));
  return {
    ...summary,
    baseline: { ...summary.baseline, distribution: facets.baseline_distribution },
    candidates: summary.candidates.map((candidate) => {
      const facet = byId.get(candidate.id);
      return facet ? {
        ...candidate,
        distribution: facet.distribution,
        transition_matrix: facet.transition_matrix,
        promoted: facet.promoted,
        demoted: facet.demoted,
        unchanged: facet.unchanged,
        top_n: facet.top_n,
      } : candidate;
    }),
  };
}

function PopulationNote({ summary, total }: { summary: ComparisonSummary; total: number }) {
  const population = fromSubset(summary.subset);
  const criteria = [...describeAttributes(population.attributes).map((item) => item.label), ...(population.entityIds.length ? [`${population.entityIds.length.toLocaleString()} pinned items`] : [])];
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border border-gray-300 bg-white px-4 py-2 text-xs text-gray-600">
      <span className="label-caps !text-[10px]">Population</span>
      <span className="font-mono font-semibold text-gray-800">{total.toLocaleString()} {entityNoun(summary.scope, total)}</span>
      <span>· {criteria.join(' · ')}</span>
      <span className="text-gray-500">— ranks and movements are computed inside this subset.</span>
    </div>
  );
}

function JobProgress({ job, onCancel }: { job: ScoringJob; onCancel: () => void }) {
  const active = ['pending', 'running'].includes(job.status);
  const detail = job.progress_detail ?? {};
  const label = detail.phase === 'finalizing' ? 'Building the analysis' : detail.target_name ? `Scoring ${detail.target_name}` : detail.phase === 'queued' ? 'Waiting for the scoring engine' : job.status === 'completed' ? 'Comparison complete' : job.status === 'cancelled' ? 'Comparison cancelled' : 'Preparing comparison';
  const failed = job.status === 'failed';
  return (
    <div className={`panel px-4 py-3 ${failed ? 'border-red-300' : ''}`} role="status" aria-live="polite">
      <div className="flex items-center gap-3">
        {job.status === 'completed' ? <CheckCircle2 className="h-4 w-4 shrink-0 text-accent-700" /> : <Clock3 className={`h-4 w-4 shrink-0 ${failed ? 'text-red-600' : 'text-accent-600'} ${active ? 'animate-pulse' : ''}`} />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3 text-xs"><span className="truncate font-semibold text-gray-800">{label}</span><span className="font-mono text-gray-600">{Math.round(job.progress)}%</span></div>
          <div className="mt-1.5 h-1.5 overflow-hidden bg-gray-200"><div className={`h-full transition-[width] duration-500 motion-reduce:transition-none ${failed ? 'bg-red-500' : 'bg-accent-600'}`} style={{ width: `${job.progress}%` }} /></div>
          <div className="mt-1 text-[11px] text-gray-500">{detail.total_targets ? `${detail.completed_targets ?? 0} of ${detail.total_targets} scenarios complete` : job.status}</div>
        </div>
        {active && <button onClick={onCancel} className="btn-danger btn-sm"><Square className="h-3 w-3 fill-current" /> Cancel</button>}
      </div>
    </div>
  );
}

function FreshnessBadge({ summary }: { summary: ComparisonSummary | null }) {
  const dates = summary ? Object.values(summary.dataset_watermark).map((item) => item.updated_at).filter(Boolean) as string[] : [];
  const sortedDates = dates.sort();
  const latest = sortedDates.length > 0 ? sortedDates[sortedDates.length - 1] : undefined;
  return <span className="inline-flex items-center gap-1.5 border border-gray-300 bg-white px-2 py-1 font-mono text-[11px] text-gray-600"><Database className="h-3.5 w-3.5" /> {latest ? `Data ${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(latest))}` : 'Current dataset'}</span>;
}

function WorkspaceSkeleton() { return <div className="space-y-4"><div className="panel h-64 animate-pulse" /><div className="panel h-80 animate-pulse" /></div>; }

/** Saved views may predate a field; fill the gaps with defaults. */
function restoreView(saved: Partial<ComparisonView>): ComparisonView {
  return {
    ...DEFAULT_VIEW,
    ...saved,
    attributes: { ...EMPTY_ATTRIBUTES, ...saved.attributes },
    selection: { ...EMPTY_SELECTION, ...saved.selection },
  };
}

function readDraft(): { scope: ScoringScope; baselineId: string; candidateIds: string[]; population?: Population } | null { try { const value = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? 'null'); return value?.scope && Array.isArray(value.candidateIds) ? value : null; } catch { return null; } }
function readStorage<T>(key: string): T | null { try { return JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { return null; } }
function writeStorage(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ } }
function removeStorage(key: string) { try { localStorage.removeItem(key); } catch { /* storage unavailable */ } }
function updateJobUrl(jobId: string) { const url = new URL(window.location.href); url.searchParams.set('tab', 'compare'); url.searchParams.set('job', jobId); window.history.replaceState({}, '', url); }
