import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ColumnConfig,
  EligibleColumn,
  ScoreDistribution,
  ScoringProfile,
  fetchColumnValues,
  fetchEligibleColumns,
  fetchScoreDistribution,
  fetchScoringProfile,
  resetScoringProfile,
  runScoring,
  saveScoringProfile,
} from '../api/client';

import { getErrorMessage } from '../lib/utils';
import AddMetricButton from './scoring/AddMetricButton';
import ConfidenceLineChart from './scoring/ConfidenceLineChart';
import MetricCard from './scoring/MetricCard';
import MetricEditModal from './scoring/MetricEditModal';
import ScoreLineChart from './scoring/ScoreLineChart';
import { HorizontalBar, PRIORITY_COLORS } from './scoring/helpers';

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ScoringPanel() {
  const [profile, setProfile] = useState<ScoringProfile | null>(null);
  const [distribution, setDistribution] = useState<ScoreDistribution | null>(null);
  const [eligibleColumns, setEligibleColumns] = useState<Record<string, EligibleColumn> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [computing, setComputing] = useState(false);
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const [lastComputeMs, setLastComputeMs] = useState<number | null>(null);
  const computeStartRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingColumn, setEditingColumn] = useState<string | null>(null);
  // Cache of distinct values per categorical column (fetched lazily)
  const [colValues, setColValues] = useState<Record<string, string[]>>({});

  // Clean up the elapsed-time timer if the component unmounts mid-computation
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    Promise.all([
      fetchScoringProfile(),
      fetchScoreDistribution(),
      fetchEligibleColumns(),
    ])
      .then(([p, d, ec]) => {
        setProfile(p);
        setDistribution(d);
        setEligibleColumns(ec);
      })
      .catch((e) => setError(getErrorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  // ---------------------------------------------------------------------------
  // Column value cache
  // ---------------------------------------------------------------------------

  const ensureColumnValues = async (col: string) => {
    if (colValues[col] !== undefined) return;
    try {
      const res = await fetchColumnValues(col);
      setColValues((prev) => ({ ...prev, [col]: res.values }));
    } catch {
      setColValues((prev) => ({ ...prev, [col]: [] }));
    }
  };

  // ---------------------------------------------------------------------------
  // Profile mutations
  // ---------------------------------------------------------------------------

  const updateColumn = (col: string, patch: Partial<ColumnConfig>) => {
    setProfile((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        columns: { ...prev.columns, [col]: { ...prev.columns[col], ...patch } },
      };
    });
  };

  const updateThreshold = (key: string, value: number) => {
    setProfile((prev) => {
      if (!prev) return prev;
      return { ...prev, thresholds: { ...prev.thresholds, [key]: value } };
    });
  };

  const addMetric = (col: string, config: ColumnConfig) => {
    setProfile((prev) => {
      if (!prev) return prev;
      return { ...prev, columns: { ...prev.columns, [col]: config } };
    });
    setEditingColumn(col);
  };

  const removeMetric = (col: string) => {
    setProfile((prev) => {
      if (!prev) return prev;
      const { [col]: _removed, ...rest } = prev.columns;
      return { ...prev, columns: rest };
    });
  };

  // Fallback chain mutations for the editing column
  const moveFallback = (col: string, fbIdx: number, direction: -1 | 1) => {
    setProfile((prev) => {
      if (!prev) return prev;
      const cfg = prev.columns[col];
      const fbs = [...(cfg.fallbacks ?? [])];
      const newIdx = fbIdx + direction;
      if (newIdx < 0 || newIdx >= fbs.length) return prev;
      [fbs[fbIdx], fbs[newIdx]] = [fbs[newIdx], fbs[fbIdx]];
      return { ...prev, columns: { ...prev.columns, [col]: { ...cfg, fallbacks: fbs } } };
    });
  };

  const removeFallback = (col: string, fbCol: string) => {
    setProfile((prev) => {
      if (!prev) return prev;
      const cfg = prev.columns[col];
      return {
        ...prev,
        columns: {
          ...prev.columns,
          [col]: { ...cfg, fallbacks: (cfg.fallbacks ?? []).filter((f) => f !== fbCol) },
        },
      };
    });
  };

  const addFallback = (col: string, fbCol: string) => {
    setProfile((prev) => {
      if (!prev) return prev;
      const cfg = prev.columns[col];
      return {
        ...prev,
        columns: {
          ...prev.columns,
          [col]: { ...cfg, fallbacks: [...(cfg.fallbacks ?? []), fbCol] },
        },
      };
    });
  };

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      await saveScoringProfile(profile);
      setMsg('Profile saved');
      setTimeout(() => setMsg(null), 2000);
    } catch (e) {
      setMsg(`Error: ${getErrorMessage(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCompute = async () => {
    if (!profile) return;
    setComputing(true);
    setElapsedMs(0);
    computeStartRef.current = performance.now();
    timerRef.current = setInterval(() => {
      setElapsedMs(performance.now() - (computeStartRef.current ?? performance.now()));
    }, 100);
    try {
      // Save first, then compute
      await saveScoringProfile(profile);
      const res = await runScoring();
      const elapsed = performance.now() - (computeStartRef.current ?? performance.now());
      setLastComputeMs(elapsed);
      setMsg(`Scored ${res.rows_updated.toLocaleString()} CVEs`);
      setTimeout(() => setMsg(null), 3000);
      const d = await fetchScoreDistribution();
      setDistribution(d);
    } catch (e) {
      setMsg(`Error: ${getErrorMessage(e)}`);
    } finally {
      if (timerRef.current) clearInterval(timerRef.current);
      setComputing(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Reset to default profile? This will overwrite your current configuration.')) return;
    setSaving(true);
    try {
      const p = await resetScoringProfile();
      setProfile(p);
      setMsg('Profile reset to defaults');
      setTimeout(() => setMsg(null), 2000);
    } catch (e) {
      setMsg(`Error: ${getErrorMessage(e)}`);
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Derived state — computed once per profile change, before early returns
  // ---------------------------------------------------------------------------

  const { allFallbacks, topLevelCols, totalWeight, weightWarning } = useMemo(() => {
    if (!profile) return { allFallbacks: new Set<string>(), topLevelCols: [] as string[], totalWeight: 0, weightWarning: false };
    const allFallbacks = new Set<string>();
    Object.values(profile.columns).forEach((cfg) => {
      cfg.fallbacks?.forEach((f) => allFallbacks.add(f));
    });
    const topLevelCols = Object.keys(profile.columns).filter((col) => !allFallbacks.has(col));
    const totalWeight = topLevelCols
      .filter((col) => profile.columns[col].enabled)
      .reduce((s, col) => s + profile.columns[col].weight, 0);
    const weightWarning = Math.abs(totalWeight - 100) > 0.5;
    return { allFallbacks, topLevelCols, totalWeight, weightWarning };
  }, [profile]);

  // ---------------------------------------------------------------------------
  // Loading / error states
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="space-y-6">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 animate-pulse h-32" />
        ))}
      </div>
    );
  }

  if (error || !profile || !eligibleColumns) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
        Failed to load scoring profile: {error}
      </div>
    );
  }

  // Currently editing
  const editingConfig = editingColumn ? profile.columns[editingColumn] : null;
  const editingMeta = editingColumn ? eligibleColumns[editingColumn] : null;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {msg && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
          {msg}
        </div>
      )}

      {/* ── Metric Grid ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Scoring Metrics</h2>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">Total weight:</span>
            <span className={`font-mono font-medium ${weightWarning ? 'text-amber-600' : 'text-gray-900'}`}>
              {totalWeight.toFixed(1)}%
            </span>
            {weightWarning && (
              <span className="text-xs text-amber-600">(will be normalised)</span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {topLevelCols.map((col) => {
            const cfg = profile.columns[col];
            const meta = eligibleColumns[col];
            if (!meta) return null;
            return (
              <MetricCard
                key={col}
                columnName={col}
                config={cfg}
                meta={meta}
                onClick={() => setEditingColumn(col)}
              />
            );
          })}

          {/* Add metric button — always last in grid */}
          <AddMetricButton
            eligibleColumns={eligibleColumns}
            profile={profile}
            allFallbacks={allFallbacks}
            onAdd={addMetric}
          />
        </div>
      </div>

      {/* ── Priority Thresholds ─────────────────────────────────────────── */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Priority Thresholds</h2>
        <p className="text-sm text-gray-500 mb-4">
          Minimum score to reach each priority level. V0 is highest severity.
        </p>
        <div className="flex flex-wrap gap-4">
          {['V0', 'V1', 'V2', 'V3'].map((level) => (
            <label key={level} className="flex items-center gap-2">
              <span
                className={`inline-block px-2 py-0.5 text-xs font-semibold rounded ${PRIORITY_COLORS[level]?.badge ?? ''}`}
              >
                {level}
              </span>
              <span className="text-sm text-gray-500">≥</span>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={profile.thresholds[level] ?? ''}
                onChange={(e) => updateThreshold(level, Number(e.target.value))}
                className="w-16 rounded border-gray-300 text-sm text-right focus:border-gray-500 focus:ring-gray-500"
              />
            </label>
          ))}
        </div>
      </div>

      {/* ── Action bar ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
        <div className="flex flex-wrap gap-3 items-center">
          <button
            disabled={saving || computing}
            onClick={handleSave}
            className="px-4 py-2 bg-white border border-gray-300 text-sm font-medium rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save Profile'}
          </button>
          <button
            disabled={saving || computing}
            onClick={handleCompute}
            className="relative px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-800 disabled:opacity-50 transition-colors min-w-[160px]"
          >
            {computing ? (
              <span className="flex items-center gap-2 justify-center">
                <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span className="font-mono tabular-nums">
                  {(elapsedMs / 1000).toFixed(1)}s
                </span>
              </span>
            ) : (
              'Compute Scores'
            )}
          </button>
          {!computing && lastComputeMs !== null && (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 text-xs font-mono rounded-md">
              <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="10" />
                <path strokeLinecap="round" d="M12 6v6l3 3" />
              </svg>
              {(lastComputeMs / 1000).toFixed(2)}s
            </span>
          )}
          <span className="text-xs text-gray-400">
            Saves the current profile, then scores all CVEs in the database.
          </span>
          <button
            disabled={saving || computing}
            onClick={handleReset}
            className="ml-auto px-3 py-1.5 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md disabled:opacity-50 transition-colors"
          >
            Reset to defaults
          </button>
        </div>
      </div>

      {/* ── Distribution Charts ─────────────────────────────────────────── */}
      {distribution && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Score Distribution</h2>
            <span className="text-sm text-gray-500">
              {distribution.scored_count.toLocaleString()} scored
              {distribution.unscored_count > 0 && (
                <> · {distribution.unscored_count.toLocaleString()} unscored</>
              )}
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Priority counts */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">Priority Levels</h3>
              <div className="space-y-2">
                {['V0', 'V1', 'V2', 'V3'].map((level) => {
                  const count = distribution.priority_counts[level] ?? 0;
                  const total = Object.values(distribution.priority_counts).reduce((a, b) => a + b, 0);
                  return (
                    <div key={level} className="space-y-1">
                      <div className="flex justify-between text-xs text-gray-500">
                        <span className={`font-semibold ${PRIORITY_COLORS[level]?.badge.split(' ')[1] ?? ''}`}>
                          {level}
                        </span>
                        <span>{total > 0 ? ((count / total) * 100).toFixed(1) : '0.0'}%</span>
                      </div>
                      <HorizontalBar
                        value={count}
                        max={Math.max(...Object.values(distribution.priority_counts), 1)}
                        color={PRIORITY_COLORS[level]?.bar ?? 'bg-gray-400'}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Score distribution */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">Score Distribution</h3>
              {distribution.score_histogram.length === 0 ? (
                <p className="text-xs text-gray-400">No scored CVEs yet.</p>
              ) : (
                <ScoreLineChart
                  data={distribution.score_histogram}
                  thresholds={profile.thresholds}
                />
              )}
            </div>

            {/* Confidence distribution */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">Confidence Distribution</h3>
              {distribution.confidence_histogram.length === 0 ? (
                <p className="text-xs text-gray-400">No scored CVEs yet.</p>
              ) : (
                <ConfidenceLineChart data={distribution.confidence_histogram} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Metric Edit Modal ───────────────────────────────────────────── */}
      {editingColumn && editingConfig && editingMeta && (
        <MetricEditModal
          columnName={editingColumn}
          config={editingConfig}
          meta={editingMeta}
          eligibleColumns={eligibleColumns}
          profile={profile}
          colValues={colValues}
          allFallbacks={allFallbacks}
          onUpdate={(patch) => updateColumn(editingColumn, patch)}
          onRemove={() => removeMetric(editingColumn)}
          onClose={() => setEditingColumn(null)}
          onMoveFallback={(fbIdx, dir) => moveFallback(editingColumn, fbIdx, dir)}
          onRemoveFallback={(fbCol) => removeFallback(editingColumn, fbCol)}
          onAddFallback={(fbCol) => addFallback(editingColumn, fbCol)}
          onEnsureColumnValues={ensureColumnValues}
        />
      )}
    </div>
  );
}
