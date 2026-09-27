import { AlertTriangle, CheckCircle2, Clock3, Database, History, Settings2, Square } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  ComparisonHistoryItem,
  ComparisonSummary,
  NamedScoringProfile,
  ScoringJob,
  ScoringPreset,
  ScoringScope,
  cancelScoringJob,
  fetchComparisonHistory,
  fetchComparisonSummary,
  fetchNamedProfiles,
  fetchScoringJob,
  fetchScoringPresets,
  startScoringComparison,
} from '../../api/client';
import { getErrorMessage } from '../../lib/utils';
import CandidateInspector from './CandidateInspector';
import ComparisonComposer from './ComparisonComposer';
import ComparisonHistoryDrawer from './ComparisonHistoryDrawer';
import ComparisonOverview from './ComparisonOverview';

const DRAFT_KEY = 'vulnprio.comparison-draft.v2';
type Scenario = ScoringPreset | NamedScoringProfile;

export default function ComparisonWorkspace({ onManageProfiles }: { onManageProfiles: () => void }) {
  const [scope, setScope] = useState<ScoringScope>('preset');
  const [presets, setPresets] = useState<ScoringPreset[]>([]);
  const [profiles, setProfiles] = useState<NamedScoringProfile[]>([]);
  const [baselineId, setBaselineId] = useState('');
  const [candidateIds, setCandidateIds] = useState<string[]>([]);
  const [job, setJob] = useState<ScoringJob | null>(null);
  const [summary, setSummary] = useState<ComparisonSummary | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [history, setHistory] = useState<ComparisonHistoryItem[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const options = useMemo<Scenario[]>(() => scope === 'preset' ? presets : profiles.filter((item) => item.stage === scope), [scope, presets, profiles]);
  const running = Boolean(job && ['pending', 'running'].includes(job.status));
  const selectedCandidate = summary?.candidates.find((item) => item.id === selectedCandidateId) ?? summary?.candidates[0];

  useEffect(() => {
    Promise.all([fetchScoringPresets(), fetchNamedProfiles(), fetchComparisonHistory()])
      .then(([nextPresets, nextProfiles, nextHistory]) => {
        setPresets(nextPresets);
        setProfiles(nextProfiles);
        setHistory(nextHistory);
        const saved = readDraft();
        const nextScope = saved?.scope ?? 'preset';
        const nextOptions: Scenario[] = nextScope === 'preset' ? nextPresets : nextProfiles.filter((item) => item.stage === nextScope);
        const active = nextPresets.find((item) => item.is_active);
        const savedBaseline = nextOptions.some((item) => item.id === saved?.baselineId) ? saved!.baselineId : (nextScope === 'preset' ? active?.id : nextOptions[0]?.id) ?? '';
        const savedCandidates = saved?.candidateIds.filter((id) => nextOptions.some((item) => item.id === id) && id !== savedBaseline) ?? [];
        const suggested = nextOptions.filter((item) => item.id !== savedBaseline && item.is_builtin).map((item) => item.id);
        setScope(nextScope);
        setBaselineId(savedBaseline);
        setCandidateIds(savedCandidates.length ? savedCandidates : suggested);
      })
      .catch((reason) => setError(getErrorMessage(reason)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (loading) return;
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ scope, baselineId, candidateIds }));
  }, [scope, baselineId, candidateIds, loading]);

  useEffect(() => {
    const jobId = new URL(window.location.href).searchParams.get('job');
    if (!jobId) return;
    fetchScoringJob(jobId)
      .then((value) => {
        setJob(value);
        if (value.status === 'completed') return fetchComparisonSummary(value.id).then(applySummary);
      })
      .catch((reason) => setError(getErrorMessage(reason)));
  }, []);

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
  }, [job?.id, job?.status]);

  const applySummary = (value: ComparisonSummary) => {
    setSummary(value);
    setSelectedCandidateId((current) => value.candidates.some((item) => item.id === current) ? current : value.candidates[0]?.id ?? '');
    setScope(value.scope);
    setBaselineId(value.baseline.id);
    setCandidateIds(value.candidates.map((item) => item.id));
    updateJobUrl(value.job_id);
  };

  const changeScope = (nextScope: ScoringScope) => {
    const nextOptions: Scenario[] = nextScope === 'preset' ? presets : profiles.filter((item) => item.stage === nextScope);
    const nextBaseline = nextScope === 'preset' ? presets.find((item) => item.is_active)?.id ?? nextOptions[0]?.id ?? '' : nextOptions[0]?.id ?? '';
    setScope(nextScope);
    setBaselineId(nextBaseline);
    setCandidateIds(nextOptions.filter((item) => item.id !== nextBaseline && item.is_builtin).map((item) => item.id));
  };

  const changeBaseline = (id: string) => {
    setBaselineId(id);
    setCandidateIds((values) => values.filter((value) => value !== id));
  };

  const run = async (override?: { scope: ScoringScope; baselineId: string; candidateIds: string[] }) => {
    const next = override ?? { scope, baselineId, candidateIds };
    if (!next.baselineId || !next.candidateIds.length) return;
    setError(null);
    try {
      setScope(next.scope);
      setBaselineId(next.baselineId);
      setCandidateIds(next.candidateIds);
      const created = await startScoringComparison(next.scope, next.baselineId, next.candidateIds);
      setJob(created);
      updateJobUrl(created.id);
    } catch (reason) { setError(getErrorMessage(reason)); }
  };

  const openHistoryItem = async (item: ComparisonHistoryItem) => {
    try { applySummary(await fetchComparisonSummary(item.job_id)); setHistoryOpen(false); }
    catch (reason) { setError(getErrorMessage(reason)); }
  };

  const rerunHistoryItem = async (item: ComparisonHistoryItem) => {
    try {
      setHistoryOpen(false);
      await run({ scope: item.scope, baselineId: item.baseline_id, candidateIds: item.candidate_ids });
    } catch (reason) { setError(getErrorMessage(reason)); }
  };

  if (loading) return <WorkspaceSkeleton />;

  return (
    <div className="space-y-4 pb-12">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <FreshnessBadge summary={summary} />
        <button onClick={onManageProfiles} className="btn-ghost"><Settings2 className="h-3.5 w-3.5" /> Manage scoring profiles</button>
        <button onClick={() => setHistoryOpen(true)} className="btn-secondary"><History className="h-3.5 w-3.5" /> Recent comparisons</button>
      </div>

      {error && <div className="notice-error" role="alert"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div className="flex-1">{error}</div><button onClick={() => setError(null)} className="text-xs font-semibold underline">Dismiss</button></div>}

      <ComparisonComposer scope={scope} onScopeChange={changeScope} options={options} baselineId={baselineId} onBaselineChange={changeBaseline} candidateIds={candidateIds} onCandidatesChange={setCandidateIds} profiles={profiles} running={running} onRun={() => run()} />

      {job && <JobProgress job={job} onCancel={() => cancelScoringJob(job.id).then(setJob).catch((reason) => setError(getErrorMessage(reason)))} />}

      {summary && <>
        {(summary.is_stale || summary.is_inconsistent) && <div className="notice-warning flex-col sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><div><div className="font-semibold">{summary.is_inconsistent ? 'Source data changed during this run' : 'This comparison uses older source data'}</div><div className="mt-0.5 text-xs">Aggregates remain available. Re-run to align the analysis with current data.</div></div></div><button onClick={() => run()} className="btn-secondary btn-sm shrink-0">Re-run with current data</button></div>}
        <ComparisonOverview summary={summary} selectedId={selectedCandidate?.id ?? ''} onSelect={(candidate) => setSelectedCandidateId(candidate.id)} />
        {selectedCandidate && <CandidateInspector summary={summary} candidate={selectedCandidate} onSelect={(candidate) => setSelectedCandidateId(candidate.id)} />}
      </>}

      {!summary && !running && <div className="border border-dashed border-gray-300 bg-white px-6 py-10 text-center"><Database className="mx-auto h-5 w-5 text-gray-400" /><div className="mt-2 text-[13px] font-semibold text-gray-700">No comparison loaded</div><div className="mt-1 text-xs text-gray-500">Run the comparison above, or open one from Recent comparisons.</div></div>}

      <ComparisonHistoryDrawer open={historyOpen} items={history} onClose={() => setHistoryOpen(false)} onOpen={openHistoryItem} onRerun={rerunHistoryItem} />
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

function readDraft(): { scope: ScoringScope; baselineId: string; candidateIds: string[] } | null { try { const value = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? 'null'); return value?.scope && Array.isArray(value.candidateIds) ? value : null; } catch { return null; } }
function updateJobUrl(jobId: string) { const url = new URL(window.location.href); url.searchParams.set('tab', 'compare'); url.searchParams.set('job', jobId); window.history.replaceState({}, '', url); }
