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
    <div className="space-y-7 pb-12">
      <header className="flex flex-col gap-4 pt-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-600"><span className="h-px w-6 bg-indigo-500" /> Scoring intelligence</div>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-slate-950">Compare scoring strategies</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">See exactly how a scoring model reshapes priority, rank and remediation focus — without changing the active strategy.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FreshnessBadge summary={summary} />
          <button onClick={onManageProfiles} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-white hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"><Settings2 className="h-4 w-4" /> Manage scoring profiles</button>
          <button onClick={() => setHistoryOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"><History className="h-4 w-4" /> Recent comparisons</button>
        </div>
      </header>

      {error && <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div className="flex-1">{error}</div><button onClick={() => setError(null)} className="text-xs font-semibold">Dismiss</button></div>}

      <ComparisonComposer scope={scope} onScopeChange={changeScope} options={options} baselineId={baselineId} onBaselineChange={changeBaseline} candidateIds={candidateIds} onCandidatesChange={setCandidateIds} profiles={profiles} running={running} onRun={() => run()} />

      {job && <JobProgress job={job} onCancel={() => cancelScoringJob(job.id).then(setJob).catch((reason) => setError(getErrorMessage(reason)))} />}

      {summary && <>
        {(summary.is_stale || summary.is_inconsistent) && <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /><div><div className="text-sm font-semibold text-amber-900">{summary.is_inconsistent ? 'Source data changed during this run' : 'This comparison uses older source data'}</div><div className="mt-0.5 text-xs text-amber-700">Aggregates remain available. Re-run to align the analysis with current data.</div></div></div><button onClick={() => run()} className="shrink-0 rounded-lg bg-amber-900 px-3 py-2 text-xs font-semibold text-white">Re-run with current data</button></div>}
        <ComparisonOverview summary={summary} selectedId={selectedCandidate?.id ?? ''} onSelect={(candidate) => setSelectedCandidateId(candidate.id)} />
        {selectedCandidate && <CandidateInspector summary={summary} candidate={selectedCandidate} onSelect={(candidate) => setSelectedCandidateId(candidate.id)} />}
      </>}

      {!summary && !running && <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 px-6 py-12 text-center"><Database className="mx-auto h-7 w-7 text-slate-300" /><div className="mt-4 text-sm font-semibold text-slate-700">Ready when you are</div><div className="mt-1 text-xs text-slate-400">Run the suggested comparison to reveal how each strategy changes the queue.</div></div>}

      <ComparisonHistoryDrawer open={historyOpen} items={history} onClose={() => setHistoryOpen(false)} onOpen={openHistoryItem} onRerun={rerunHistoryItem} />
    </div>
  );
}

function JobProgress({ job, onCancel }: { job: ScoringJob; onCancel: () => void }) {
  const active = ['pending', 'running'].includes(job.status);
  const detail = job.progress_detail ?? {};
  const label = detail.phase === 'finalizing' ? 'Building the analysis' : detail.target_name ? `Scoring ${detail.target_name}` : detail.phase === 'queued' ? 'Waiting for the scoring engine' : job.status === 'completed' ? 'Comparison complete' : job.status === 'cancelled' ? 'Comparison cancelled' : 'Preparing comparison';
  return <div className={`rounded-xl border p-4 ${job.status === 'failed' ? 'border-rose-200 bg-rose-50' : job.status === 'completed' ? 'border-emerald-200 bg-emerald-50/60' : 'border-indigo-200 bg-indigo-50/50'}`} role="status" aria-live="polite"><div className="flex items-center gap-3"><span className={`flex h-9 w-9 items-center justify-center rounded-lg ${job.status === 'completed' ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-100 text-indigo-600'}`}>{job.status === 'completed' ? <CheckCircle2 className="h-4 w-4" /> : <Clock3 className={`h-4 w-4 ${active ? 'animate-pulse' : ''}`} />}</span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3 text-xs"><span className="truncate font-semibold text-slate-800">{label}</span><span className="font-mono tabular-nums text-slate-500">{Math.round(job.progress)}%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/80"><div className="h-full rounded-full bg-indigo-600 transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${job.progress}%` }} /></div><div className="mt-1.5 text-[10px] text-slate-400">{detail.total_targets ? `${detail.completed_targets ?? 0} of ${detail.total_targets} scenarios complete` : job.status}</div></div>{active && <button onClick={onCancel} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:text-rose-600"><Square className="h-3 w-3 fill-current" /> Cancel</button>}</div></div>;
}

function FreshnessBadge({ summary }: { summary: ComparisonSummary | null }) {
  const dates = summary ? Object.values(summary.dataset_watermark).map((item) => item.updated_at).filter(Boolean) as string[] : [];
  const sortedDates = dates.sort();
  const latest = sortedDates.length > 0 ? sortedDates[sortedDates.length - 1] : undefined;
  return <span className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-[10px] font-semibold text-slate-500"><Database className="h-3.5 w-3.5" /> {latest ? `Data ${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(latest))}` : 'Current dataset'}</span>;
}

function WorkspaceSkeleton() { return <div className="space-y-6"><div className="h-20 animate-pulse rounded-xl bg-slate-200/60" /><div className="h-64 animate-pulse rounded-xl bg-white" /><div className="h-80 animate-pulse rounded-xl bg-white" /></div>; }

function readDraft(): { scope: ScoringScope; baselineId: string; candidateIds: string[] } | null { try { const value = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? 'null'); return value?.scope && Array.isArray(value.candidateIds) ? value : null; } catch { return null; } }
function updateJobUrl(jobId: string) { const url = new URL(window.location.href); url.searchParams.set('tab', 'compare'); url.searchParams.set('job', jobId); window.history.replaceState({}, '', url); }
