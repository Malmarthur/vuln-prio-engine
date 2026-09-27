import { Activity as ActivityIcon, CheckCircle2, CircleX, Loader2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { isActive, progressText, type Task, useActivity } from '../lib/activity';

// Finished tasks stay visible briefly so the outcome is noticed.
const LINGER_MS = 15_000;

function elapsed(task: Task, now: number): string {
  if (!task.startedAt) return '';
  const end = task.finishedAt ? Date.parse(task.finishedAt) : now;
  const seconds = Math.max(0, Math.round((end - Date.parse(task.startedAt)) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
}

function useVisibleTasks(): Task[] {
  const { tasks } = useActivity();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return tasks.filter((task) => isActive(task) || (task.finishedAt != null && now - Date.parse(task.finishedAt) < LINGER_MS));
}

/** Sidebar list of background work, visible from every page. */
export default function ActivityPanel() {
  const { cancel } = useActivity();
  const tasks = useVisibleTasks();
  const now = Date.now();
  if (!tasks.length) return null;
  return (
    <section className="border-t border-gray-800 px-3 py-3" aria-label="Background activity" aria-live="polite">
      <div className="mb-2 flex items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        <ActivityIcon className="h-3 w-3" /> Activity
      </div>
      <ul className="space-y-2">
        {tasks.map((task) => {
          const active = isActive(task);
          return (
            <li key={task.key} className="border border-gray-800 bg-gray-950/40 px-2.5 py-2">
              <div className="flex items-start gap-2">
                {active ? <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-accent-300" />
                  : task.status === 'completed' ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-300" />
                    : <CircleX className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] font-medium text-gray-100">{task.title}</div>
                  <div className="truncate text-[11px] text-gray-400">
                    {active ? (task.label ?? 'In progress') : task.status === 'completed' ? (task.summary ?? 'Completed') : task.status === 'failed' ? 'Failed' : 'Cancelled'}
                  </div>
                </div>
                {active && !task.cancelRequested && (task.kind !== 'ingestion' || task.status === 'running') && (
                  <button onClick={() => cancel(task)} className="shrink-0 p-0.5 text-gray-500 hover:text-gray-200" aria-label={`Cancel ${task.title}`} title="Cancel">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {active && (
                <>
                  <div className="mt-1.5 h-1 overflow-hidden bg-gray-800">
                    <div
                      className={`h-full bg-accent-400 transition-[width] duration-700 ${task.progress == null ? 'w-1/3 animate-pulse' : ''}`}
                      style={task.progress != null ? { width: `${Math.max(task.progress, 2)}%` } : undefined}
                    />
                  </div>
                  <div className="mt-1 flex justify-between font-mono text-[10px] text-gray-500">
                    <span>{progressText(task)}</span>
                    <span>{elapsed(task, now)}</span>
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Compact indicator for small screens, where the sidebar is a top bar. */
export function ActivityChip() {
  const tasks = useVisibleTasks().filter(isActive);
  if (!tasks.length) return null;
  const first = tasks[0];
  return (
    <div className="inline-flex items-center gap-1.5 border border-accent-200 bg-accent-50 px-2 py-0.5 text-[11px] text-accent-800 md:hidden" role="status">
      <Loader2 className="h-3 w-3 animate-spin" />
      {tasks.length > 1 ? `${tasks.length} tasks running` : `${first.title} · ${progressText(first)}`}
    </div>
  );
}
