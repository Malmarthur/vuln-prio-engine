import { CheckCircle2, CircleX, Info, X } from 'lucide-react';
import { useActivity } from '../lib/activity';

const TONES = {
  success: { icon: CheckCircle2, className: 'border-l-accent-600', iconClass: 'text-accent-700' },
  error: { icon: CircleX, className: 'border-l-red-600', iconClass: 'text-red-600' },
  info: { icon: Info, className: 'border-l-gray-500', iconClass: 'text-gray-600' },
};

export default function Toasts() {
  const { toasts, dismissToast } = useActivity();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
      {toasts.map((toast) => {
        const tone = TONES[toast.tone];
        const Icon = tone.icon;
        return (
          <div key={toast.id} className={`pointer-events-auto flex items-start gap-2.5 border border-l-[3px] border-gray-300 bg-white px-3 py-2.5 shadow-lg ${tone.className}`} role={toast.tone === 'error' ? 'alert' : 'status'}>
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone.iconClass}`} />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-gray-900">{toast.title}</div>
              {toast.message && <div className="mt-0.5 line-clamp-3 break-words text-xs text-gray-600">{toast.message}</div>}
            </div>
            <button onClick={() => dismissToast(toast.id)} className="shrink-0 p-0.5 text-gray-400 hover:text-gray-700" aria-label="Dismiss notification">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
