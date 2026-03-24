import { useEffect, useState } from 'react';
import {
  ColumnConfig,
  ScoreDistribution,
  ScoringProfile,
  fetchColumnValues,
  fetchScoreDistribution,
  fetchScoringProfile,
  runScoring,
  saveScoringProfile,
} from '../api/client';

// ---------------------------------------------------------------------------
// Column metadata
// ---------------------------------------------------------------------------

interface ColMeta {
  label: string;
  type: 'numeric' | 'boolean' | 'categorical';
  range?: [number, number];
}

const COLUMN_META: Record<string, ColMeta> = {
  cvss_v31_score:     { label: 'CVSS v3.1 Score',     type: 'numeric',     range: [0, 10] },
  cvss_v31_severity:  { label: 'CVSS v3.1 Severity',  type: 'categorical' },
  cvss_v30_score:     { label: 'CVSS v3.0 Score',     type: 'numeric',     range: [0, 10] },
  cvss_v30_severity:  { label: 'CVSS v3.0 Severity',  type: 'categorical' },
  cvss_v40_score:     { label: 'CVSS v4.0 Score',     type: 'numeric',     range: [0, 10] },
  cvss_v40_severity:  { label: 'CVSS v4.0 Severity',  type: 'categorical' },
  cvss_v2_score:      { label: 'CVSS v2 Score',       type: 'numeric',     range: [0, 10] },
  cvss_v2_severity:   { label: 'CVSS v2 Severity',    type: 'categorical' },
  epss_score:         { label: 'EPSS Score',          type: 'numeric',     range: [0, 1] },
  epss_percentile:    { label: 'EPSS Percentile',     type: 'numeric',     range: [0, 1] },
  kev_known_exploited:{ label: 'KEV Exploited',       type: 'boolean' },
  kev_ransomware_use: { label: 'KEV Ransomware',      type: 'boolean' },
  euvd_exploitation:  { label: 'EUVD Exploitation',   type: 'categorical' },
};

const COLUMN_ORDER = [
  'cvss_v31_score', 'cvss_v31_severity',
  'epss_score', 'epss_percentile',
  'kev_known_exploited', 'kev_ransomware_use',
  'euvd_exploitation',
  'cvss_v30_score', 'cvss_v30_severity',
  'cvss_v40_score', 'cvss_v40_severity',
  'cvss_v2_score', 'cvss_v2_severity',
];

const PRIORITY_COLORS: Record<string, { bar: string; badge: string }> = {
  V0: { bar: 'bg-red-500',    badge: 'bg-red-100 text-red-700' },
  V1: { bar: 'bg-orange-500', badge: 'bg-orange-100 text-orange-700' },
  V2: { bar: 'bg-yellow-400', badge: 'bg-yellow-100 text-yellow-800' },
  V3: { bar: 'bg-green-500',  badge: 'bg-green-100 text-green-700' },
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    numeric: 'bg-blue-100 text-blue-700',
    boolean: 'bg-purple-100 text-purple-700',
    categorical: 'bg-amber-100 text-amber-700',
  };
  return (
    <span className={`inline-block px-1.5 py-0.5 text-xs rounded ${colors[type] ?? 'bg-gray-100 text-gray-600'}`}>
      {type}
    </span>
  );
}

function HorizontalBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded h-4 overflow-hidden">
        <div className={`h-4 rounded ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-16 text-right font-mono">
        {value.toLocaleString()}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ScoringPanel() {
  const [profile, setProfile] = useState<ScoringProfile | null>(null);
  const [distribution, setDistribution] = useState<ScoreDistribution | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [computing, setComputing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Cache of distinct values per categorical column (fetched lazily)
  const [colValues, setColValues] = useState<Record<string, string[]>>({});

  useEffect(() => {
    Promise.all([
      fetchScoringProfile(),
      fetchScoreDistribution(),
    ])
      .then(([p, d]) => {
        setProfile(p);
        setDistribution(d);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  // Fetch distinct values for a categorical column when it is first enabled
  const ensureColumnValues = async (col: string) => {
    if (colValues[col] !== undefined) return;
    try {
      const res = await fetchColumnValues(col);
      setColValues((prev) => ({ ...prev, [col]: res.values }));
    } catch {
      setColValues((prev) => ({ ...prev, [col]: [] }));
    }
  };

  const updateColumn = (col: string, patch: Partial<ColumnConfig>) => {
    setProfile((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        columns: {
          ...prev.columns,
          [col]: { ...prev.columns[col], ...patch },
        },
      };
    });
  };

  const toggleColumn = async (col: string) => {
    const cfg = profile?.columns[col];
    if (!cfg) return;
    const next = !cfg.enabled;
    updateColumn(col, { enabled: next });
    if (next && (cfg.type === 'categorical' || cfg.type === 'boolean')) {
      await ensureColumnValues(col);
    }
  };

  const updateThreshold = (key: string, value: number) => {
    setProfile((prev) => {
      if (!prev) return prev;
      return { ...prev, thresholds: { ...prev.thresholds, [key]: value } };
    });
  };

  const updateCategoryValue = (col: string, cat: string, val: number) => {
    setProfile((prev) => {
      if (!prev) return prev;
      const cfg = prev.columns[col];
      return {
        ...prev,
        columns: {
          ...prev.columns,
          [col]: { ...cfg, values: { ...(cfg.values ?? {}), [cat]: val } },
        },
      };
    });
  };

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      await saveScoringProfile(profile);
      setMsg('Profile saved');
      setTimeout(() => setMsg(null), 2000);
    } catch (e) {
      setMsg(`Error: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCompute = async () => {
    setComputing(true);
    try {
      const res = await runScoring();
      setMsg(`Scored ${res.rows_updated.toLocaleString()} CVEs`);
      setTimeout(() => setMsg(null), 3000);
      const d = await fetchScoreDistribution();
      setDistribution(d);
    } catch (e) {
      setMsg(`Error: ${(e as Error).message}`);
    } finally {
      setComputing(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render helpers (loaded state only)
  // ---------------------------------------------------------------------------

  const totalWeight = profile
    ? Object.values(profile.columns)
        .filter((c) => c.enabled)
        .reduce((s, c) => s + c.weight, 0)
    : 0;

  const weightWarning = profile && Math.abs(totalWeight - 100) > 0.5;

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

  if (error || !profile) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
        Failed to load scoring profile: {error}
      </div>
    );
  }

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

      {/* ── Column Configuration ───────────────────────────────────────── */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Column Configuration</h2>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">Total weight:</span>
            <span className={`font-mono font-medium ${weightWarning ? 'text-amber-600' : 'text-gray-900'}`}>
              {totalWeight.toFixed(1)}%
            </span>
            {weightWarning && (
              <span className="text-xs text-amber-600">(will be normalised to 100%)</span>
            )}
          </div>
        </div>

        <div className="space-y-3">
          {COLUMN_ORDER.map((col) => {
            const cfg = profile.columns[col];
            const meta = COLUMN_META[col];
            if (!cfg || !meta) return null;

            // Which values to show for boolean/categorical
            const cats: string[] =
              meta.type === 'boolean'
                ? ['true', 'false']
                : colValues[col] ?? Object.keys(cfg.values ?? {});

            return (
              <div
                key={col}
                className={`rounded-lg border p-3 transition-colors ${
                  cfg.enabled ? 'border-gray-300 bg-white' : 'border-gray-100 bg-gray-50'
                }`}
              >
                {/* Header row */}
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Toggle */}
                  <button
                    onClick={() => toggleColumn(col)}
                    title={cfg.enabled ? 'Disable' : 'Enable'}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
                      cfg.enabled ? 'bg-gray-900' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform ${
                        cfg.enabled ? 'translate-x-4' : 'translate-x-0.5'
                      }`}
                    />
                  </button>

                  <span className={`text-sm font-medium ${cfg.enabled ? 'text-gray-900' : 'text-gray-400'}`}>
                    {meta.label}
                  </span>
                  <TypeBadge type={meta.type} />

                  {meta.type === 'numeric' && meta.range && (
                    <span className="text-xs text-gray-400">range {meta.range[0]}–{meta.range[1]}</span>
                  )}

                  {/* Weight + Default — only when enabled */}
                  {cfg.enabled && (
                    <div className="ml-auto flex items-center gap-4 flex-wrap">
                      <label className="flex items-center gap-1.5 text-sm text-gray-600">
                        <span className="text-xs">Weight %</span>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          value={cfg.weight}
                          onChange={(e) => updateColumn(col, { weight: Number(e.target.value) })}
                          className="w-16 rounded border-gray-300 text-sm text-right focus:border-gray-500 focus:ring-gray-500"
                        />
                      </label>
                      <label className="flex items-center gap-1.5 text-sm text-gray-600">
                        <span className="text-xs">Default (null)</span>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          value={cfg.default_value}
                          onChange={(e) => updateColumn(col, { default_value: Number(e.target.value) })}
                          className="w-16 rounded border-gray-300 text-sm text-right focus:border-gray-500 focus:ring-gray-500"
                        />
                      </label>
                    </div>
                  )}
                </div>

                {/* Value mappings — boolean / categorical */}
                {cfg.enabled && meta.type !== 'numeric' && (
                  <div className="mt-3 pl-12">
                    {cats.length === 0 ? (
                      <p className="text-xs text-gray-400">
                        {meta.type === 'categorical'
                          ? 'No values found in database yet (ingest data first).'
                          : ''}
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-3">
                        {cats.map((cat) => (
                          <label key={cat} className="flex items-center gap-1.5 text-sm text-gray-600">
                            <span className="min-w-[4rem] font-mono text-xs">{cat}</span>
                            <span className="text-gray-400">=</span>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="1"
                              value={(cfg.values ?? {})[cat] ?? ''}
                              placeholder="0–100"
                              onChange={(e) => updateCategoryValue(col, cat, Number(e.target.value))}
                              className="w-16 rounded border-gray-300 text-sm text-right focus:border-gray-500 focus:ring-gray-500"
                            />
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Priority Thresholds ────────────────────────────────────────── */}
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

      {/* ── Action bar ────────────────────────────────────────────────── */}
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
            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            {computing ? 'Computing…' : 'Compute Scores'}
          </button>
          <span className="text-xs text-gray-400">
            Saves the current profile, then scores all CVEs in the database.
          </span>
        </div>
      </div>

      {/* ── Distribution Charts ───────────────────────────────────────── */}
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

            {/* Score histogram */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">Score Distribution</h3>
              {distribution.score_histogram.length === 0 ? (
                <p className="text-xs text-gray-400">No scored CVEs yet.</p>
              ) : (
                <div className="space-y-1">
                  {distribution.score_histogram.map((b) => (
                    <div key={b.bucket} className="space-y-0.5">
                      <div className="text-xs text-gray-400">{b.bucket}</div>
                      <HorizontalBar
                        value={b.count}
                        max={Math.max(...distribution.score_histogram.map((x) => x.count), 1)}
                        color="bg-gray-400"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Confidence histogram */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">Confidence Distribution</h3>
              {distribution.confidence_histogram.length === 0 ? (
                <p className="text-xs text-gray-400">No scored CVEs yet.</p>
              ) : (
                <div className="space-y-1">
                  {distribution.confidence_histogram.map((b) => (
                    <div key={b.bucket} className="space-y-0.5">
                      <div className="text-xs text-gray-400">{b.bucket}%</div>
                      <HorizontalBar
                        value={b.count}
                        max={Math.max(...distribution.confidence_histogram.map((x) => x.count), 1)}
                        color="bg-indigo-400"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
