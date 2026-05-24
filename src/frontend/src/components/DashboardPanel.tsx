import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Gauge, Play, RefreshCw, RotateCcw, Save, Server, ShieldAlert, SlidersHorizontal, Target } from 'lucide-react';
import {
  AssetStats,
  ColumnConfig,
  EligibleColumn,
  FindingScoringProfile,
  FindingStats,
  ScoreDistribution,
  ScoringProfile,
  VulnerabilityStats,
  fetchAssetStats,
  fetchColumnValues,
  fetchEligibleColumns,
  fetchFindingScoringProfile,
  fetchFindingStats,
  fetchScoreDistribution,
  fetchScoringProfile,
  fetchStats,
  resetFindingScoringProfile,
  resetScoringProfile,
  runFindingScoring,
  runScoring,
  saveFindingScoringProfile,
  saveScoringProfile,
} from '../api/client';
import { getErrorMessage } from '../lib/utils';
import AddMetricButton from './scoring/AddMetricButton';
import MetricCard from './scoring/MetricCard';
import MetricEditModal from './scoring/MetricEditModal';
import { HorizontalBar, PRIORITY_COLORS } from './scoring/helpers';

const VULN_PRIORITIES = ['V0', 'V1', 'V2', 'V3'] as const;
const FINDING_PRIORITIES = ['P0', 'P1', 'P2', 'P3'] as const;
const WEIGHT_LABELS: Record<keyof FindingScoringProfile['weights'], string> = {
  vulnerability_priority: 'Vulnerability score',
  internet_exposure: 'Internet exposure',
  business_criticality: 'Business criticality',
  patch_complexity: 'Patch complexity',
};
const VALUE_LABELS = {
  internet_exposure: 'Exposure',
  business_criticality: 'Criticality',
  patch_complexity: 'Patch complexity',
} as const;

export default function DashboardPanel() {
  const [vulnStats, setVulnStats] = useState<VulnerabilityStats | null>(null);
  const [assetStats, setAssetStats] = useState<AssetStats | null>(null);
  const [findingStats, setFindingStats] = useState<FindingStats | null>(null);
  const [distribution, setDistribution] = useState<ScoreDistribution | null>(null);
  const [profile, setProfile] = useState<ScoringProfile | null>(null);
  const [findingProfile, setFindingProfile] = useState<FindingScoringProfile | null>(null);
  const [eligibleColumns, setEligibleColumns] = useState<Record<string, EligibleColumn> | null>(null);
  const [colValues, setColValues] = useState<Record<string, string[]>>({});
  const [editingColumn, setEditingColumn] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [computingVulns, setComputingVulns] = useState(false);
  const [computingFindings, setComputingFindings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const msgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = async () => {
    setError(null);
    const [vs, as, fs, dist, scoring, findingScoring, columns] = await Promise.all([
      fetchStats(),
      fetchAssetStats(),
      fetchFindingStats(),
      fetchScoreDistribution(),
      fetchScoringProfile(),
      fetchFindingScoringProfile(),
      fetchEligibleColumns(),
    ]);
    setVulnStats(vs);
    setAssetStats(as);
    setFindingStats(fs);
    setDistribution(dist);
    setProfile(scoring);
    setFindingProfile(findingScoring);
    setEligibleColumns(columns);
  };

  useEffect(() => {
    load()
      .catch((e) => setError(getErrorMessage(e)))
      .finally(() => setLoading(false));
    return () => {
      if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
    };
  }, []);

  const showMessage = (value: string) => {
    setMsg(value);
    if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
    msgTimerRef.current = setTimeout(() => setMsg(null), 3000);
  };

  const ensureColumnValues = async (col: string) => {
    if (colValues[col] !== undefined) return;
    try {
      const res = await fetchColumnValues(col);
      setColValues((prev) => ({ ...prev, [col]: res.values }));
    } catch {
      setColValues((prev) => ({ ...prev, [col]: [] }));
    }
  };

  const { allFallbacks, topLevelCols, totalWeight, weightWarning } = useMemo(() => {
    if (!profile) return { allFallbacks: new Set<string>(), topLevelCols: [] as string[], totalWeight: 0, weightWarning: false };
    const allFallbacks = new Set<string>();
    Object.values(profile.columns).forEach((cfg) => cfg.fallbacks?.forEach((fallback) => allFallbacks.add(fallback)));
    const topLevelCols = Object.keys(profile.columns).filter((col) => !allFallbacks.has(col));
    const totalWeight = topLevelCols
      .filter((col) => profile.columns[col].enabled)
      .reduce((sum, col) => sum + profile.columns[col].weight, 0);
    return { allFallbacks, topLevelCols, totalWeight, weightWarning: Math.abs(totalWeight - 100) > 0.5 };
  }, [profile]);

  const updateColumn = (col: string, patch: Partial<ColumnConfig>) => {
    setProfile((prev) => {
      if (!prev) return prev;
      return { ...prev, columns: { ...prev.columns, [col]: { ...prev.columns[col], ...patch } } };
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

  const moveFallback = (col: string, fbIdx: number, direction: -1 | 1) => {
    setProfile((prev) => {
      if (!prev) return prev;
      const cfg = prev.columns[col];
      const fallbacks = [...(cfg.fallbacks ?? [])];
      const newIdx = fbIdx + direction;
      if (newIdx < 0 || newIdx >= fallbacks.length) return prev;
      [fallbacks[fbIdx], fallbacks[newIdx]] = [fallbacks[newIdx], fallbacks[fbIdx]];
      return { ...prev, columns: { ...prev.columns, [col]: { ...cfg, fallbacks } } };
    });
  };

  const removeFallback = (col: string, fbCol: string) => {
    setProfile((prev) => {
      if (!prev) return prev;
      const cfg = prev.columns[col];
      return { ...prev, columns: { ...prev.columns, [col]: { ...cfg, fallbacks: (cfg.fallbacks ?? []).filter((f) => f !== fbCol) } } };
    });
  };

  const addFallback = (col: string, fbCol: string) => {
    setProfile((prev) => {
      if (!prev) return prev;
      const cfg = prev.columns[col];
      return { ...prev, columns: { ...prev.columns, [col]: { ...cfg, fallbacks: [...(cfg.fallbacks ?? []), fbCol] } } };
    });
  };

  const updateThreshold = (level: string, value: number) => {
    setProfile((prev) => prev ? { ...prev, thresholds: { ...prev.thresholds, [level]: value } } : prev);
  };

  const updateFindingThreshold = (level: string, value: number) => {
    setFindingProfile((prev) => prev ? { ...prev, thresholds: { ...prev.thresholds, [level]: value } } : prev);
  };

  const updateFindingWeight = (key: keyof FindingScoringProfile['weights'], value: number) => {
    setFindingProfile((prev) => prev ? { ...prev, weights: { ...prev.weights, [key]: value } } : prev);
  };

  const updateFindingValue = (
    group: keyof FindingScoringProfile['values'],
    key: string,
    value: number,
  ) => {
    setFindingProfile((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        values: {
          ...prev.values,
          [group]: { ...prev.values[group], [key]: value },
        },
      };
    });
  };

  const handleSave = async () => {
    if (!profile || !findingProfile) return;
    setSaving(true);
    setError(null);
    try {
      const [savedProfile, savedFindingProfile] = await Promise.all([
        saveScoringProfile(profile),
        saveFindingScoringProfile(findingProfile),
      ]);
      setProfile(savedProfile);
      setFindingProfile(savedFindingProfile);
      showMessage('Scoring profiles saved');
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleComputeVulns = async () => {
    if (!profile) return;
    setComputingVulns(true);
    setError(null);
    try {
      await saveScoringProfile(profile);
      const res = await runScoring();
      const [dist, stats] = await Promise.all([fetchScoreDistribution(), fetchStats()]);
      setDistribution(dist);
      setVulnStats(stats);
      showMessage(`Scored ${res.rows_updated.toLocaleString()} CVEs`);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setComputingVulns(false);
    }
  };

  const handleComputeFindings = async () => {
    if (!findingProfile) return;
    setComputingFindings(true);
    setError(null);
    try {
      await saveFindingScoringProfile(findingProfile);
      const res = await runFindingScoring();
      const [dist, stats, vuln] = await Promise.all([fetchScoreDistribution(), fetchFindingStats(), fetchStats()]);
      setDistribution(dist);
      setFindingStats(stats);
      setVulnStats(vuln);
      showMessage(`Scored ${res.rows_updated.toLocaleString()} findings`);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setComputingFindings(false);
    }
  };

  const handleResetProfiles = async () => {
    if (!confirm('Reset vulnerability and finding scoring profiles to defaults?')) return;
    setSaving(true);
    setError(null);
    try {
      const [scoring, findingScoring] = await Promise.all([resetScoringProfile(), resetFindingScoringProfile()]);
      setProfile(scoring);
      setFindingProfile(findingScoring);
      showMessage('Scoring profiles reset');
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-28 animate-pulse rounded-lg border border-gray-200 bg-white" />
        <div className="h-72 animate-pulse rounded-lg border border-gray-200 bg-white" />
        <div className="h-72 animate-pulse rounded-lg border border-gray-200 bg-white" />
      </div>
    );
  }

  if (!profile || !findingProfile || !eligibleColumns) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load dashboard: {error ?? 'missing scoring metadata'}
      </div>
    );
  }

  const editingConfig = editingColumn ? profile.columns[editingColumn] : null;
  const editingMeta = editingColumn ? eligibleColumns[editingColumn] : null;
  const busy = saving || computingVulns || computingFindings;

  return (
    <div className="space-y-5">
      {msg && <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">{msg}</div>}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Prioritization cockpit</h2>
            <p className="text-sm text-gray-500">Vulnerabilities flow into findings; asset prioritization remains staged for the next method iteration.</p>
          </div>
          <button
            onClick={() => load().catch((e) => setError(getErrorMessage(e)))}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <OverviewTile icon={<ShieldAlert className="h-4 w-4" />} label="Vulnerabilities" value={vulnStats?.total} detail={`${vulnStats?.kev_count ?? 0} KEV exploited`} />
          <OverviewTile icon={<Server className="h-4 w-4" />} label="Assets" value={assetStats?.total_assets} detail={`${assetStats?.components_with_cpe ?? 0} CPE-ready components`} wip />
          <OverviewTile icon={<Target className="h-4 w-4" />} label="Findings" value={findingStats?.total_findings} detail={`${findingStats?.scored_findings ?? 0} scored`} />
          <OverviewTile icon={<Gauge className="h-4 w-4" />} label="Vulnerability scores" value={distribution?.scored_count} detail={`${distribution?.unscored_count ?? 0} unscored`} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-gray-500" />
                <h2 className="text-base font-semibold text-gray-900">Vulnerability scoring metrics</h2>
              </div>
              <p className="mt-1 text-sm text-gray-500">Edit the source metrics and recompute CVE priority levels.</p>
            </div>
            <div className="text-sm">
              <span className="text-gray-500">Total weight </span>
              <span className={`font-mono font-medium ${weightWarning ? 'text-amber-600' : 'text-gray-900'}`}>{totalWeight.toFixed(1)}%</span>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
            <AddMetricButton
              eligibleColumns={eligibleColumns}
              profile={profile}
              allFallbacks={allFallbacks}
              onAdd={addMetric}
            />
          </div>
          <ThresholdEditor title="Vulnerability thresholds" levels={VULN_PRIORITIES} thresholds={profile.thresholds} onChange={updateThreshold} />
        </div>

        <div className="space-y-4">
          <ActionPanel
            busy={busy}
            saving={saving}
            computingVulns={computingVulns}
            computingFindings={computingFindings}
            onSave={handleSave}
            onComputeVulns={handleComputeVulns}
            onComputeFindings={handleComputeFindings}
            onReset={handleResetProfiles}
          />
          <PriorityDistribution title="Vulnerability priority" levels={VULN_PRIORITIES} counts={distribution?.priority_counts ?? {}} total={distribution?.scored_count ?? 0} />
          <PriorityDistribution title="Finding priority" levels={FINDING_PRIORITIES} counts={findingStats?.priority_distribution ?? {}} total={findingStats?.scored_findings ?? 0} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.2fr)]">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 opacity-80">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-gray-400" />
            <h2 className="text-base font-semibold text-gray-700">Asset prioritization</h2>
            <span className="rounded bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">WIP</span>
          </div>
          <p className="mt-2 text-sm text-gray-500">
            Assets are imported and used as finding context, but they do not have an independent persisted priority score yet.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <MiniStat label="Internet-facing" value={assetStats?.exposure_distribution.internet ?? 0} />
            <MiniStat label="Critical" value={assetStats?.criticality_distribution.critical ?? 0} />
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Finding scoring context</h2>
              <p className="text-sm text-gray-500">Tune how vulnerability priority and asset context combine into finding priority.</p>
            </div>
            <ThresholdEditor title="Finding thresholds" levels={FINDING_PRIORITIES} thresholds={findingProfile.thresholds} onChange={updateFindingThreshold} compact />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-medium text-gray-700">Weights</h3>
              <div className="space-y-2">
                {(Object.keys(findingProfile.weights) as Array<keyof FindingScoringProfile['weights']>).map((key) => (
                  <NumberRow
                    key={key}
                    label={WEIGHT_LABELS[key]}
                    value={findingProfile.weights[key]}
                    onChange={(value) => updateFindingWeight(key, value)}
                  />
                ))}
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-medium text-gray-700">Asset metric values</h3>
              <div className="space-y-3">
                {(Object.keys(findingProfile.values) as Array<keyof FindingScoringProfile['values']>).map((group) => (
                  <ValueGroup
                    key={group}
                    title={VALUE_LABELS[group]}
                    values={findingProfile.values[group] as Record<string, number>}
                    onChange={(key, value) => updateFindingValue(group, key, value)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

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

function OverviewTile({ icon, label, value, detail, wip = false }: { icon: React.ReactNode; label: string; value: number | undefined; detail: string; wip?: boolean }) {
  return (
    <div className={`rounded-md border px-3 py-3 ${wip ? 'border-gray-200 bg-gray-50' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-center justify-between gap-2 text-gray-500">
        <span className="flex items-center gap-2 text-xs font-medium uppercase">{icon}{label}</span>
        {wip && <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">WIP</span>}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-gray-900">{formatNumber(value)}</div>
      <div className="mt-0.5 truncate text-xs text-gray-500">{detail}</div>
    </div>
  );
}

function ActionPanel({ busy, saving, computingVulns, computingFindings, onSave, onComputeVulns, onComputeFindings, onReset }: {
  busy: boolean;
  saving: boolean;
  computingVulns: boolean;
  computingFindings: boolean;
  onSave: () => void;
  onComputeVulns: () => void;
  onComputeFindings: () => void;
  onReset: () => void;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="mb-3 text-base font-semibold text-gray-900">Run controls</h2>
      <div className="grid gap-2">
        <button onClick={onSave} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50">
          <Save className="h-4 w-4" />
          {saving ? 'Saving...' : 'Save profiles'}
        </button>
        <button onClick={onComputeVulns} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50">
          {computingVulns ? <Spinner /> : <Play className="h-4 w-4" />}
          {computingVulns ? 'Scoring CVEs...' : 'Compute CVE scores'}
        </button>
        <button onClick={onComputeFindings} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50">
          {computingFindings ? <Spinner /> : <Target className="h-4 w-4" />}
          {computingFindings ? 'Scoring findings...' : 'Compute finding scores'}
        </button>
        <button onClick={onReset} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50">
          <RotateCcw className="h-4 w-4" />
          Reset profiles
        </button>
      </div>
    </div>
  );
}

function PriorityDistribution({ title, levels, counts, total }: { title: string; levels: readonly string[]; counts: Record<string, number>; total: number }) {
  const max = Math.max(...levels.map((level) => counts[level] ?? 0), 1);
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        <span className="text-xs text-gray-500">{total.toLocaleString()} scored</span>
      </div>
      <div className="space-y-2">
        {levels.map((level) => (
          <div key={level} className="space-y-1">
            <div className="flex justify-between text-xs text-gray-500">
              <span className={`rounded px-1.5 py-0.5 font-semibold ${PRIORITY_COLORS[level].badge}`}>{level}</span>
              <span>{total > 0 ? (((counts[level] ?? 0) / total) * 100).toFixed(1) : '0.0'}%</span>
            </div>
            <HorizontalBar value={counts[level] ?? 0} max={max} color={PRIORITY_COLORS[level].bar} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ThresholdEditor({ title, levels, thresholds, onChange, compact = false }: {
  title: string;
  levels: readonly string[];
  thresholds: Record<string, number>;
  onChange: (level: string, value: number) => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? '' : 'mt-4 border-t border-gray-100 pt-4'}>
      <h3 className="mb-2 text-sm font-medium text-gray-700">{title}</h3>
      <div className="flex flex-wrap gap-2">
        {levels.map((level) => (
          <label key={level} className="flex items-center gap-1.5">
            <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${PRIORITY_COLORS[level].badge}`}>{level}</span>
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              value={thresholds[level] ?? ''}
              onChange={(event) => onChange(level, Number(event.target.value))}
              className="w-16 rounded-md border-gray-300 text-right text-sm focus:border-gray-500 focus:ring-gray-500"
            />
          </label>
        ))}
      </div>
    </div>
  );
}

function NumberRow({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
      <span className="text-sm text-gray-700">{label}</span>
      <input
        type="number"
        min="0"
        step="1"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-20 rounded-md border-gray-300 text-right text-sm focus:border-gray-500 focus:ring-gray-500"
      />
    </label>
  );
}

function ValueGroup({ title, values, onChange }: { title: string; values: Record<string, number>; onChange: (key: string, value: number) => void }) {
  return (
    <div className="rounded-md border border-gray-100 bg-gray-50 p-3">
      <div className="mb-2 text-xs font-medium uppercase text-gray-500">{title}</div>
      <div className="grid grid-cols-2 gap-2">
        {Object.entries(values).map(([key, value]) => (
          <label key={key} className="flex items-center justify-between gap-2 text-sm text-gray-700">
            <span className="truncate capitalize">{key.replace(/_/g, ' ')}</span>
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              value={value}
              onChange={(event) => onChange(key, Number(event.target.value))}
              className="w-16 rounded-md border-gray-300 text-right text-sm focus:border-gray-500 focus:ring-gray-500"
            />
          </label>
        ))}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-base font-semibold tabular-nums text-gray-700">{value.toLocaleString()}</div>
    </div>
  );
}

function Spinner() {
  return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />;
}

function formatNumber(value: number | undefined): string {
  return value == null ? '...' : value.toLocaleString();
}
