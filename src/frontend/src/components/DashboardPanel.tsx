import { useEffect, useMemo, useRef, useState } from 'react';
import { Play, RefreshCw, RotateCcw, Save, Server, ShieldAlert, SlidersHorizontal, Target } from 'lucide-react';
import {
  AssetScoringProfile,
  AssetStats,
  ColumnConfig,
  EligibleColumn,
  FindingScoringProfile,
  FindingStats,
  ScoreDistribution,
  ScoringProfile,
  VulnerabilityStats,
  fetchAssetScoringProfile,
  fetchAssetStats,
  fetchColumnValues,
  fetchEligibleColumns,
  fetchFindingScoringProfile,
  fetchFindingStats,
  fetchScoreDistribution,
  fetchScoringProfile,
  fetchStats,
  resetFindingScoringProfile,
  resetAssetScoringProfile,
  resetScoringProfile,
  runAssetScoring,
  runFindingScoring,
  runScoring,
  saveAssetScoringProfile,
  saveFindingScoringProfile,
  saveScoringProfile,
} from '../api/client';
import { getErrorMessage } from '../lib/utils';
import AddMetricButton from './scoring/AddMetricButton';
import MetricCard from './scoring/MetricCard';
import MetricEditModal from './scoring/MetricEditModal';
import { HorizontalBar, PRIORITY_COLORS } from './scoring/helpers';

const VULN_PRIORITIES = ['V0', 'V1', 'V2', 'V3'] as const;
const ASSET_PRIORITIES = ['A0', 'A1', 'A2', 'A3'] as const;
const FINDING_PRIORITIES = ['P0', 'P1', 'P2', 'P3'] as const;
const ASSET_WEIGHT_LABELS: Record<keyof AssetScoringProfile['weights'], string> = {
  internet_exposure: 'Internet exposure',
  business_criticality: 'Business criticality',
  patch_complexity: 'Patch complexity',
};
const FINDING_WEIGHT_LABELS: Record<keyof FindingScoringProfile['weights'], string> = {
  vulnerability_priority: 'Vulnerability score',
  asset_priority: 'Asset score',
};
const PRIORITY_HEX_COLORS: Record<string, string> = {
  V0: '#ef4444',
  V1: '#f97316',
  V2: '#facc15',
  V3: '#22c55e',
  A0: '#ef4444',
  A1: '#f97316',
  A2: '#facc15',
  A3: '#22c55e',
  P0: '#ef4444',
  P1: '#f97316',
  P2: '#facc15',
  P3: '#22c55e',
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
  const [assetProfile, setAssetProfile] = useState<AssetScoringProfile | null>(null);
  const [findingProfile, setFindingProfile] = useState<FindingScoringProfile | null>(null);
  const [eligibleColumns, setEligibleColumns] = useState<Record<string, EligibleColumn> | null>(null);
  const [colValues, setColValues] = useState<Record<string, string[]>>({});
  const [editingColumn, setEditingColumn] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [computingVulns, setComputingVulns] = useState(false);
  const [computingAssets, setComputingAssets] = useState(false);
  const [computingFindings, setComputingFindings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const msgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = async () => {
    setError(null);
    const [vs, as, fs, dist, scoring, assetScoring, findingScoring, columns] = await Promise.all([
      fetchStats(),
      fetchAssetStats(),
      fetchFindingStats(),
      fetchScoreDistribution(),
      fetchScoringProfile(),
      fetchAssetScoringProfile(),
      fetchFindingScoringProfile(),
      fetchEligibleColumns(),
    ]);
    setVulnStats(vs);
    setAssetStats(as);
    setFindingStats(fs);
    setDistribution(dist);
    setProfile(scoring);
    setAssetProfile(assetScoring);
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

  const updateAssetThreshold = (level: string, value: number) => {
    setAssetProfile((prev) => prev ? { ...prev, thresholds: { ...prev.thresholds, [level]: value } } : prev);
  };

  const updateAssetWeight = (key: keyof AssetScoringProfile['weights'], value: number) => {
    setAssetProfile((prev) => prev ? { ...prev, weights: { ...prev.weights, [key]: value } } : prev);
  };

  const updateAssetValue = (
    group: keyof AssetScoringProfile['values'],
    key: string,
    value: number,
  ) => {
    setAssetProfile((prev) => {
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

  const updateFindingThreshold = (level: string, value: number) => {
    setFindingProfile((prev) => prev ? { ...prev, thresholds: { ...prev.thresholds, [level]: value } } : prev);
  };

  const updateFindingWeight = (key: keyof FindingScoringProfile['weights'], value: number) => {
    setFindingProfile((prev) => prev ? { ...prev, weights: { ...prev.weights, [key]: value } } : prev);
  };

  const handleSave = async () => {
    if (!profile || !assetProfile || !findingProfile) return;
    setSaving(true);
    setError(null);
    try {
      const [savedProfile, savedAssetProfile, savedFindingProfile] = await Promise.all([
        saveScoringProfile(profile),
        saveAssetScoringProfile(assetProfile),
        saveFindingScoringProfile(findingProfile),
      ]);
      setProfile(savedProfile);
      setAssetProfile(savedAssetProfile);
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

  const handleComputeAssets = async () => {
    if (!assetProfile) return;
    setComputingAssets(true);
    setError(null);
    try {
      await saveAssetScoringProfile(assetProfile);
      const res = await runAssetScoring();
      const stats = await fetchAssetStats();
      setAssetStats(stats);
      showMessage(`Scored ${res.rows_updated.toLocaleString()} assets`);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setComputingAssets(false);
    }
  };

  const handleComputeFindings = async () => {
    if (!assetProfile || !findingProfile) return;
    setComputingFindings(true);
    setError(null);
    try {
      await Promise.all([saveAssetScoringProfile(assetProfile), saveFindingScoringProfile(findingProfile)]);
      const res = await runFindingScoring();
      const [dist, findings, vuln, assets] = await Promise.all([fetchScoreDistribution(), fetchFindingStats(), fetchStats(), fetchAssetStats()]);
      setDistribution(dist);
      setFindingStats(findings);
      setVulnStats(vuln);
      setAssetStats(assets);
      showMessage(`Scored ${res.rows_updated.toLocaleString()} findings`);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setComputingFindings(false);
    }
  };

  const handleResetProfiles = async () => {
    if (!confirm('Reset vulnerability, asset, and finding scoring profiles to defaults?')) return;
    setSaving(true);
    setError(null);
    try {
      const [scoring, assetScoring, findingScoring] = await Promise.all([resetScoringProfile(), resetAssetScoringProfile(), resetFindingScoringProfile()]);
      setProfile(scoring);
      setAssetProfile(assetScoring);
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

  if (!profile || !assetProfile || !findingProfile || !eligibleColumns) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load dashboard: {error ?? 'missing scoring metadata'}
      </div>
    );
  }

  const editingConfig = editingColumn ? profile.columns[editingColumn] : null;
  const editingMeta = editingColumn ? eligibleColumns[editingColumn] : null;
  const busy = saving || computingVulns || computingAssets || computingFindings;

  return (
    <div className="space-y-5">
      {msg && <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">{msg}</div>}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Prioritization cockpit</h2>
            <p className="text-sm text-gray-500">Vulnerabilities and assets are scored independently before they combine into finding priority.</p>
          </div>
          <ToolbarActions
            busy={busy}
            saving={saving}
            onSave={handleSave}
            onReset={handleResetProfiles}
            onRefresh={() => load().catch((e) => setError(getErrorMessage(e)))}
          />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
        <StageCard
          step="Stage 1"
          icon={<ShieldAlert className="h-5 w-5" />}
          title="Vulnerabilities"
          description="Score CVEs from vulnerability intelligence before matching them to assets."
          action={
            <StageActionButton
              busy={busy}
              computing={computingVulns}
              icon={<Play className="h-4 w-4" />}
              loadingLabel="Scoring CVEs..."
              label="Compute CVE scores"
              onClick={handleComputeVulns}
            />
          }
        >
          <StageMetricGrid>
            <StageMetric label="Total CVEs" value={vulnStats?.total} />
            <StageMetric label="KEV exploited" value={vulnStats?.kev_count} tone="red" />
            <StageMetric label="Scored CVEs" value={distribution?.scored_count} tone="green" />
            <StageMetric label="Unscored CVEs" value={distribution?.unscored_count} tone="muted" />
          </StageMetricGrid>

          <PriorityDistribution title="Vulnerability priority" levels={VULN_PRIORITIES} counts={distribution?.priority_counts ?? {}} total={distribution?.scored_count ?? 0} />

          <StageSection
            title="Scoring metrics"
            description="Edit the source metrics and recompute CVE priority levels."
            aside={
              <span className={`font-mono text-sm font-medium ${weightWarning ? 'text-amber-600' : 'text-gray-900'}`}>
                {totalWeight.toFixed(1)}%
              </span>
            }
          >
            <div className="grid grid-cols-1 gap-3">
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
          </StageSection>

          <ThresholdEditor title="Vulnerability thresholds" levels={VULN_PRIORITIES} thresholds={profile.thresholds} onChange={updateThreshold} compact />
        </StageCard>

        <StageCard
          step="Stage 2"
          icon={<Server className="h-5 w-5" />}
          title="Assets"
          description="Prioritize inventory context from exposure, criticality, and remediation complexity."
          action={
            <StageActionButton
              busy={busy}
              computing={computingAssets}
              icon={<Server className="h-4 w-4" />}
              loadingLabel="Scoring assets..."
              label="Compute asset scores"
              onClick={handleComputeAssets}
            />
          }
        >
          <StageMetricGrid>
            <StageMetric label="Total assets" value={assetStats?.total_assets} />
            <StageMetric label="Scored assets" value={assetStats?.scored_assets} tone="green" />
            <StageMetric label="A0 assets" value={assetStats?.priority_distribution.A0 ?? 0} tone="red" />
            <StageMetric label="Internet-facing" value={assetStats?.exposure_distribution.internet ?? 0} tone="orange" />
          </StageMetricGrid>

          <PriorityDistribution title="Asset priority" levels={ASSET_PRIORITIES} counts={assetStats?.priority_distribution ?? {}} total={assetStats?.scored_assets ?? 0} />

          <StageSection title="Weights" description="Balance the asset factors used during scoring.">
            <WeightMetricGrid>
              {(Object.keys(assetProfile.weights) as Array<keyof AssetScoringProfile['weights']>).map((key) => (
                <WeightMetricCard
                  key={key}
                  label={ASSET_WEIGHT_LABELS[key]}
                  source={key}
                  badge="asset metric"
                  value={assetProfile.weights[key]}
                  onChange={(value) => updateAssetWeight(key, value)}
                />
              ))}
            </WeightMetricGrid>
          </StageSection>

          <StageSection title="Metric values" description="Map asset inventory labels onto the scoring scale.">
            <div className="space-y-3">
              {(Object.keys(assetProfile.values) as Array<keyof AssetScoringProfile['values']>).map((group) => (
                <ValueGroup
                  key={group}
                  title={VALUE_LABELS[group]}
                  values={assetProfile.values[group] as Record<string, number>}
                  onChange={(key, value) => updateAssetValue(group, key, value)}
                />
              ))}
            </div>
          </StageSection>

          <ThresholdEditor title="Asset thresholds" levels={ASSET_PRIORITIES} thresholds={assetProfile.thresholds} onChange={updateAssetThreshold} compact />
        </StageCard>

        <StageCard
          step="Stage 3"
          icon={<Target className="h-5 w-5" />}
          title="Findings"
          description="Combine vulnerability and asset priority into the final remediation queue."
          action={
            <StageActionButton
              busy={busy}
              computing={computingFindings}
              icon={<Target className="h-4 w-4" />}
              loadingLabel="Scoring findings..."
              label="Compute finding scores"
              onClick={handleComputeFindings}
            />
          }
        >
          <StageMetricGrid>
            <StageMetric label="Total findings" value={findingStats?.total_findings} />
            <StageMetric label="Scored findings" value={findingStats?.scored_findings} tone="green" />
            <StageMetric label="P0 findings" value={findingStats?.priority_distribution.P0 ?? 0} tone="red" />
            <StageMetric label="Internet-exposed" value={findingStats?.exposure_distribution.internet ?? 0} tone="orange" />
          </StageMetricGrid>

          <PriorityDistribution title="Finding priority" levels={FINDING_PRIORITIES} counts={findingStats?.priority_distribution ?? {}} total={findingStats?.scored_findings ?? 0} />

          <StageSection title="Weights" description="Tune how CVE and asset priority combine into finding priority.">
            <WeightMetricGrid>
              {(Object.keys(findingProfile.weights) as Array<keyof FindingScoringProfile['weights']>).map((key) => (
                <WeightMetricCard
                  key={key}
                  label={FINDING_WEIGHT_LABELS[key]}
                  source={key}
                  badge="finding metric"
                  value={findingProfile.weights[key]}
                  onChange={(value) => updateFindingWeight(key, value)}
                />
              ))}
            </WeightMetricGrid>
          </StageSection>

          <ThresholdEditor title="Finding thresholds" levels={FINDING_PRIORITIES} thresholds={findingProfile.thresholds} onChange={updateFindingThreshold} compact />
        </StageCard>
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

function ToolbarActions({ busy, saving, onSave, onReset, onRefresh }: {
  busy: boolean;
  saving: boolean;
  onSave: () => void;
  onReset: () => void;
  onRefresh: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <button onClick={onRefresh} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50">
        <RefreshCw className="h-4 w-4" />
        Refresh
      </button>
      <button onClick={onSave} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50">
        <Save className="h-4 w-4" />
        {saving ? 'Saving...' : 'Save profiles'}
      </button>
      <button onClick={onReset} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50">
        <RotateCcw className="h-4 w-4" />
        Reset profiles
      </button>
    </div>
  );
}

function StageCard({ step, icon, title, description, action, children }: {
  step: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  action: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <article className="flex min-w-0 flex-col gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex min-h-[94px] flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-gray-500">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-gray-900 text-white">{icon}</span>
            {step}
          </div>
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <p className="mt-1 text-sm leading-5 text-gray-500">{description}</p>
        </div>
        <div className="shrink-0">{action}</div>
      </div>
      {children}
    </article>
  );
}

function StageActionButton({ busy, computing, icon, loadingLabel, label, onClick }: {
  busy: boolean;
  computing: boolean;
  icon: React.ReactNode;
  loadingLabel: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50 sm:w-auto">
      {computing ? <Spinner /> : icon}
      {computing ? loadingLabel : label}
    </button>
  );
}

function StageMetricGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {children}
    </div>
  );
}

function StageMetric({ label, value, tone = 'neutral' }: { label: string; value: number | undefined; tone?: 'neutral' | 'red' | 'orange' | 'green' | 'muted' }) {
  const toneClass = {
    neutral: 'bg-gray-50 text-gray-900',
    red: 'bg-red-50 text-red-700',
    orange: 'bg-orange-50 text-orange-700',
    green: 'bg-green-50 text-green-700',
    muted: 'bg-gray-100 text-gray-500',
  }[tone];

  return (
    <div className={`min-w-0 rounded-md px-3 py-2 ${toneClass}`}>
      <div className="truncate text-[11px] font-medium uppercase text-gray-500">{label}</div>
      <div className="mt-0.5 truncate text-lg font-semibold tabular-nums">{formatNumber(value)}</div>
    </div>
  );
}

function WeightMetricGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-3">
      {children}
    </div>
  );
}

function WeightMetricCard({ label, source, badge, value, onChange }: {
  label: string;
  source: string;
  badge: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block rounded-lg border border-gray-300 bg-white p-3 transition-all hover:border-gray-400 hover:shadow-md focus-within:ring-2 focus-within:ring-gray-300">
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <span className="text-sm font-medium leading-tight text-gray-900">{label}</span>
        <span className="inline-block rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">
          {badge}
        </span>
      </div>
      <div className="mb-2 truncate font-mono text-xs text-gray-400">{source}</div>
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-xs text-gray-700">{value}%</span>
        <input
          aria-label={`${label} weight`}
          type="number"
          min="0"
          step="1"
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="w-20 rounded-md border-gray-300 text-right text-sm focus:border-gray-500 focus:ring-gray-500"
        />
      </div>
    </label>
  );
}

function StageSection({ title, description, aside, children }: {
  title: string;
  description?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-gray-100 pt-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {title === 'Scoring metrics' && <SlidersHorizontal className="h-4 w-4 text-gray-500" />}
            <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
          </div>
          {description && <p className="mt-0.5 text-xs leading-5 text-gray-500">{description}</p>}
        </div>
        {aside && (
          <div className="shrink-0 text-right">
            <div className="text-[11px] font-medium uppercase text-gray-500">Total weight</div>
            {aside}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

function PriorityDistribution({ title, levels, counts, total }: { title: string; levels: readonly string[]; counts: Record<string, number>; total: number }) {
  const max = Math.max(...levels.map((level) => counts[level] ?? 0), 1);
  return (
    <div className="rounded-md border border-gray-100 bg-gray-50 p-3">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
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
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [draggingLevel, setDraggingLevel] = useState<string | null>(null);
  const fixedBaselineLevel = levels[levels.length - 1];
  const thresholdItems = levels.map((level) => ({
    level,
    value: level === fixedBaselineLevel ? 0 : normalizeThreshold(thresholds[level]),
  }));
  const movableThresholdItems = thresholdItems.filter((item) => item.level !== fixedBaselineLevel);
  const ascendingThresholds = [...thresholdItems].sort((a, b) => a.value - b.value);
  const gradientStops = ascendingThresholds.map((item, index) => {
    const start = index === 0 ? 0 : ascendingThresholds[index].value;
    const end = index === ascendingThresholds.length - 1 ? 100 : ascendingThresholds[index + 1].value;
    const color = PRIORITY_HEX_COLORS[item.level] ?? '#9ca3af';
    return `${color} ${start}% ${end}%`;
  });
  const gradient = `linear-gradient(to right, ${gradientStops.join(', ')})`;

  const valueFromPointer = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return clampThreshold(((clientX - rect.left) / rect.width) * 100);
  };

  const nearestLevel = (value: number) => {
    return movableThresholdItems.reduce((nearest, item) => (
      Math.abs(item.value - value) < Math.abs(nearest.value - value) ? item : nearest
    ), movableThresholdItems[0]).level;
  };

  const updateLevel = (level: string, value: number) => {
    if (level === fixedBaselineLevel) return;
    onChange(level, clampThreshold(value));
  };

  useEffect(() => {
    if (!draggingLevel) return undefined;

    const handlePointerMove = (event: PointerEvent) => {
      updateLevel(draggingLevel, valueFromPointer(event.clientX));
    };
    const handlePointerUp = () => setDraggingLevel(null);

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [draggingLevel]);

  return (
    <div className={compact ? '' : 'mt-4 border-t border-gray-100 pt-4'}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-gray-700">{title}</h3>
        <span className="text-xs text-gray-400">0-100</span>
      </div>
      <div className="relative h-20 select-none">
        <div
          ref={trackRef}
          className="absolute left-5 right-5 top-0 h-20"
          onPointerDown={(event) => {
            const value = valueFromPointer(event.clientX);
            const level = nearestLevel(value);
            setDraggingLevel(level);
            updateLevel(level, value);
          }}
        >
          <div className="absolute left-0 right-0 top-0 flex justify-between text-[10px] font-medium text-gray-400">
            <span>0</span>
            <span>100</span>
          </div>
          <div className="absolute left-0 right-0 top-7 h-3 rounded-full border border-white shadow-inner ring-1 ring-gray-200" style={{ background: gradient }} />
          {thresholdItems.map(({ level, value }) => {
            const handleStyle = {
              backgroundColor: PRIORITY_HEX_COLORS[level] ?? '#111827',
              color: level.endsWith('2') ? '#111827' : '#ffffff',
              left: `${value}%`,
            };
            const handleClass = 'absolute top-4 h-9 w-9 -translate-x-1/2 rounded-full border-2 text-[10px] font-semibold shadow-md';
            const valueClass = 'absolute top-14 w-10 -translate-x-1/2 text-center font-mono text-xs';

            if (level === fixedBaselineLevel) {
              return (
                <div key={level}>
                  <span
                    aria-label={`${level} fixed threshold 0`}
                    className={`${handleClass} inline-flex cursor-default items-center justify-center border-gray-950 ring-1 ring-gray-950`}
                    style={handleStyle}
                    title={`${level} is fixed at 0`}
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    {level}
                  </span>
                  <span
                    className={`${valueClass} text-gray-500`}
                    style={{ left: `${value}%` }}
                  >
                    0
                  </span>
                </div>
              );
            }

            return (
              <div key={level}>
                <button
                  type="button"
                  aria-label={`${level} threshold ${value}`}
                  className={`${handleClass} border-white transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2`}
                  style={handleStyle}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    setDraggingLevel(level);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
                      event.preventDefault();
                      updateLevel(level, value - (event.shiftKey ? 10 : 1));
                    }
                    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
                      event.preventDefault();
                      updateLevel(level, value + (event.shiftKey ? 10 : 1));
                    }
                    if (event.key === 'Home') {
                      event.preventDefault();
                      updateLevel(level, 0);
                    }
                    if (event.key === 'End') {
                      event.preventDefault();
                      updateLevel(level, 100);
                    }
                  }}
                >
                  {level}
                </button>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={value}
                  aria-label={`${level} threshold value`}
                  onPointerDown={(event) => event.stopPropagation()}
                  onChange={(event) => updateLevel(level, Number(event.target.value))}
                  className={`${valueClass} border-0 bg-transparent p-0 text-gray-700 focus:outline-none focus:ring-0`}
                  style={{ left: `${value}%` }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
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

function Spinner() {
  return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />;
}

function formatNumber(value: number | undefined): string {
  return value == null ? '...' : value.toLocaleString();
}

function normalizeThreshold(value: number | undefined): number {
  return clampThreshold(Number.isFinite(value) ? Number(value) : 0);
}

function clampThreshold(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}
