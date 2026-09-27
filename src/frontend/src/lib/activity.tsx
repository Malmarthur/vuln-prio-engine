import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ActivityIngestion,
  ActivityJob,
  ScoringScope,
  cancelIngestion,
  cancelScoringJob,
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
}

export interface Toast {
  id: number;
  tone: 'success' | 'error' | 'info';
  title: string;
  message?: string;
}

const ACTIVE_POLL_MS = 1500;
const IDLE_POLL_MS = 10_000;
const RECENT_MS = 10 * 60_000;

export function isActive(task: Task): boolean {
  return task.status === 'queued' || task.status === 'running';
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
  const nextToastId = useRef(1);

  const dismissToast = useCallback((id: number) => setToasts((items) => items.filter((item) => item.id !== id)), []);

  const notify = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = nextToastId.current++;
    setToasts((items) => [...items.slice(-3), { ...toast, id }]);
    window.setTimeout(() => dismissToast(id), toast.tone === 'error' ? 12_000 : 6_000);
  }, [dismissToast]);

  const poll = useCallback(async () => {
    window.clearTimeout(timer.current);
    let anyActive = false;
    try {
      const next = tasksFromActivity(await fetchActivity());
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
    }
    timer.current = window.setTimeout(poll, anyActive ? ACTIVE_POLL_MS : IDLE_POLL_MS);
  }, [notify]);

  useEffect(() => {
    poll();
    return () => window.clearTimeout(timer.current);
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

  const subscribe = useCallback((listener: Listener) => {
    listeners.current.add(listener);
    return () => { listeners.current.delete(listener); };
  }, []);

  const value = useMemo<ActivityContextValue>(() => ({
    tasks,
    toasts,
    refresh: () => { poll(); },
    startMatching: (scoreAfter) => run(() => startMatchingJob(scoreAfter), 'Could not start matching'),
    startScoring: (scope) => run(() => startScoringRun(scope), 'Could not start scoring'),
    cancel: (task) => run(
      () => (task.type === 'job' ? cancelScoringJob(task.id) : cancelIngestion(task.source ?? '')),
      'Could not cancel the task',
    ),
    dismissToast,
    notify,
    subscribe,
  }), [tasks, toasts, poll, run, dismissToast, notify, subscribe]);

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
