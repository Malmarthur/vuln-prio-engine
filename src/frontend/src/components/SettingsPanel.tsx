import { useEffect, useRef, useState } from 'react';
import { getErrorMessage } from '../lib/utils';
import Pagination from './Pagination';
import StatusTag, { type StatusTone } from './StatusTag';
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

const STATUS_TONES: Record<string, StatusTone> = {
  success: 'positive',
  failed: 'error',
  running: 'pending',
  pending: 'pending',
  cancelled: 'muted',
  cancelling: 'warning',
};

function StatusBadge({ status }: StatusBadgeProps) {
  return <StatusTag tone={STATUS_TONES[status] ?? 'neutral'}>{status}</StatusTag>;
}

interface ProgressBarProps {
  progress: number;
}

function ProgressBar({ progress }: ProgressBarProps) {
  return (
    <div className="mt-1 flex items-center gap-1.5">
      <div className="h-1.5 flex-1 bg-gray-200">
        <div
          className="h-1.5 bg-accent-600 transition-all duration-500"
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>
      <span className="w-8 text-right font-mono text-[11px] text-gray-500">{Math.round(progress)}%</span>
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/40"
      onClick={onClose}
    >
      <div
        className="mx-4 flex max-h-[80vh] w-full max-w-2xl flex-col border border-gray-300 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-header">
          <h3 className="panel-title">Error details</h3>
          <button
            onClick={onClose}
            className="btn-ghost btn-sm px-2 text-base leading-none"
            aria-label="Close"
          >
            &times;
          </button>
        </div>
        <pre className="overflow-auto whitespace-pre-wrap p-4 font-mono text-xs text-red-800">
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
  // Prevents concurrent in-flight polling requests when a tick is slow
  const pollingInFlight = useRef(false);

  // Load everything on mount
  useEffect(() => {
    Promise.all([
      fetchSettings().then(setSettings),
      fetchIngestionStatus().then(setStatus),
    ])
      .catch((e) => setError(getErrorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchIngestionLogs({ page: logPage, per_page: 20 })
      .then(setLogs)
      .catch(console.error);
  }, [logPage]);

  // Auto-poll while any source is running or pending.
  // Guard flag prevents concurrent in-flight requests if a tick takes > 2s.
  useEffect(() => {
    if (!polling) return;

    const id = setInterval(async () => {
      if (pollingInFlight.current) return;
      pollingInFlight.current = true;
      try {
        const data = await fetchIngestionStatus();
        setStatus(data);
        const active = data.some(
          (s) => s.status === 'running' || s.status === 'pending',
        );
        if (!active) {
          setPolling(false);
          try {
            const l = await fetchIngestionLogs({ page: 1, per_page: 20 });
            setLogs(l);
            setLogPage(1);
          } catch {
            // Non-critical — log list will refresh on next manual action
          }
        }
      } catch {
        // Network error during polling — will retry on next tick
      } finally {
        pollingInFlight.current = false;
      }
    }, 2000);

    return () => {
      clearInterval(id);
      pollingInFlight.current = false;
    };
  }, [polling]);

  const handleSaveSetting = async (key: string, value: number | string) => {
    try {
      await updateSetting(key, String(Number(value)));
      setSettings((s) => ({ ...s, [key]: Number(value) }));
      setMsg(`Saved ${key}`);
      setTimeout(() => setMsg(null), 2000);
    } catch (e) {
      setMsg(`Error: ${getErrorMessage(e)}`);
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
      setMsg(`Error: ${getErrorMessage(e)}`);
    }
  };

  const refreshLogs = () =>
    fetchIngestionLogs({ page: 1, per_page: 20 })
      .then((l) => { setLogs(l); setLogPage(1); })
      .catch(console.error);

  const handleTrigger = async (source: string) => {
    setTriggering(source);
    try {
      await triggerIngestion(source);
      setMsg(`Triggered ${source} ingestion`);
      setTimeout(() => setMsg(null), 3000);
      // Immediately refresh both status and logs, then start polling
      fetchIngestionStatus().then(setStatus).catch(console.error);
      refreshLogs();
      setPolling(true);
    } catch (e) {
      setMsg(`Error: ${getErrorMessage(e)}`);
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
    } catch (e) {
      // 404 means the task already ended but the DB wasn't updated (stale log);
      // silently refresh status instead of showing a confusing error.
      const msg = getErrorMessage(e);
      if (!msg.includes('404') && !msg.toLowerCase().includes('no running')) {
        setMsg(`Error: ${msg}`);
      }
    } finally {
      fetchIngestionStatus().then(setStatus).catch(console.error);
      refreshLogs();
      setCancelling(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="panel h-56 animate-pulse" />
        <div className="panel h-72 animate-pulse" />
      </div>
    );
  }

  if (error) {
    return <div className="notice-error">Failed to load settings: {error}</div>;
  }

  const anyActive = status.some((s) => s.status === 'running' || s.status === 'pending');

  return (
    <div className="space-y-4">
      {errorModal && (
        <ErrorModal message={errorModal} onClose={() => setErrorModal(null)} />
      )}

      {msg && <div className="notice-info" role="status">{msg}</div>}

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Data sources</h2>
            <p className="panel-subtitle">Scheduled ingestion, latest run and manual controls for each vulnerability source.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => fetchIngestionStatus().then(setStatus).catch(console.error)} className="btn-secondary btn-sm">
              Refresh
            </button>
            {anyActive ? (
              <button disabled={cancelling !== null} onClick={() => handleCancel('all')} className="btn-danger btn-sm">
                {cancelling === 'all' ? 'Cancelling…' : 'Cancel all'}
              </button>
            ) : (
              <button disabled={triggering !== null} onClick={() => handleTrigger('all')} className="btn-primary btn-sm">
                {triggering === 'all' ? 'Starting…' : 'Run all sources'}
              </button>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th>Source</th>
                <th>Schedule</th>
                <th>Last run</th>
                <th>Started</th>
                <th>Finished</th>
                <th className="!text-right">Processed</th>
                <th className="!text-right">Created</th>
                <th className="!text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {SOURCES.map((src) => {
                const intervalKey = SCHEDULE_KEYS[src];
                const enabledRaw = settings[ENABLED_KEYS[src]];
                const isEnabled = enabledRaw === undefined ? true : enabledRaw !== false && enabledRaw !== 'false';
                const last = status.find((item) => item.source === src);
                const isActive = last?.status === 'running' || last?.status === 'pending';
                return (
                  <tr key={src} className="align-middle">
                    <td className="font-mono font-semibold text-gray-900">{src.toUpperCase()}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleEnabled(src)}
                          role="switch"
                          aria-checked={isEnabled}
                          aria-label={`Scheduled ${src.toUpperCase()} ingestion`}
                          title={isEnabled ? 'Disable scheduled ingestion' : 'Enable scheduled ingestion'}
                          className={`relative inline-flex h-4 w-7 shrink-0 items-center border transition-colors ${isEnabled ? 'border-accent-700 bg-accent-700' : 'border-gray-400 bg-gray-200'}`}
                        >
                          <span className={`inline-block h-2.5 w-2.5 bg-white transition-transform ${isEnabled ? 'translate-x-[14px]' : 'translate-x-0.5'}`} />
                        </button>
                        <span className="text-xs text-gray-500">every</span>
                        <input
                          type="number"
                          min="1"
                          aria-label={`${src.toUpperCase()} interval in hours`}
                          value={settings[intervalKey] != null ? String(settings[intervalKey]) : ''}
                          onChange={(e) => setSettings((s) => ({ ...s, [intervalKey]: e.target.value }))}
                          className="field w-16 py-0.5 text-right font-mono"
                        />
                        <span className="text-xs text-gray-500">h</span>
                        <button onClick={() => handleSaveSetting(intervalKey, settings[intervalKey] as string | number)} className="btn-secondary btn-sm">
                          Save
                        </button>
                      </div>
                    </td>
                    <td>
                      {last ? <StatusBadge status={last.status} /> : <span className="text-gray-400">Never run</span>}
                      {last?.status === 'running' && last.progress != null && <ProgressBar progress={last.progress} />}
                    </td>
                    <td className="whitespace-nowrap font-mono text-xs text-gray-600">{fmtDt(last?.started_at)}</td>
                    <td className="whitespace-nowrap font-mono text-xs text-gray-600">{fmtDt(last?.finished_at)}</td>
                    <td className="text-right font-mono">{last?.records_processed?.toLocaleString() ?? '\u2014'}</td>
                    <td className="text-right font-mono">{last?.records_created?.toLocaleString() ?? '\u2014'}</td>
                    <td className="text-right">
                      <button
                        disabled={triggering !== null || cancelling !== null}
                        onClick={() => (isActive ? handleCancel(src) : handleTrigger(src))}
                        className={isActive ? 'btn-danger btn-sm' : 'btn-secondary btn-sm'}
                      >
                        {cancelling === src ? 'Cancelling…' : isActive ? 'Cancel' : 'Run now'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Ingestion log</h2>
            <p className="panel-subtitle">Every scheduled and manual run, most recent first.</p>
          </div>
        </div>
        {logs.items.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-gray-500">No ingestion runs yet.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="data-table w-full">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Trigger</th>
                    <th>Status</th>
                    <th>Started</th>
                    <th className="!text-right">Processed</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.items.map((log) => (
                    <tr key={log.id}>
                      <td className="font-mono font-semibold text-gray-900">{log.source.toUpperCase()}</td>
                      <td className="text-gray-600">{log.trigger_type}</td>
                      <td><StatusBadge status={log.status} /></td>
                      <td className="whitespace-nowrap font-mono text-xs text-gray-600">{fmtDt(log.started_at)}</td>
                      <td className="text-right font-mono">{log.records_processed?.toLocaleString() ?? '\u2014'}</td>
                      <td className="max-w-xs">
                        {log.error_message ? (
                          <button
                            onClick={() => setErrorModal(log.error_message!)}
                            className="block max-w-xs truncate text-left text-xs text-red-700 hover:underline"
                            title="View full error"
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
            <Pagination page={logPage} perPage={20} total={logs.total} onChange={setLogPage} />
          </>
        )}
      </section>
    </div>
  );
}
