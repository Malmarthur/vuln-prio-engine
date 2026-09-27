import { useEffect, useMemo, useRef, useState } from 'react';
import { Play, RefreshCw, RotateCcw, Save, Server, ShieldAlert, Target } from 'lucide-react';
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
  ScoringPreset,
  activateScoringPreset,
  fetchAssetScoringProfile,
  fetchAssetStats,
  fetchColumnValues,
  fetchEligibleColumns,
  fetchFindingScoringProfile,
  fetchFindingStats,
  fetchScoreDistribution,
  fetchScoringProfile,
  fetchScoringPresets,
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
import { HorizontalBar } from './scoring/helpers';
import { PriorityBadge, priorityBarClass, priorityHex, priorityTier } from '../lib/priority';
import ProfileManager from './ProfileManager';

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
const VALUE_LABELS = {
  internet_exposure: 'Exposure',
  business_criticality: 'Criticality',
  patch_complexity: 'Patch complexity',
} as const;

export default function DashboardPanel() {
  const [presets, setPresets] = useState<ScoringPreset[]>([]);
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

  useEffect(() => {
    fetchScoringPresets().then(setPresets).catch((e) => setError(getErrorMessage(e)));
  }, []);

  const handleActivatePreset = async (id: string) => {
    setLoading(true);
    try {
      await activateScoringPreset(id);
      setPresets(await fetchScoringPresets());
      await load();
      showMessage('Active scoring preset changed');
    } catch (e) { setError(getErrorMessage(e)); }
    finally { setLoading(false); }
  };

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
        <div className="panel h-28 animate-pulse" />
        <div className="panel h-72 animate-pulse" />
      </div>
    );
  }

  if (!profile || !assetProfile || !findingProfile || !eligibleColumns) {
    return (
      <div className="notice-error">
        Failed to load dashboard: {error ?? 'missing scoring metadata'}
      </div>
    );
  }

  const editingConfig = editingColumn ? profile.columns[editingColumn] : null;
  const editingMeta = editingColumn ? eligibleColumns[editingColumn] : null;
  const busy = saving || computingVulns || computingAssets || computingFindings;

  return (
    <div className="space-y-4">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Scoring configuration</h2>
            <p className="panel-subtitle">Vulnerabilities and assets are scored independently, then combined into finding priority.</p>
          </div>
          <ToolbarActions
            busy={busy}
            saving={saving}
            onSave={handleSave}
            onReset={handleResetProfiles}
            onRefresh={() => load().catch((e) => setError(getErrorMessage(e)))}
          />
        </div>
        <div className="grid gap-4 p-4 xl:grid-cols-[240px_minmax(0,1fr)]">
          <label className="block">
            <span className="label-caps">Active preset</span>
            <select
              value={presets.find((item) => item.is_active)?.id ?? ''}
              onChange={(event) => handleActivatePreset(event.target.value)}
              className="field mt-1.5 block w-full"
            >
              {presets.map((item) => <option key={item.id} value={item.id}>{item.name}{item.is_builtin ? ' · built-in' : ''}</option>)}
            </select>
            <span className="mt-1.5 block text-xs text-gray-500">Used by the inventory views and default scoring runs.</span>
          </label>
          <ProfileManager
            activePreset={presets.find((item) => item.is_active)}
            onChanged={async () => setPresets(await fetchScoringPresets())}
          />
        </div>
      </section>

      {msg && <div className="notice-info" role="status">{msg}</div>}
      {error && <div className="notice-error" role="alert">{error}</div>}

      <section className="grid items-start gap-4 xl:grid-cols-2 2xl:grid-cols-3">
        <StageCard
          step={1}
          icon={<ShieldAlert className="h-4 w-4" />}
          title="Vulnerabilities"
          description="Score CVEs from vulnerability intelligence before matching them to assets."
          action={
            <StageActionButton
              busy={busy}
              computing={computingVulns}
              icon={<Play className="h-3.5 w-3.5" />}
              loadingLabel="Scoring CVEs…"
              label="Compute CVE scores"
              onClick={handleComputeVulns}
            />
          }
        >
          <StageMetricGrid>
            <StageMetric label="Total CVEs" value={vulnStats?.total} />
            <StageMetric label="KEV exploited" value={vulnStats?.kev_count} tone="critical" />
            <StageMetric label="Scored" value={distribution?.scored_count} />
            <StageMetric label="Unscored" value={distribution?.unscored_count} tone="muted" />
          </StageMetricGrid>

          <PriorityDistribution title="Vulnerability priority" levels={VULN_PRIORITIES} counts={distribution?.priority_counts ?? {}} total={distribution?.scored_count ?? 0} />

          <StageSection
            title="Scoring metrics"
            description="Edit the source metrics and recompute CVE priority levels."
            aside={
              <span className={`font-mono text-[13px] font-semibold ${weightWarning ? 'text-amber-700' : 'text-gray-900'}`}>
                {totalWeight.toFixed(1)}%
              </span>
            }
          >
            <div className="grid grid-cols-1 gap-2">
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

          <ThresholdEditor title="Vulnerability thresholds" levels={VULN_PRIORITIES} thresholds={profile.thresholds} onChange={updateThreshold} />
        </StageCard>

        <StageCard
          step={2}
          icon={<Server className="h-4 w-4" />}
          title="Assets"
          description="Prioritize inventory context from exposure, criticality and remediation complexity."
          action={
            <StageActionButton
              busy={busy}
              computing={computingAssets}
              icon={<Play className="h-3.5 w-3.5" />}
              loadingLabel="Scoring assets…"
              label="Compute asset scores"
              onClick={handleComputeAssets}
            />
          }
        >
          <StageMetricGrid>
            <StageMetric label="Total assets" value={assetStats?.total_assets} />
            <StageMetric label="Scored" value={assetStats?.scored_assets} />
            <StageMetric label="A0 assets" value={assetStats?.priority_distribution.A0 ?? 0} tone="critical" />
            <StageMetric label="Internet-facing" value={assetStats?.exposure_distribution.internet ?? 0} tone="high" />
          </StageMetricGrid>

          <PriorityDistribution title="Asset priority" levels={ASSET_PRIORITIES} counts={assetStats?.priority_distribution ?? {}} total={assetStats?.scored_assets ?? 0} />

          <StageSection title="Weights" description="Balance the asset factors used during scoring.">
            <WeightMetricGrid>
              {(Object.keys(assetProfile.weights) as Array<keyof AssetScoringProfile['weights']>).map((key) => (
                <WeightMetricCard
                  key={key}
                  label={ASSET_WEIGHT_LABELS[key]}
                  source={key}
                  value={assetProfile.weights[key]}
                  onChange={(value) => updateAssetWeight(key, value)}
                />
              ))}
            </WeightMetricGrid>
          </StageSection>

          <StageSection title="Metric values" description="Map asset inventory labels onto the scoring scale.">
            <div className="space-y-2">
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

          <ThresholdEditor title="Asset thresholds" levels={ASSET_PRIORITIES} thresholds={assetProfile.thresholds} onChange={updateAssetThreshold} />
        </StageCard>

        <StageCard
          step={3}
          icon={<Target className="h-4 w-4" />}
          title="Findings"
          description="Combine vulnerability and asset priority into the final remediation queue."
          action={
            <StageActionButton
              busy={busy}
              computing={computingFindings}
              icon={<Play className="h-3.5 w-3.5" />}
              loadingLabel="Scoring findings…"
              label="Compute finding scores"
              onClick={handleComputeFindings}
            />
          }
        >
          <StageMetricGrid>
            <StageMetric label="Total findings" value={findingStats?.total_findings} />
            <StageMetric label="Scored" value={findingStats?.scored_findings} />
            <StageMetric label="P0 findings" value={findingStats?.priority_distribution.P0 ?? 0} tone="critical" />
            <StageMetric label="Internet-exposed" value={findingStats?.exposure_distribution.internet ?? 0} tone="high" />
          </StageMetricGrid>

          <PriorityDistribution title="Finding priority" levels={FINDING_PRIORITIES} counts={findingStats?.priority_distribution ?? {}} total={findingStats?.scored_findings ?? 0} />

          <StageSection title="Weights" description="Tune how CVE and asset priority combine into finding priority.">
            <WeightMetricGrid>
              {(Object.keys(findingProfile.weights) as Array<keyof FindingScoringProfile['weights']>).map((key) => (
                <WeightMetricCard
                  key={key}
                  label={FINDING_WEIGHT_LABELS[key]}
                  source={key}
                  value={findingProfile.weights[key]}
                  onChange={(value) => updateFindingWeight(key, value)}
                />
              ))}
            </WeightMetricGrid>
          </StageSection>

          <ThresholdEditor title="Finding thresholds" levels={FINDING_PRIORITIES} thresholds={findingProfile.thresholds} onChange={updateFindingThreshold} />
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
    <div className="flex flex-wrap items-center gap-2">
      <button onClick={onRefresh} disabled={busy} className="btn-secondary btn-sm">
        <RefreshCw className="h-3.5 w-3.5" />
        Refresh
      </button>
      <button onClick={onSave} disabled={busy} className="btn-secondary btn-sm">
        <Save className="h-3.5 w-3.5" />
        {saving ? 'Saving…' : 'Save profiles'}
      </button>
      <button onClick={onReset} disabled={busy} className="btn-danger btn-sm">
        <RotateCcw className="h-3.5 w-3.5" />
        Reset
      </button>
    </div>
  );
}

function StageCard({ step, icon, title, description, action, children }: {
  step: number;
  icon: React.ReactNode;
  title: string;
  description: string;
  action: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <article className="panel flex min-w-0 flex-col">
      <div className="panel-header">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center bg-gray-800 text-white">{icon}</span>
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Stage {step}</div>
            <h3 className="panel-title leading-tight">{title}</h3>
          </div>
        </div>
        <div className="shrink-0">{action}</div>
      </div>
      <div className="flex flex-col gap-4 p-4">
        <p className="text-[13px] leading-5 text-gray-600">{description}</p>
        {children}
      </div>
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
    <button onClick={onClick} disabled={busy} className="btn-primary btn-sm">
      {computing ? <Spinner /> : icon}
      {computing ? loadingLabel : label}
    </button>
  );
}

function StageMetricGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 border-l border-t border-gray-200 sm:grid-cols-4">
      {children}
    </div>
  );
}

function StageMetric({ label, value, tone = 'neutral' }: { label: string; value: number | undefined; tone?: 'neutral' | 'critical' | 'high' | 'muted' }) {
  const toneClass = {
    neutral: 'text-gray-900',
    critical: 'text-red-700',
    high: 'text-orange-700',
    muted: 'text-gray-400',
  }[tone];
  const marker = { critical: 'bg-red-500', high: 'bg-orange-500' }[tone as 'critical' | 'high'];

  return (
    <div className="relative min-w-0 border-b border-r border-gray-200 px-3 py-2">
      {marker && <span className={`absolute inset-y-0 left-0 w-[3px] ${marker}`} aria-hidden="true" />}
      <div className="label-caps truncate !text-[10px]">{label}</div>
      <div className={`mt-0.5 truncate text-[17px] font-semibold tabular-nums ${toneClass}`}>{formatNumber(value)}</div>
    </div>
  );
}

function WeightMetricGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-2">
      {children}
    </div>
  );
}

function WeightMetricCard({ label, source, value, onChange }: {
  label: string;
  source: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 border border-gray-300 bg-white px-3 py-2 transition-colors hover:border-gray-400 focus-within:border-accent-500">
      <span className="min-w-0">
        <span className="block text-[13px] font-medium leading-tight text-gray-900">{label}</span>
        <span className="block truncate font-mono text-[11px] text-gray-400">{source}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        <input
          aria-label={`${label} weight`}
          type="number"
          min="0"
          step="1"
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="field w-16 py-1 text-right font-mono"
        />
        <span className="font-mono text-xs text-gray-500">%</span>
      </span>
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
    <div className="border-t border-gray-200 pt-4">
      <div className="mb-2.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="label-caps text-gray-700">{title}</h4>
          {description && <p className="mt-0.5 text-xs leading-5 text-gray-500">{description}</p>}
        </div>
        {aside && (
          <div className="shrink-0 text-right">
            <div className="label-caps !text-[10px]">Total weight</div>
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
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="label-caps text-gray-700">{title}</h4>
        <span className="text-xs text-gray-500">{total.toLocaleString()} scored</span>
      </div>
      <div className="space-y-1.5">
        {levels.map((level) => (
          <div key={level} className="grid grid-cols-[2.5rem_minmax(0,1fr)_4.5rem_3rem] items-center gap-2 text-xs">
            <PriorityBadge level={level} />
            <HorizontalBar value={counts[level] ?? 0} max={max} color={priorityBarClass(level)} />
            <span className="text-right font-mono text-gray-700">{(counts[level] ?? 0).toLocaleString()}</span>
            <span className="text-right font-mono text-gray-500">{total > 0 ? (((counts[level] ?? 0) / total) * 100).toFixed(1) : '0.0'}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ThresholdEditor({ title, levels, thresholds, onChange }: {
  title: string;
  levels: readonly string[];
  thresholds: Record<string, number>;
  onChange: (level: string, value: number) => void;
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
    const color = priorityHex(item.level);
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
    <div className="border-t border-gray-200 pt-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h4 className="label-caps text-gray-700">{title}</h4>
        <span className="font-mono text-[11px] text-gray-400">score 0–100</span>
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
          <div className="absolute left-0 right-0 top-0 flex justify-between font-mono text-[10px] text-gray-400">
            <span>0</span>
            <span>100</span>
          </div>
          <div className="absolute left-0 right-0 top-[30px] h-2 ring-1 ring-gray-300" style={{ background: gradient }} />
          {thresholdItems.map(({ level, value }) => {
            const handleStyle = {
              backgroundColor: priorityHex(level),
              color: priorityTier(level) === 2 ? '#10141a' : '#ffffff',
              left: `${value}%`,
            };
            const handleClass = 'absolute top-[21px] h-[26px] w-[30px] -translate-x-1/2 rounded-sm border-2 font-mono text-[10px] font-semibold shadow-md';
            const valueClass = 'absolute top-14 w-10 -translate-x-1/2 text-center font-mono text-xs';

            if (level === fixedBaselineLevel) {
              return (
                <div key={level}>
                  <span
                    aria-label={`${level} fixed threshold 0`}
                    className={`${handleClass} inline-flex cursor-default items-center justify-center border-white`}
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
                  className={`${handleClass} cursor-ew-resize border-white focus:outline-none focus:ring-2 focus:ring-accent-600 focus:ring-offset-1`}
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
    <div className="border border-gray-200 bg-gray-50 px-3 py-2.5">
      <div className="label-caps mb-2 !text-[10px]">{title}</div>
      <div className="grid grid-cols-2 gap-2">
        {Object.entries(values).map(([key, value]) => (
          <label key={key} className="flex items-center justify-between gap-2 text-[13px] text-gray-700">
            <span className="truncate capitalize">{key.replace(/_/g, ' ')}</span>
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              value={value}
              onChange={(event) => onChange(key, Number(event.target.value))}
              className="field w-16 py-0.5 text-right font-mono"
            />
          </label>
        ))}
      </div>
    </div>
  );
}

function Spinner() {
  return <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />;
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
