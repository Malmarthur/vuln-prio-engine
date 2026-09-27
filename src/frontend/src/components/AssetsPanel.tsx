import { ChangeEvent, Fragment, KeyboardEvent, useEffect, useState } from 'react';
import {
  Asset,
  AssetComponent,
  AssetStats,
  fetchAssets,
  fetchAssetStats,
  importCycloneDXAsset,
  runProductResolution,
} from '../api/client';
import { useActivityFinished } from '../lib/activity';
import { getErrorMessage } from '../lib/utils';
import CompactKpi, { CompactKpiStrip } from './CompactKpi';
import Pagination from './Pagination';
import { ChevronRight } from 'lucide-react';
import { PriorityBadge } from '../lib/priority';
import StatusTag, { type StatusTone } from './StatusTag';

const EXPOSURE_LABELS: Record<string, string> = {
  internet: 'Internet',
  internal: 'Internal',
  isolated: 'Isolated',
  unknown: 'Unknown',
};

export default function AssetsPanel() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [stats, setStats] = useState<AssetStats | null>(null);
  const [page, setPage] = useState(1);
  const [priority, setPriority] = useState('');
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedAssetIds, setExpandedAssetIds] = useState<string[]>([]);

  const load = (nextPage = page, options: { clearError?: boolean } = {}) => {
    setLoading(true);
    if (options.clearError ?? true) {
      setError(null);
    }
    Promise.all([fetchAssets({ page: nextPage, per_page: 25, priority_level: priority }), fetchAssetStats()])
      .then(([assetPage, assetStats]) => {
        setAssets(assetPage.items);
        setTotal(assetPage.total);
        setStats(assetStats);
        setExpandedAssetIds((ids) => ids.filter((id) => assetPage.items.some((asset) => asset.id === id)));
      })
      .catch((e) => setError(getErrorMessage(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [page, priority]);

  // Asset scores change when a scoring job covering assets finishes.
  useActivityFinished((task) => task.kind === 'run' && (task.scope === 'asset' || task.scope === 'preset'), () => load(page));

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    setImporting(true);
    setImportProgress({ current: 0, total: files.length });
    setMsg(null);
    setError(null);

    let importedAssets = 0;
    let importedComponents = 0;
    const failures: string[] = [];

    try {
      for (const [index, file] of files.entries()) {
        setImportProgress({ current: index + 1, total: files.length });
        try {
          const payload = JSON.parse(await file.text()) as Record<string, unknown>;
          const res = await importCycloneDXAsset(payload);
          importedAssets += 1;
          importedComponents += res.component_count;
        } catch (e) {
          failures.push(`${file.name}: ${getErrorMessage(e)}`);
        }
      }

      if (importedAssets > 0) {
        setMsg(
          `Imported ${importedAssets.toLocaleString()} asset${importedAssets === 1 ? '' : 's'} with ${importedComponents.toLocaleString()} component${importedComponents === 1 ? '' : 's'}`
        );
      }
      if (failures.length > 0) {
        const visibleFailures = failures.slice(0, 4).join('\n');
        const remaining = failures.length > 4 ? `\n...and ${failures.length - 4} more` : '';
        setError(`Failed to import ${failures.length.toLocaleString()} file${failures.length === 1 ? '' : 's'}:\n${visibleFailures}${remaining}`);
      }

      setPage(1);
      load(1, { clearError: false });
    } finally {
      setImporting(false);
      setImportProgress(null);
      event.target.value = '';
    }
  };

  const toggleAsset = (assetId: string) => {
    setExpandedAssetIds((ids) => (
      ids.includes(assetId) ? ids.filter((id) => id !== assetId) : [...ids, assetId]
    ));
  };

  const handleResolution = async () => {
    setResolving(true);
    setMsg(null);
    setError(null);
    try {
      const result = await runProductResolution();
      setMsg(`Resolved ${result.components_processed.toLocaleString()} components: ${result.resolved_count} resolved, ${result.unknown_count} unknown, ${result.ambiguous_count} ambiguous.`);
      load(page, { clearError: false });
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setResolving(false);
    }
  };

  const handleAssetKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, assetId: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleAsset(assetId);
    }
  };

  return (
    <div className="space-y-4">
      <CompactKpiStrip>
        <CompactKpi label="Assets" value={formatNumber(stats?.total_assets)} />
        <CompactKpi label="Components" value={formatNumber(stats?.total_components)} />
        <CompactKpi label="With CPE" value={formatNumber(stats?.components_with_cpe)} />
        <CompactKpi label="Scored" value={formatNumber(stats?.scored_assets)} />
        <CompactKpi label="A0 assets" value={formatNumber(stats?.priority_distribution.A0 ?? 0)} tone="critical" />
        <CompactKpi label="Internet-facing" value={formatNumber(stats?.exposure_distribution.internet ?? 0)} tone="high" />
        <CompactKpi label="Critical assets" value={formatNumber(stats?.criticality_distribution.critical ?? 0)} tone="critical" />
      </CompactKpiStrip>

      {msg && <div className="notice-info" role="status">{msg}</div>}
      {error && <div className="notice-error whitespace-pre-line" role="alert">{error}</div>}

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Asset inventory</h2>
            <p className="panel-subtitle">Select a row to inspect its components, CPEs and product resolution.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={priority}
              onChange={(event) => {
                setPriority(event.target.value);
                setPage(1);
              }}
              className="field py-1 text-xs"
              aria-label="Filter by priority"
            >
              <option value="">All priorities</option>
              {['A0', 'A1', 'A2', 'A3'].map((level) => <option key={level} value={level}>{level}</option>)}
            </select>
            <button type="button" onClick={handleResolution} disabled={resolving || importing} className="btn-secondary btn-sm">
              {resolving ? 'Resolving products…' : 'Resolve products'}
            </button>
            <label className={`btn-primary btn-sm cursor-pointer ${importing ? 'pointer-events-none opacity-50' : ''}`}>
              {importing && importProgress ? `Importing ${importProgress.current}/${importProgress.total}…` : 'Import CycloneDX JSON'}
              <input type="file" accept="application/json,.json" className="hidden" onChange={handleFile} disabled={importing} multiple />
            </label>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table w-full">
            <thead>
              <tr>
                {['Asset', 'Priority', 'Score', 'Confidence', 'Exposure', 'Criticality', 'Patch complexity', 'Components', 'CPEs'].map((label, index) => (
                  <th key={label} className={index >= 2 && index <= 3 || index >= 7 ? '!text-right' : ''}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="py-12 text-center text-gray-500">Loading…</td></tr>
              ) : assets.length === 0 ? (
                <tr><td colSpan={9} className="py-12 text-center text-gray-500">No assets imported yet.</td></tr>
              ) : assets.map((asset) => {
                const expanded = expandedAssetIds.includes(asset.id);
                return (
                  <Fragment key={asset.id}>
                    <tr
                      className={`cursor-pointer ${expanded ? 'bg-gray-50' : ''}`}
                      role="button"
                      tabIndex={0}
                      aria-expanded={expanded}
                      onClick={() => toggleAsset(asset.id)}
                      onKeyDown={(event) => handleAssetKeyDown(event, asset.id)}
                    >
                      <td>
                        <div className="flex items-start gap-2">
                          <ChevronRight className={`mt-0.5 h-4 w-4 shrink-0 text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                          <div className="min-w-0">
                            <div className="font-medium text-gray-900">{asset.name}</div>
                            <div className="truncate font-mono text-[11px] text-gray-500">{asset.external_id}</div>
                          </div>
                        </div>
                      </td>
                      <td>{asset.priority_level ? <PriorityBadge level={asset.priority_level} /> : <span className="text-gray-400">—</span>}</td>
                      <td className="text-right font-mono text-gray-800">{formatScore(asset.priority_score)}</td>
                      <td className="text-right font-mono text-gray-500">{formatScore(asset.priority_confidence)}</td>
                      <td className="text-gray-700">{EXPOSURE_LABELS[asset.internet_exposure] ?? asset.internet_exposure}</td>
                      <td className="capitalize text-gray-700">{asset.business_criticality}</td>
                      <td className="capitalize text-gray-700">{asset.patch_complexity}</td>
                      <td className="text-right font-mono text-gray-700">{asset.component_count.toLocaleString()}</td>
                      <td className="text-right font-mono text-gray-700">{asset.cpe_count.toLocaleString()}</td>
                    </tr>
                    {expanded && (
                      <tr className="bg-gray-50 hover:!bg-gray-50">
                        <td colSpan={9} className="!px-4 !py-4">
                          <AssetComponents asset={asset} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        <Pagination page={page} perPage={25} total={total} onChange={setPage} />
      </section>
    </div>
  );
}

function AssetComponents({ asset }: { asset: Asset }) {
  if (asset.components.length === 0) {
    return (
      <div className="border border-dashed border-gray-300 bg-white px-4 py-6 text-center text-[13px] text-gray-500">
        No components were imported for this asset.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <h3 className="label-caps text-gray-700">Components and CPEs</h3>
          <p className="text-xs text-gray-500">
            {asset.component_count.toLocaleString()} components, {asset.cpe_count.toLocaleString()} with CPE identifiers
          </p>
        </div>
        <div className="font-mono text-xs text-gray-500">
          CPE coverage {asset.component_count === 0 ? '0.0' : ((asset.cpe_count / asset.component_count) * 100).toFixed(1)}%
        </div>
      </div>

      <div className="max-h-96 overflow-auto border border-gray-300 bg-white">
        <table className="data-table w-full">
          <thead className="sticky top-0">
            <tr>
              {['Component', 'Version', 'Vendor / product', 'Canonical product', 'Resolution', 'CPE'].map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {asset.components.map((component) => (
              <ComponentRow key={component.id} component={component} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ComponentRow({ component }: { component: AssetComponent }) {
  return (
    <tr className="align-top">
      <td>
        <div className="font-medium text-gray-900">{component.name}</div>
        {component.bom_ref && <div className="max-w-xs truncate font-mono text-[11px] text-gray-500">{component.bom_ref}</div>}
        {component.purl && <div className="max-w-xs truncate font-mono text-[11px] text-gray-500">{component.purl}</div>}
      </td>
      <td className="font-mono text-gray-700">{component.version ?? '—'}</td>
      <td className="text-gray-700">
        <div>{component.vendor ?? component.cpe_vendor ?? '-'}</div>
        <div className="text-xs text-gray-500">{component.product ?? component.cpe_product ?? '-'}</div>
      </td>
      <td className="text-gray-700">
        {component.latest_resolution?.resolved_product ? (
          <div><div className="font-medium">{component.latest_resolution.resolved_product.key}</div><div className="text-xs text-gray-500">{component.latest_resolution.resolved_product.vendor} / {component.latest_resolution.resolved_product.canonical_name}</div></div>
        ) : <span className="text-gray-400">—</span>}
      </td>
      <td className="text-xs text-gray-700">
        <ResolutionCell component={component} />
      </td>
      <td>
        {component.cpe ? (
          <div className="space-y-1">
            <code className="block max-w-xl break-all border border-gray-200 bg-gray-50 px-2 py-1 font-mono text-[11px] text-gray-800">
              {component.cpe}
            </code>
            <div className="flex flex-wrap gap-1 text-xs text-gray-500">
              {component.cpe_vendor && <span className="border border-gray-200 px-1.5 font-mono text-[11px]">vendor: {component.cpe_vendor}</span>}
              {component.cpe_product && <span className="border border-gray-200 px-1.5 font-mono text-[11px]">product: {component.cpe_product}</span>}
              {component.cpe_version && <span className="border border-gray-200 px-1.5 font-mono text-[11px]">version: {component.cpe_version}</span>}
            </div>
          </div>
        ) : (
          <span className="text-gray-400">No CPE</span>
        )}
      </td>
    </tr>
  );
}

const RESOLUTION_TONES: Record<string, StatusTone> = { resolved: 'positive', ambiguous: 'warning', unknown: 'muted' };

function ResolutionCell({ component }: { component: AssetComponent }) {
  const resolution = component.latest_resolution;
  if (!resolution) return <span className="text-gray-400">Not run</span>;
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <StatusTag tone={RESOLUTION_TONES[resolution.status] ?? 'neutral'}>{resolution.status}</StatusTag>
        {resolution.confidence != null && <span className="font-mono text-gray-500">{resolution.confidence}%</span>}
      </div>
      {resolution.status === 'ambiguous' && <div className="max-w-xs text-gray-600">Candidates: {resolution.candidates.items.map((item) => item.product_key).join(', ')}</div>}
      <div className="max-w-xs font-mono text-[11px] text-gray-400">{resolution.evidence.signals.map((signal) => signal.kind).join(', ') || resolution.confidence_basis}</div>
    </div>
  );
}

function formatScore(value: number | null): string {
  return value == null ? '—' : value.toFixed(1);
}

function formatNumber(value: number | undefined): string {
  return value == null ? '...' : value.toLocaleString();
}
