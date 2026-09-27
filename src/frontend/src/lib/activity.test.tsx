import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Activity, ActivityJob } from '../api/client';
import { ActivityProvider, finishedTransitions, tasksFromActivity, useActivity, useActivityFinished } from './activity';

const mocks = vi.hoisted(() => ({ fetchActivity: vi.fn() }));
vi.mock('../api/client', async (importOriginal) => ({
  ...await importOriginal<typeof import('../api/client')>(),
  ...mocks,
}));

function job(overrides: Partial<ActivityJob>): ActivityJob {
  return {
    id: 'job-1', kind: 'matching', scope: 'finding', status: 'running', progress: 40,
    progress_detail: { phase: 'saving', label: 'Saving findings' }, request: { score_after: true },
    error: null, cancel_requested: false, created_at: '', started_at: new Date().toISOString(), finished_at: null,
    title: 'Matching & scoring findings', result_summary: null,
    ...overrides,
  };
}

const activity = (jobs: ActivityJob[]): Activity => ({ jobs, ingestions: [] });

describe('activity helpers', () => {
  it('normalizes jobs and old ingestions', () => {
    const tasks = tasksFromActivity({
      jobs: [job({ status: 'pending' })],
      ingestions: [
        { id: 'i1', source: 'nvd', status: 'running', progress: 12, started_at: null, finished_at: null, records_processed: null, error_message: null },
        { id: 'i2', source: 'kev', status: 'success', progress: 100, started_at: null, finished_at: '2020-01-01T00:00:00Z', records_processed: 5, error_message: null },
      ],
    });
    expect(tasks.map((task) => [task.key, task.status])).toEqual([['job:job-1', 'queued'], ['ingestion:i1', 'running']]);
  });

  it('reports tasks that finished since the previous poll', () => {
    const previous = new Map([['job:job-1', 'running' as const], ['job:job-2', 'completed' as const]]);
    const next = tasksFromActivity(activity([
      job({ status: 'completed' }),
      job({ id: 'job-2', status: 'completed' }),
      job({ id: 'job-3', status: 'failed' }),
      job({ id: 'job-4', status: 'running' }),
    ]));
    // job-3 started and failed between two polls; job-2 was already known as done.
    expect(finishedTransitions(previous, next).map((task) => task.id)).toEqual(['job-1', 'job-3']);
  });
});

function Listener({ onFinished }: { onFinished: (id: string) => void }) {
  useActivityFinished((task) => task.kind === 'matching', (task) => onFinished(task.id));
  const { tasks } = useActivity();
  return <div>{tasks.map((task) => `${task.title}:${task.status}`).join(',')}</div>;
}

describe('ActivityProvider', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

  it('notifies listeners and shows a toast when a running task completes', async () => {
    mocks.fetchActivity
      .mockResolvedValueOnce(activity([job({})]))
      .mockResolvedValue(activity([job({ status: 'completed', progress: 100, result_summary: { findings_matched: 3, rows_scored: 3 } })]));
    const onFinished = vi.fn();
    render(<ActivityProvider><Listener onFinished={onFinished} /><ToastProbe /></ActivityProvider>);

    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByText('Matching & scoring findings:running')).toBeInTheDocument();
    expect(onFinished).not.toHaveBeenCalled();

    await act(async () => { await vi.advanceTimersByTimeAsync(1600); });
    expect(onFinished).toHaveBeenCalledWith('job-1');
    expect(screen.getByText('Matching & scoring findings completed — 3 findings matched, 3 scored')).toBeInTheDocument();
  });

  it('does not notify for tasks that already ended before the page loaded', async () => {
    mocks.fetchActivity.mockResolvedValue(activity([job({ status: 'completed' })]));
    const onFinished = vi.fn();
    render(<ActivityProvider><Listener onFinished={onFinished} /></ActivityProvider>);
    await act(async () => { await vi.advanceTimersByTimeAsync(11_000); });
    expect(onFinished).not.toHaveBeenCalled();
  });
});

function ToastProbe() {
  const { toasts } = useActivity();
  return <ul>{toasts.map((toast) => <li key={toast.id}>{`${toast.title} — ${toast.message}`}</li>)}</ul>;
}
