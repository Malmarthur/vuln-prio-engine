import { useEffect, useRef, useState } from 'react';
import {
  cancelIngestion,
  fetchIngestionLogs,
  fetchIngestionStatus,
  fetchSettings,
  triggerIngestion,
  updateSetting,
  IngestionLog,
} from '../api/client';

interface StatusBadgeProps {
  status: string;
}

const SOURCES: string[] = ['kev', 'epss', 'nvd', 'euvd'];

const SCHEDULE_KEYS: Record<string, string> = {
  nvd: 'schedule_nvd_interval_hours',
  epss: 'schedule_epss_interval_hours',
  kev: 'schedule_kev_interval_hours',
  euvd: 'schedule_euvd_interval_hours',
};

const ENABLED_KEYS: Record<string, string> = {
  nvd: 'schedule_nvd_enabled',
  epss: 'schedule_epss_enabled',
  kev: 'schedule_kev_enabled',
  euvd: 'schedule_euvd_enabled',
};

function fmtDt(d: string | null | undefined): string {
  if (!d) return '\u2014';
  return new Date(d).toLocaleString();
}

function StatusBadge({ status }: StatusBadgeProps) {
  const colors: Record<string, string> = {
    success: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
    running: 'bg-blue-100 text-blue-700',
    pending: 'bg-amber-100 text-amber-700',
    cancelled: 'bg-gray-100 text-gray-600',
    cancelling: 'bg-orange-100 text-orange-700',
  };
  return (
    <span
      className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${
        colors[status] || 'bg-gray-100 text-gray-600'
      }`}
    >
      {status}
    </span>
  );
}

interface ProgressBarProps {
  progress: number;
}

function ProgressBar({ progress }: ProgressBarProps) {
  return (
    <div className="mt-1 flex items-center gap-1.5">
      <div className="flex-1 bg-gray-200 rounded-full h-1.5">
        <div
          className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>
      <span className="text-xs text-gray-500 w-8 text-right">{Math.round(progress)}%</span>
    </div>
  );
}

interface ErrorModalProps {
  message: string;
  onClose: () => void;
}

function ErrorModal({ message, onClose }: ErrorModalProps) {
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900 text-sm">Error Details</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
            aria-label="Close"
          >
            &times;
          </button>
        </div>
        <pre className="p-4 overflow-auto text-sm text-red-700 whitespace-pre-wrap font-mono">
          {message}
        </pre>
      </div>
    </div>
  );
}

export default function SettingsPanel() {
  const [settings, setSettings] = useState<Record<string, number | string | boolean>>({});
  const [status, setStatus] = useState<IngestionLog[]>([]);
  const [logs, setLogs] = useState<{ items: IngestionLog[]; total: number }>({ items: [], total: 0 });
  const [logPage, setLogPage] = useState<number>(1);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState<boolean>(false);
  const [errorModal, setErrorModal] = useState<string | null>(null);
  const pollingRef = useRef(polling);
  pollingRef.current = polling;

  // Load everything on mount
  useEffect(() => {
    Promise.all([
      fetchSettings().then(setSettings),
      fetchIngestionStatus().then(setStatus),
    ])
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchIngestionLogs({ page: logPage, per_page: 20 })
      .then(setLogs)
      .catch(console.error);
  }, [logPage]);

  // Auto-poll while any source is running or pending
  useEffect(() => {
    if (!polling) return;

    const id = setInterval(() => {
      fetchIngestionStatus()
        .then((data) => {
          setStatus(data);
          const active = data.some(
            (s) => s.status === 'running' || s.status === 'pending',
          );
          if (!active) {
            setPolling(false);
            // Refresh logs when all done
            fetchIngestionLogs({ page: 1, per_page: 20 })
              .then((l) => {
                setLogs(l);
                setLogPage(1);
              })
              .catch(console.error);
          }
        })
        .catch(console.error);
    }, 2000);

    return () => clearInterval(id);
  }, [polling]);

  const handleSaveSetting = async (key: string, value: number | string) => {
    try {
      await updateSetting(key, String(Number(value)));
      setSettings((s) => ({ ...s, [key]: Number(value) }));
      setMsg(`Saved ${key}`);
      setTimeout(() => setMsg(null), 2000);
    } catch (e) {
      setMsg(`Error: ${(e as Error).message}`);
    }
  };

  const handleToggleEnabled = async (src: string) => {
    const key = ENABLED_KEYS[src];
    const current = settings[key];
    // Default to enabled if not yet in settings
    const currentBool = current === undefined ? true : current !== false && current !== 'false';
    const next = !currentBool;
    try {
      await updateSetting(key, String(next));
      setSettings((s) => ({ ...s, [key]: next }));
    } catch (e) {
      setMsg(`Error: ${(e as Error).message}`);
    }
  };

  const handleTrigger = async (source: string) => {
    setTriggering(source);
    try {
      await triggerIngestion(source);
      setMsg(`Triggered ${source} ingestion`);
      setTimeout(() => setMsg(null), 3000);
      // Immediately refresh status, then start polling
      fetchIngestionStatus().then(setStatus).catch(console.error);
      setPolling(true);
    } catch (e) {
      setMsg(`Error: ${(e as Error).message}`);
    } finally {
      setTriggering(null);
    }
  };

  const handleCancel = async (source: string) => {
    setCancelling(source);
    try {
      await cancelIngestion(source);
      setMsg(`Cancelling ${source} ingestion...`);
      setTimeout(() => setMsg(null), 3000);
      fetchIngestionStatus().then(setStatus).catch(console.error);
    } catch (e) {
      setMsg(`Error: ${(e as Error).message}`);
    } finally {
      setCancelling(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 animate-pulse h-32"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
        Failed to load settings: {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {errorModal && (
        <ErrorModal message={errorModal} onClose={() => setErrorModal(null)} />
      )}

      {msg && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
          {msg}
        </div>
      )}

      {/* Schedule Intervals */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Schedule Intervals
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {SOURCES.map((src) => {
            const intervalKey = SCHEDULE_KEYS[src];
            const enabledKey = ENABLED_KEYS[src];
            const enabledRaw = settings[enabledKey];
            const isEnabled =
              enabledRaw === undefined
                ? true
                : enabledRaw !== false && enabledRaw !== 'false';

            return (
              <div key={src}>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-gray-700">
                    {src.toUpperCase()} (hours)
                  </label>
                  {/* Enable/Disable toggle */}
                  <button
                    onClick={() => handleToggleEnabled(src)}
                    title={isEnabled ? 'Disable scheduled ingestion' : 'Enable scheduled ingestion'}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                      isEnabled ? 'bg-green-500' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform ${
                        isEnabled ? 'translate-x-4' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="1"
                    value={settings[intervalKey] ?? ''}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, [intervalKey]: e.target.value }))
                    }
                    className="w-full rounded-md border-gray-300 shadow-sm text-sm focus:border-gray-500 focus:ring-gray-500"
                  />
                  <button
                    onClick={() => handleSaveSetting(intervalKey, settings[intervalKey])}
                    className="px-3 py-1.5 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-800 transition-colors"
                  >
                    Save
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Manual Triggers */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Manual Ingestion
        </h2>
        <div className="flex flex-wrap gap-3">
          {SOURCES.map((src) => {
            const isActive = status.some(
              (s) => s.source === src && (s.status === 'running' || s.status === 'pending'),
            );
            return (
              <button
                key={src}
                disabled={triggering !== null || cancelling !== null}
                onClick={() => (isActive ? handleCancel(src) : handleTrigger(src))}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors disabled:opacity-50 ${
                  isActive
                    ? 'bg-red-50 border border-red-300 text-red-700 hover:bg-red-100'
                    : 'bg-white border border-gray-300 hover:bg-gray-50'
                }`}
              >
                {cancelling === src
                  ? 'Cancelling...'
                  : isActive
                  ? `Cancel ${src.toUpperCase()}`
                  : `Run ${src.toUpperCase()}`}
              </button>
            );
          })}
          {status.some((s) => s.status === 'running' || s.status === 'pending') ? (
            <button
              disabled={cancelling !== null}
              onClick={() => handleCancel('all')}
              className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {cancelling === 'all' ? 'Cancelling...' : 'Cancel All'}
            </button>
          ) : (
            <button
              disabled={triggering !== null}
              onClick={() => handleTrigger('all')}
              className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              {triggering === 'all' ? 'Running...' : 'Run All'}
            </button>
          )}
        </div>
      </div>

      {/* Latest Status */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Latest Ingestion Status
          </h2>
          <button
            onClick={() =>
              fetchIngestionStatus().then(setStatus).catch(console.error)
            }
            className="text-sm text-gray-500 hover:text-gray-900"
          >
            Refresh
          </button>
        </div>
        {status.length === 0 ? (
          <p className="text-sm text-gray-400">
            No ingestion runs yet. Trigger one above.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-gray-200 text-xs text-gray-500 uppercase">
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Started</th>
                  <th className="px-3 py-2">Finished</th>
                  <th className="px-3 py-2 text-right">Processed</th>
                  <th className="px-3 py-2 text-right">Created</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {status.map((s) => (
                  <tr key={s.source} className="border-b border-gray-100">
                    <td className="px-3 py-2 font-medium">{s.source.toUpperCase()}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={s.status} />
                      {s.status === 'running' && s.progress != null && (
                        <ProgressBar progress={s.progress} />
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-500">{fmtDt(s.started_at)}</td>
                    <td className="px-3 py-2 text-gray-500">{fmtDt(s.finished_at)}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {s.records_processed?.toLocaleString() ?? '\u2014'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {s.records_created?.toLocaleString() ?? '\u2014'}
                    </td>
                    <td className="px-3 py-2">
                      {(s.status === 'running' || s.status === 'pending') && (
                        <button
                          disabled={cancelling !== null}
                          onClick={() => handleCancel(s.source)}
                          className="px-2 py-0.5 text-xs font-medium rounded border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
                        >
                          {cancelling === s.source ? '…' : 'Cancel'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Ingestion Logs */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Ingestion Logs
        </h2>
        {logs.items.length === 0 ? (
          <p className="text-sm text-gray-400">No logs yet.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-gray-200 text-xs text-gray-500 uppercase">
                    <th className="px-3 py-2">Source</th>
                    <th className="px-3 py-2">Trigger</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Started</th>
                    <th className="px-3 py-2 text-right">Processed</th>
                    <th className="px-3 py-2">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.items.map((log) => (
                    <tr key={log.id} className="border-b border-gray-100">
                      <td className="px-3 py-2 font-medium">
                        {log.source.toUpperCase()}
                      </td>
                      <td className="px-3 py-2 text-gray-500">
                        {log.trigger_type}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={log.status} />
                      </td>
                      <td className="px-3 py-2 text-gray-500">
                        {fmtDt(log.started_at)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {log.records_processed?.toLocaleString() ?? '\u2014'}
                      </td>
                      <td className="px-3 py-2 max-w-xs">
                        {log.error_message ? (
                          <button
                            onClick={() => setErrorModal(log.error_message!)}
                            className="text-red-600 text-xs truncate block max-w-xs text-left hover:underline cursor-pointer"
                            title="Click to view full error"
                          >
                            {log.error_message}
                          </button>
                        ) : (
                          <span className="text-gray-400">&mdash;</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            <div className="flex justify-between items-center mt-3 text-sm text-gray-500">
              <span>{logs.total} total log{logs.total !== 1 ? 's' : ''}</span>
              <div className="flex gap-2">
                <button
                  disabled={logPage <= 1}
                  onClick={() => setLogPage((p) => p - 1)}
                  className="px-2 py-1 border border-gray-300 rounded disabled:opacity-40"
                >
                  Prev
                </button>
                <span className="px-2 py-1">Page {logPage}</span>
                <button
                  disabled={logPage * 20 >= logs.total}
                  onClick={() => setLogPage((p) => p + 1)}
                  className="px-2 py-1 border border-gray-300 rounded disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
