import { useEffect, useState } from 'react';
import {
  ColumnConfig,
  ScoreDistribution,
  ScoringProfile,
  fetchColumnValues,
  fetchScoreDistribution,
  fetchScoringProfile,
  resetScoringProfile,
  runScoring,
  saveScoringProfile,
} from '../api/client';

// ---------------------------------------------------------------------------
// Column metadata
// ---------------------------------------------------------------------------

interface ColMeta {
  label: string;
  groupLabel?: string;  // shown as group header when this column has fallbacks
  type: 'numeric' | 'boolean' | 'categorical';
  range?: [number, number];
}

const COLUMN_META: Record<string, ColMeta> = {
  cvss_v40_score:     { label: 'CVSS v4.0 Score',     groupLabel: 'CVSS Score',    type: 'numeric',     range: [0, 10] },
  cvss_v31_score:     { label: 'CVSS v3.1 Score',                                  type: 'numeric',     range: [0, 10] },
  cvss_v30_score:     { label: 'CVSS v3.0 Score',                                  type: 'numeric',     range: [0, 10] },
  cvss_v2_score:      { label: 'CVSS v2 Score',                                    type: 'numeric',     range: [0, 10] },
  cvss_v40_severity:  { label: 'CVSS v4.0 Severity',  groupLabel: 'CVSS Severity', type: 'categorical' },
  cvss_v31_severity:  { label: 'CVSS v3.1 Severity',                               type: 'categorical' },
  cvss_v30_severity:  { label: 'CVSS v3.0 Severity',                               type: 'categorical' },
  cvss_v2_severity:   { label: 'CVSS v2 Severity',                                 type: 'categorical' },
  epss_score:         { label: 'EPSS Score',                                        type: 'numeric',     range: [0, 1] },
  epss_percentile:    { label: 'EPSS Percentile',                                  type: 'numeric',     range: [0, 1] },
  kev_known_exploited:{ label: 'KEV Exploited',                                    type: 'boolean' },
  kev_ransomware_use: { label: 'KEV Ransomware',                                   type: 'boolean' },
  euvd_exploitation:  { label: 'EUVD Exploitation',                                type: 'categorical' },
};

const COLUMN_ORDER = [
  'cvss_v40_score', 'cvss_v31_score', 'cvss_v30_score', 'cvss_v2_score',
  'cvss_v40_severity', 'cvss_v31_severity', 'cvss_v30_severity', 'cvss_v2_severity',
  'epss_score', 'epss_percentile',
  'kev_known_exploited', 'kev_ransomware_use',
  'euvd_exploitation',
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
// Chart helpers
// ---------------------------------------------------------------------------

/** Fills all 10 bucket positions (0–10, 10–20, …, 90–100) with their counts.
 *  Missing buckets get count = 0. Returns points at bucket centers. */
function fillBuckets(data: Array<{ bucket: string; count: number }>): Array<{ x: number; count: number }> {
  const map = new Map<number, number>();
  data.forEach((d) => {
    const lo = parseInt(d.bucket.split('-')[0], 10);
    map.set(lo, d.count);
  });
  return Array.from({ length: 10 }, (_, i) => ({
    x: i * 10 + 5,          // centre du bucket (5, 15, …, 95)
    count: map.get(i * 10) ?? 0,
  }));
}

/** Score distribution — colored by priority zone. */
function ScoreLineChart({
  data,
  thresholds,
}: {
  data: Array<{ bucket: string; count: number }>;
  thresholds: Record<string, number>;
}) {
  const W = 320, H = 110;
  const pL = 36, pR = 8, pT = 8, pB = 18;
  const iW = W - pL - pR;
  const iH = H - pT - pB;
  const bottomY = pT + iH;

  const pts = fillBuckets(data);
  const maxC = Math.max(...pts.map((p) => p.count), 1);

  const sx = (x: number) => pL + (x / 100) * iW;
  const sy = (c: number) => pT + iH - (c / maxC) * iH;

  const ptStr = pts.map((p) => `${sx(p.x)},${sy(p.count)}`).join(' ');
  const areaStr = `${sx(pts[0].x)},${bottomY} ${ptStr} ${sx(pts[pts.length - 1].x)},${bottomY}`;

  const t = thresholds;
  const zones = [
    { id: 'v3', lo: 0,             hi: t['V2'] ?? 26, stroke: '#16a34a', fill: '#22c55e' },
    { id: 'v2', lo: t['V2'] ?? 26, hi: t['V1'] ?? 51, stroke: '#ca8a04', fill: '#eab308' },
    { id: 'v1', lo: t['V1'] ?? 51, hi: t['V0'] ?? 76, stroke: '#ea580c', fill: '#f97316' },
    { id: 'v0', lo: t['V0'] ?? 76, hi: 100,            stroke: '#dc2626', fill: '#ef4444' },
  ];

  const getZone = (x: number) =>
    zones.find((z) => x >= z.lo && x < z.hi) ?? zones[zones.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible">
      <defs>
        {zones.map((z) => (
          <clipPath key={z.id} id={`csc-${z.id}`}>
            <rect x={sx(z.lo)} y={0} width={Math.max(0, sx(z.hi) - sx(z.lo))} height={H} />
          </clipPath>
        ))}
      </defs>

      {/* Zone background bands */}
      {zones.map((z) => (
        <rect key={z.id} x={sx(z.lo)} y={pT}
          width={Math.max(0, sx(z.hi) - sx(z.lo))} height={iH}
          fill={z.fill} opacity={0.07} />
      ))}

      {/* Horizontal grid lines */}
      {[0.25, 0.5, 0.75].map((r) => (
        <line key={r} x1={pL} y1={sy(maxC * r)} x2={W - pR} y2={sy(maxC * r)}
          stroke="#e5e7eb" strokeWidth={1} />
      ))}

      {/* Threshold vertical dashes */}
      {['V0', 'V1', 'V2'].map((level) => {
        const tv = t[level];
        if (tv == null) return null;
        return (
          <line key={level} x1={sx(tv)} y1={pT} x2={sx(tv)} y2={bottomY}
            stroke="#d1d5db" strokeWidth={1} strokeDasharray="3,2" />
        );
      })}

      {/* Filled area under the curve — per zone */}
      {zones.map((z) => (
        <polygon key={z.id} clipPath={`url(#csc-${z.id})`}
          points={areaStr} fill={z.fill} opacity={0.2} />
      ))}

      {/* Colored line segments — per zone */}
      {zones.map((z) => (
        <polyline key={z.id} clipPath={`url(#csc-${z.id})`}
          points={ptStr} fill="none" stroke={z.stroke} strokeWidth={2}
          strokeLinejoin="round" strokeLinecap="round" />
      ))}

      {/* Data point circles */}
      {pts.map((p) => {
        if (p.count === 0) return null;
        const z = getZone(p.x);
        return (
          <circle key={p.x} cx={sx(p.x)} cy={sy(p.count)} r={3}
            fill="white" stroke={z.stroke} strokeWidth={1.5}>
            <title>{p.count.toLocaleString()} CVEs — score {p.x - 5}–{p.x + 5}</title>
          </circle>
        );
      })}

      {/* Axes */}
      <line x1={pL} y1={bottomY} x2={W - pR} y2={bottomY} stroke="#d1d5db" strokeWidth={1} />
      <line x1={pL} y1={pT}      x2={pL}     y2={bottomY} stroke="#d1d5db" strokeWidth={1} />

      {/* X axis labels */}
      {[0, 25, 50, 75, 100].map((x) => (
        <text key={x} x={sx(x)} y={H - 2} textAnchor="middle" fontSize={9} fill="#9ca3af">{x}</text>
      ))}

      {/* Y axis max */}
      <text x={pL - 3} y={pT + 5} textAnchor="end" fontSize={9} fill="#9ca3af">
        {maxC >= 1000 ? `${Math.round(maxC / 1000)}k` : maxC}
      </text>
    </svg>
  );
}

/** Confidence distribution — simple indigo line chart. */
function ConfidenceLineChart({ data }: { data: Array<{ bucket: string; count: number }> }) {
  const W = 320, H = 110;
  const pL = 36, pR = 8, pT = 8, pB = 18;
  const iW = W - pL - pR;
  const iH = H - pT - pB;
  const bottomY = pT + iH;

  const pts = fillBuckets(data);
  const maxC = Math.max(...pts.map((p) => p.count), 1);

  const sx = (x: number) => pL + (x / 100) * iW;
  const sy = (c: number) => pT + iH - (c / maxC) * iH;

  const ptStr = pts.map((p) => `${sx(p.x)},${sy(p.count)}`).join(' ');
  const areaStr = `${sx(pts[0].x)},${bottomY} ${ptStr} ${sx(pts[pts.length - 1].x)},${bottomY}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible">
      {/* Horizontal grid lines */}
      {[0.25, 0.5, 0.75].map((r) => (
        <line key={r} x1={pL} y1={sy(maxC * r)} x2={W - pR} y2={sy(maxC * r)}
          stroke="#e5e7eb" strokeWidth={1} />
      ))}

      {/* Filled area */}
      <polygon points={areaStr} fill="#818cf8" opacity={0.18} />

      {/* Line */}
      <polyline points={ptStr} fill="none" stroke="#6366f1" strokeWidth={2}
        strokeLinejoin="round" strokeLinecap="round" />

      {/* Data point circles */}
      {pts.map((p) => {
        if (p.count === 0) return null;
        return (
          <circle key={p.x} cx={sx(p.x)} cy={sy(p.count)} r={3}
            fill="white" stroke="#6366f1" strokeWidth={1.5}>
            <title>{p.count.toLocaleString()} CVEs — confidence {p.x - 5}–{p.x + 5}%</title>
          </circle>
        );
      })}

      {/* Axes */}
      <line x1={pL} y1={bottomY} x2={W - pR} y2={bottomY} stroke="#d1d5db" strokeWidth={1} />
      <line x1={pL} y1={pT}      x2={pL}     y2={bottomY} stroke="#d1d5db" strokeWidth={1} />

      {/* X axis labels */}
      {[0, 25, 50, 75, 100].map((x) => (
        <text key={x} x={sx(x)} y={H - 2} textAnchor="middle" fontSize={9} fill="#9ca3af">{x}%</text>
      ))}

      {/* Y axis max */}
      <text x={pL - 3} y={pT + 5} textAnchor="end" fontSize={9} fill="#9ca3af">
        {maxC >= 1000 ? `${Math.round(maxC / 1000)}k` : maxC}
      </text>
    </svg>
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
        columns: { ...prev.columns, [col]: { ...prev.columns[col], ...patch } },
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

  // Move a fallback entry up (-1) or down (+1) within its group
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

  // Remove a column from a group → it becomes a standalone disabled entry
  const removeFallback = (groupCol: string, fbCol: string) => {
    setProfile((prev) => {
      if (!prev) return prev;
      const groupCfg = prev.columns[groupCol];
      const meta = COLUMN_META[fbCol];
      return {
        ...prev,
        columns: {
          ...prev.columns,
          [groupCol]: { ...groupCfg, fallbacks: (groupCfg.fallbacks ?? []).filter((f) => f !== fbCol) },
          [fbCol]: { enabled: false, weight: 0, type: meta?.type ?? 'numeric', range: meta?.range, default_value: 100 },
        },
      };
    });
  };

  // Add a standalone column into a group → removes it from top-level
  const addFallback = (groupCol: string, fbCol: string) => {
    setProfile((prev) => {
      if (!prev) return prev;
      const groupCfg = prev.columns[groupCol];
      const { [fbCol]: _removed, ...restColumns } = prev.columns;
      return {
        ...prev,
        columns: {
          ...restColumns,
          [groupCol]: { ...groupCfg, fallbacks: [...(groupCfg.fallbacks ?? []), fbCol] },
        },
      };
    });
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
      setMsg(`Error: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
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
  // Derived state (computed at render time)
  // ---------------------------------------------------------------------------

  // Columns that appear as fallbacks → hidden from the main list
  const allFallbacks = new Set<string>();
  Object.values(profile.columns).forEach((cfg) => {
    if (cfg.fallbacks) cfg.fallbacks.forEach((f) => allFallbacks.add(f));
  });

  // Standalone columns with same type as groupCol that can be added as fallback
  const getAvailableForGroup = (groupCol: string): string[] => {
    const groupCfg = profile.columns[groupCol];
    if (!groupCfg) return [];
    const inGroup = new Set([groupCol, ...(groupCfg.fallbacks ?? [])]);
    return COLUMN_ORDER.filter(
      (c) =>
        !inGroup.has(c) &&
        !allFallbacks.has(c) &&
        c in profile.columns &&
        profile.columns[c].type === groupCfg.type,
    );
  };

  // Total weight of enabled top-level (non-fallback) columns
  const totalWeight = Object.entries(profile.columns)
    .filter(([col, c]) => c.enabled && !allFallbacks.has(col))
    .reduce((s, [, c]) => s + c.weight, 0);

  const weightWarning = Math.abs(totalWeight - 100) > 0.5;

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
            if (allFallbacks.has(col)) return null; // shown inside its group

            const isGroup = (cfg.fallbacks?.length ?? 0) > 0;
            const displayLabel = isGroup && meta.groupLabel ? meta.groupLabel : meta.label;

            // Values to display for boolean/categorical mappings
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
                    {displayLabel}
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

                {/* Fallback chain — always visible for groups */}
                {isGroup && (
                  <div className="mt-2 pl-12">
                    <p className="text-xs text-gray-400 mb-1.5">Fallback chain (first non-null wins):</p>
                    <div className="space-y-0.5">
                      {/* Primary column */}
                      <div className="flex items-center gap-2 text-xs text-gray-500 py-0.5">
                        <span className="text-gray-300 w-4 text-center font-mono">1.</span>
                        <span className="font-mono">{meta.label}</span>
                        <span className="text-gray-300">(primary)</span>
                      </div>
                      {/* Fallbacks */}
                      {(cfg.fallbacks ?? []).map((fbCol, idx) => {
                        const fbMeta = COLUMN_META[fbCol];
                        const fbCount = (cfg.fallbacks ?? []).length;
                        return (
                          <div key={fbCol} className="flex items-center gap-2 text-xs text-gray-600 py-0.5">
                            <span className="text-gray-300 w-4 text-center font-mono">{idx + 2}.</span>
                            <span className="font-mono">{fbMeta?.label ?? fbCol}</span>
                            <div className="ml-auto flex items-center gap-0.5">
                              <button
                                onClick={() => moveFallback(col, idx, -1)}
                                disabled={idx === 0}
                                className="px-1 py-0.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-25 disabled:cursor-not-allowed"
                                title="Move up"
                              >
                                ↑
                              </button>
                              <button
                                onClick={() => moveFallback(col, idx, 1)}
                                disabled={idx === fbCount - 1}
                                className="px-1 py-0.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-25 disabled:cursor-not-allowed"
                                title="Move down"
                              >
                                ↓
                              </button>
                              <button
                                onClick={() => removeFallback(col, fbCol)}
                                className="px-1.5 py-0.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
                                title="Remove from group"
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      {/* Add fallback dropdown */}
                      {getAvailableForGroup(col).length > 0 && (
                        <select
                          value=""
                          onChange={(e) => { if (e.target.value) addFallback(col, e.target.value); }}
                          className="mt-1 text-xs rounded border-gray-200 text-gray-500 focus:border-gray-400 focus:ring-gray-400 py-0.5"
                        >
                          <option value="">+ Add fallback…</option>
                          {getAvailableForGroup(col).map((fc) => (
                            <option key={fc} value={fc}>{COLUMN_META[fc]?.label ?? fc}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                )}

                {/* Value mappings — boolean / categorical */}
                {cfg.enabled && meta.type !== 'numeric' && (
                  <div className="mt-3 pl-12">
                    {isGroup && (
                      <p className="text-xs text-gray-400 mb-2">
                        Value mapping applied to all columns in the group.
                      </p>
                    )}
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
          <button
            disabled={saving || computing}
            onClick={handleReset}
            className="ml-auto px-3 py-1.5 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md disabled:opacity-50 transition-colors"
          >
            Reset to defaults
          </button>
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
            {/* Priority counts — V0 at top */}
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

            {/* Score distribution — line chart colored by priority zone */}
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

            {/* Confidence distribution — line chart */}
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
    </div>
  );
}
