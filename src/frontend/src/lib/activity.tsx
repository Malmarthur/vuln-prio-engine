import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ActivityIngestion,
  ActivityJob,
  ScoringScope,
  cancelIngestion,
  cancelScoringJob,
  ScoringJob,
  fetchActivity,
  startMatchingJob,
  startScoringRun,
} from '../api/client';
import { getErrorMessage } from './utils';

// Background work (scoring/matching jobs, comparisons, ingestions) normalized
// into one shape so every page can show and react to it.
export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Task {
  key: string;
  type: 'job' | 'ingestion';
  id: string;
  kind: 'run' | 'comparison' | 'matching' | 'ingestion';
  scope?: ScoringScope;
  source?: string;
  title: string;
  label?: string;
  status: TaskStatus;
  progress: number | null;
  error?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  cancelRequested?: boolean;
  summary?: string;
  /** Local placeholder while the start request is in flight: no server id yet. */
  pending?: boolean;
}

export interface Toast {
  id: number;
  tone: 'success' | 'error' | 'info';
  title: string;
  message?: string;
}

const ACTIVE_POLL_MS = 1500;
const IDLE_POLL_MS = 10_000;
// Each poll schedules the next one, so a request that never settles (e.g. cut
// by a backend restart) would stop tracking until a page reload.
const POLL_TIMEOUT_MS = 10_000;
const RECENT_MS = 10 * 60_000;
// A job returned by its start endpoint stays shown until a poll sees it.
const OPTIMISTIC_MS = 30_000;

export function isActive(task: Task): boolean {
  return task.status === 'queued' || task.status === 'running';
}

const SCOPE_LABELS: Record<string, string> = { preset: 'preset', vulnerability: 'vulnerabilities', asset: 'assets', finding: 'findings' };

/** Same wording as the backend activity feed (`app/api/activity.py`). */
export function jobTitle(kind: Task['kind'], scope?: ScoringScope, scoreAfter?: boolean): string {
  if (kind === 'matching') return scoreAfter ? 'Matching & scoring findings' : 'Matching findings';
  if (kind === 'comparison') return 'Strategy comparison';
  return `Scoring ${SCOPE_LABELS[scope ?? ''] ?? scope}`;
}

function startedJob(job: ScoringJob): ActivityJob {
  return { ...job, title: jobTitle(job.kind, job.scope, Boolean(job.request.score_after)), result_summary: null };
}

function jobTask(job: ActivityJob): Task {
  const status: TaskStatus = job.status === 'pending' ? 'queued' : job.status;
  return {
    key: `job:${job.id}`,
    type: 'job',
    id: job.id,
    kind: job.kind,
    scope: job.scope,
    title: job.title,
    label: job.cancel_requested && status === 'running' ? 'Cancelling…' : job.progress_detail.label,
    status,
    progress: job.progress,
    error: job.error,
    startedAt: job.started_at,
    finishedAt: job.finished_at,
    cancelRequested: job.cancel_requested,
    summary: jobSummary(job),
  };
}

function jobSummary(job: ActivityJob): string | undefined {
  const result = job.result_summary ?? {};
  if (job.kind === 'matching') {
    const parts = [`${(result.findings_matched ?? 0).toLocaleString()} findings matched`];
    if (result.rows_scored != null) parts.push(`${result.rows_scored.toLocaleString()} scored`);
    return parts.join(', ');
  }
  if (job.kind === 'comparison') return 'Results are available in Compare.';
  if (result.rows_scored != null) return `${result.rows_scored.toLocaleString()} rows scored`;
  return undefined;
}

function ingestionTask(log: ActivityIngestion): Task {
  const status: TaskStatus = log.status === 'pending'
    ? 'queued'
    : log.status === 'running' || log.status === 'cancelling'
      ? 'running'
      : log.status === 'success'
        ? 'completed'
        : log.status;
  return {
    key: `ingestion:${log.id}`,
    type: 'ingestion',
    id: log.id,
    kind: 'ingestion',
    source: log.source,
    title: `${log.source.toUpperCase()} ingestion`,
    label: log.status === 'cancelling' ? 'Cancelling…' : undefined,
    status,
    progress: log.progress,
    error: log.error_message,
    startedAt: log.started_at,
    finishedAt: log.finished_at,
    summary: log.records_processed != null ? `${log.records_processed.toLocaleString()} records processed` : undefined,
  };
}

export function tasksFromActivity(activity: Activity, now = Date.now()): Task[] {
  const ingestions = activity.ingestions
    .map(ingestionTask)
    .filter((task) => isActive(task) || (task.finishedAt != null && now - Date.parse(task.finishedAt) < RECENT_MS));
  return [...activity.jobs.map(jobTask), ...ingestions];
}

/**
 * Tasks that finished since the previous poll: either seen active before, or
 * new and already finished (short tasks such as a KEV ingestion can start and
 * end between two polls). Callers skip this on the very first poll so work
 * finished before the page opened is not reported.
 */
/** Replace the task with the same key, or put it first. */
export function upsertTask(tasks: Task[], task: Task): Task[] {
  return tasks.some((item) => item.key === task.key)
    ? tasks.map((item) => (item.key === task.key ? task : item))
    : [task, ...tasks];
}

export function finishedTransitions(previous: Map<string, TaskStatus>, next: Task[]): Task[] {
  return next.filter((task) => {
    if (isActive(task)) return false;
    const before = previous.get(task.key);
    return before === undefined || before === 'queued' || before === 'running';
  });
}

type Listener = (task: Task) => void;

interface ActivityContextValue {
  tasks: Task[];
  toasts: Toast[];
  refresh: () => void;
  startMatching: (scoreAfter: boolean) => Promise<void>;
  startScoring: (scope: ScoringScope) => Promise<void>;
  cancel: (task: Task) => Promise<void>;
  dismissToast: (id: number) => void;
  notify: (toast: Omit<Toast, 'id'>) => void;
  subscribe: (listener: Listener) => () => void;
}

const ActivityContext = createContext<ActivityContextValue | null>(null);

export function ActivityProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const statuses = useRef<Map<string, TaskStatus> | null>(null);
  const listeners = useRef(new Set<Listener>());
  const timer = useRef<number | undefined>(undefined);
  // Only the latest poll may apply its response: an older one still in flight
  // would otherwise overwrite fresher state (e.g. a job that was just started).
  const pollSeq = useRef(0);
  const inFlight = useRef<AbortController | null>(null);
  // Jobs returned by their start endpoint, kept until the feed includes them.
  const optimistic = useRef(new Map<string, { task: Task; at: number }>());
  const starting = useRef(new Set<string>());
  const nextToastId = useRef(1);

  const dismissToast = useCallback((id: number) => setToasts((items) => items.filter((item) => item.id !== id)), []);

  const notify = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = nextToastId.current++;
    setToasts((items) => [...items.slice(-3), { ...toast, id }]);
    window.setTimeout(() => dismissToast(id), toast.tone === 'error' ? 12_000 : 6_000);
  }, [dismissToast]);

  const poll = useCallback(async () => {
    window.clearTimeout(timer.current);
    const seq = ++pollSeq.current;
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), POLL_TIMEOUT_MS);
    let anyActive = false;
    try {
      const activity = await fetchActivity(controller.signal);
      if (seq !== pollSeq.current) return;
      let next = tasksFromActivity(activity);
      const now = Date.now();
      for (const [key, entry] of optimistic.current) {
        if (next.some((task) => task.key === key) || now - entry.at > OPTIMISTIC_MS) optimistic.current.delete(key);
        else next = upsertTask(next, entry.task);
      }
      anyActive = next.some(isActive);
      // The first load only records state: tasks that ended before the page
      // opened must not trigger notifications or reloads.
      if (statuses.current) {
        for (const task of finishedTransitions(statuses.current, next)) {
          listeners.current.forEach((listener) => listener(task));
          if (task.status === 'completed') notify({ tone: 'success', title: `${task.title} completed`, message: task.summary });
          else if (task.status === 'failed') notify({ tone: 'error', title: `${task.title} failed`, message: task.error ?? undefined });
          else notify({ tone: 'info', title: `${task.title} cancelled` });
        }
      }
      statuses.current = new Map(next.map((task) => [task.key, task.status]));
      setTasks(next);
    } catch {
      // The backend may be restarting; keep the last known state and retry.
      if (seq !== pollSeq.current) return;
    } finally {
      window.clearTimeout(timeout);
    }
    timer.current = window.setTimeout(poll, anyActive ? ACTIVE_POLL_MS : IDLE_POLL_MS);
  }, [notify]);

  useEffect(() => {
    poll();
    // Catch up at once when the tab comes back (background timers are throttled).
    const onVisible = () => { if (document.visibilityState === 'visible') poll(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      window.clearTimeout(timer.current);
      inFlight.current?.abort();
      pollSeq.current++;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [poll]);

  const run = useCallback(async (action: () => Promise<unknown>, failureTitle: string) => {
    try {
      await action();
    } catch (reason) {
      notify({ tone: 'error', title: failureTitle, message: getErrorMessage(reason) });
    } finally {
      poll();
    }
  }, [notify, poll]);

  // Show the job at once: a placeholder while the request is in flight, then
  // the job the endpoint returned, without waiting for the next poll.
  const start = useCallback(async (
    placeholder: Pick<Task, 'kind' | 'scope' | 'title'>,
    action: () => Promise<ScoringJob>,
    failureTitle: string,
  ) => {
    const pendingKey = `pending:${placeholder.kind}:${placeholder.scope ?? ''}`;
    if (starting.current.has(pendingKey)) return; // double click
    starting.current.add(pendingKey);
    // Polls already scheduled or in flight predate this job and would drop it.
    window.clearTimeout(timer.current);
    inFlight.current?.abort();
    pollSeq.current++;
    setTasks((items) => upsertTask(items, {
      ...placeholder, key: pendingKey, type: 'job', id: '', status: 'queued', progress: null, label: 'Starting…', pending: true,
    }));
    try {
      const task = jobTask(startedJob(await action()));
      optimistic.current.set(task.key, { task, at: Date.now() });
      statuses.current?.set(task.key, task.status);
      setTasks((items) => upsertTask(items.filter((item) => item.key !== pendingKey), task));
    } catch (reason) {
      setTasks((items) => items.filter((item) => item.key !== pendingKey));
      notify({ tone: 'error', title: failureTitle, message: getErrorMessage(reason) });
    } finally {
      starting.current.delete(pendingKey);
      poll();
    }
  }, [notify, poll]);

  const subscribe = useCallback((listener: Listener) => {
    listeners.current.add(listener);
    return () => { listeners.current.delete(listener); };
  }, []);

  const value = useMemo<ActivityContextValue>(() => ({
    tasks,
    toasts,
    refresh: () => { poll(); },
    startMatching: (scoreAfter) => start(
      { kind: 'matching', scope: 'finding', title: jobTitle('matching', 'finding', scoreAfter) },
      () => startMatchingJob(scoreAfter),
      'Could not start matching',
    ),
    startScoring: (scope) => start(
      { kind: 'run', scope, title: jobTitle('run', scope) },
      () => startScoringRun(scope),
      'Could not start scoring',
    ),
    cancel: (task) => run(
      () => (task.type === 'job' ? cancelScoringJob(task.id) : cancelIngestion(task.source ?? '')),
      'Could not cancel the task',
    ),
    dismissToast,
    notify,
    subscribe,
  }), [tasks, toasts, poll, run, start, dismissToast, notify, subscribe]);

  return <ActivityContext.Provider value={value}>{children}</ActivityContext.Provider>;
}

export function useActivity(): ActivityContextValue {
  const context = useContext(ActivityContext);
  if (!context) throw new Error('useActivity must be used inside ActivityProvider');
  return context;
}

/** The running (or queued) task matching `predicate`, if any. */
export function useActiveTask(predicate: (task: Task) => boolean): Task | undefined {
  const { tasks } = useActivity();
  return tasks.find((task) => isActive(task) && predicate(task));
}

/** Call `callback` whenever a task matching `filter` finishes. */
export function useActivityFinished(filter: (task: Task) => boolean, callback: (task: Task) => void): void {
  const { subscribe } = useActivity();
  const latest = useRef({ filter, callback });
  latest.current = { filter, callback };
  useEffect(() => subscribe((task) => {
    if (latest.current.filter(task)) latest.current.callback(task);
  }), [subscribe]);
}

// Common filters
export const affectsScores = (task: Task) => task.kind === 'run' || task.kind === 'matching' || task.kind === 'ingestion';
export const affectsFindings = (task: Task) => task.kind === 'matching' || (task.kind === 'run' && (task.scope === 'preset' || task.scope === 'finding'));

export function progressText(task: Task): string {
  if (task.status === 'queued') return 'Queued';
  return task.progress != null ? `${Math.round(task.progress)}%` : 'Running';
}
