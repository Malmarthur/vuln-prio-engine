import { AlertTriangle, CheckCircle2, Clock3, History, RotateCcw, X } from 'lucide-react';
import { useEffect } from 'react';
import { ComparisonHistoryItem } from '../../api/client';

export default function ComparisonHistoryDrawer({ open, items, onClose, onOpen, onRerun }: { open: boolean; items: ComparisonHistoryItem[]; onClose: () => void; onOpen: (item: ComparisonHistoryItem) => void; onRerun: (item: ComparisonHistoryItem) => void }) {
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-gray-950/30" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <aside className="h-full w-full max-w-lg overflow-y-auto border-l border-gray-300 bg-gray-100 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="history-title">
        <div className="panel-header sticky top-0 z-10">
          <div><h2 id="history-title" className="panel-title">Recent comparisons</h2><p className="panel-subtitle">Reopen an analysis or run the same scenarios on current data.</p></div>
          <button onClick={onClose} className="btn-ghost btn-sm px-1.5" aria-label="Close history"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-2 p-3">
          {items.map((item) => (
            <article key={item.job_id} className="panel">
              <div className="flex items-start justify-between gap-3 px-3 pt-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><StatusIcon status={item.status} /><span className="label-caps !text-[10px]">{item.scope}</span>{item.is_stale && <span className="border border-dashed border-gray-500 px-1 font-mono text-[10px] font-medium uppercase text-gray-700">Stale</span>}</div>
                  <h3 className="mt-1 truncate text-[13px] font-semibold text-gray-900">{item.baseline_name}</h3>
                  <p className="line-clamp-2 text-xs text-gray-500">vs {item.candidate_names.join(', ')}</p>
                </div>
                <time className="shrink-0 font-mono text-[11px] text-gray-500">{formatDate(item.created_at)}</time>
              </div>
              <div className="mt-2.5 flex items-center justify-between border-t border-gray-200 px-3 py-2">
                <span className="text-[11px] text-gray-500">{item.details_available ? 'Details available' : item.status === 'completed' ? 'Aggregates only' : `${Math.round(item.progress)}% complete`}</span>
                <div className="flex gap-1.5">{item.status === 'completed' && <button onClick={() => onOpen(item)} className="btn-secondary btn-sm">Open</button>}<button onClick={() => onRerun(item)} className="btn-ghost btn-sm"><RotateCcw className="h-3 w-3" /> Re-run</button></div>
              </div>
            </article>
          ))}
          {!items.length && <div className="panel p-10 text-center"><History className="mx-auto h-5 w-5 text-gray-400" /><div className="mt-2 text-[13px] font-medium text-gray-700">No comparisons yet</div><div className="mt-1 text-xs text-gray-500">Completed analyses will appear here.</div></div>}
        </div>
      </aside>
    </div>
  );
}

function StatusIcon({ status }: { status: ComparisonHistoryItem['status'] }) { if (status === 'completed') return <CheckCircle2 className="h-3.5 w-3.5 text-accent-700" />; if (status === 'failed' || status === 'cancelled') return <AlertTriangle className="h-3.5 w-3.5 text-red-600" />; return <Clock3 className="h-3.5 w-3.5 text-accent-600" />; }
function formatDate(value: string) { return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
