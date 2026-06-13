import { ChangeEvent, Fragment, KeyboardEvent, useEffect, useState } from 'react';
import {
  Asset,
  AssetComponent,
  AssetStats,
  fetchAssets,
  fetchAssetStats,
  importCycloneDXAsset,
} from '../api/client';
import { getErrorMessage } from '../lib/utils';
import CompactKpi, { CompactKpiStrip } from './CompactKpi';
import Pagination from './Pagination';
import { PRIORITY_COLORS } from './scoring/helpers';

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

  const handleAssetKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, assetId: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleAsset(assetId);
    }
  };

  return (
    <div className="space-y-5">
      <CompactKpiStrip>
        <CompactKpi label="Assets" value={formatNumber(stats?.total_assets)} />
        <CompactKpi label="Components" value={formatNumber(stats?.total_components)} />
        <CompactKpi label="With CPE" value={formatNumber(stats?.components_with_cpe)} />
        <CompactKpi label="Scored" value={formatNumber(stats?.scored_assets)} />
        <CompactKpi label="A0 assets" value={formatNumber(stats?.priority_distribution.A0 ?? 0)} tone="red" />
        <CompactKpi label="Internet-facing" value={formatNumber(stats?.exposure_distribution.internet ?? 0)} tone="orange" />
        <CompactKpi label="Critical assets" value={formatNumber(stats?.criticality_distribution.critical ?? 0)} tone="red" />
      </CompactKpiStrip>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Assets</h2>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            value={priority}
            onChange={(event) => {
              setPriority(event.target.value);
              setPage(1);
            }}
            className="rounded-md border-gray-300 text-sm focus:border-gray-500 focus:ring-gray-500"
          >
            <option value="">All priorities</option>
            {['A0', 'A1', 'A2', 'A3'].map((level) => <option key={level} value={level}>{level}</option>)}
          </select>
          <label className="inline-flex items-center justify-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 cursor-pointer">
            {importing && importProgress ? `Importing ${importProgress.current}/${importProgress.total}...` : 'Import CycloneDX JSON'}
            <input type="file" accept="application/json,.json" className="hidden" onChange={handleFile} disabled={importing} multiple />
          </label>
        </div>
      </div>

      {msg && <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{msg}</div>}
      {error && <div className="whitespace-pre-line p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              {['Asset', 'Priority', 'Score', 'Confidence', 'Exposure', 'Criticality', 'Patch Complexity', 'Components', 'CPEs'].map((label) => (
                <th key={label} className="px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="px-3 py-12 text-center text-gray-400">Loading...</td></tr>
            ) : assets.length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-12 text-center text-gray-400">No assets imported yet.</td></tr>
            ) : assets.map((asset) => (
              <Fragment key={asset.id}>
                <tr
                  className={`cursor-pointer border-b border-gray-100 transition-colors ${
                    expandedAssetIds.includes(asset.id) ? 'bg-gray-50' : 'hover:bg-gray-50'
                  }`}
                  role="button"
                  tabIndex={0}
                  aria-expanded={expandedAssetIds.includes(asset.id)}
                  onClick={() => toggleAsset(asset.id)}
                  onKeyDown={(event) => handleAssetKeyDown(event, asset.id)}
                >
                  <td className="px-3 py-3">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-gray-300 text-xs font-semibold text-gray-500">
                        {expandedAssetIds.includes(asset.id) ? '-' : '+'}
                      </span>
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900">{asset.name}</div>
                        <div className="truncate text-xs text-gray-500">{asset.external_id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-sm">
                    <PriorityBadge level={asset.priority_level} />
                  </td>
                  <td className="px-3 py-3 text-sm font-mono text-gray-700">{formatScore(asset.priority_score)}</td>
                  <td className="px-3 py-3 text-sm font-mono text-gray-700">{formatScore(asset.priority_confidence)}</td>
                  <td className="px-3 py-3 text-sm text-gray-700">{EXPOSURE_LABELS[asset.internet_exposure] ?? asset.internet_exposure}</td>
                  <td className="px-3 py-3 text-sm text-gray-700 capitalize">{asset.business_criticality}</td>
                  <td className="px-3 py-3 text-sm text-gray-700 capitalize">{asset.patch_complexity}</td>
                  <td className="px-3 py-3 text-sm text-gray-700">{asset.component_count.toLocaleString()}</td>
                  <td className="px-3 py-3 text-sm text-gray-700">{asset.cpe_count.toLocaleString()}</td>
                </tr>
                {expandedAssetIds.includes(asset.id) && (
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <td colSpan={9} className="px-3 py-4">
                      <AssetComponents asset={asset} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination page={page} perPage={25} total={total} onChange={setPage} />
    </div>
  );
}

function AssetComponents({ asset }: { asset: Asset }) {
  if (asset.components.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-gray-300 bg-white px-4 py-6 text-center text-sm text-gray-500">
        No components were imported for this asset.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Components and CPEs</h3>
          <p className="text-xs text-gray-500">
            {asset.component_count.toLocaleString()} components, {asset.cpe_count.toLocaleString()} with CPE identifiers
          </p>
        </div>
        <div className="text-xs text-gray-500">
          CPE coverage {asset.component_count === 0 ? '0.0' : ((asset.cpe_count / asset.component_count) * 100).toFixed(1)}%
        </div>
      </div>

      <div className="max-h-96 overflow-auto rounded-md border border-gray-200 bg-white">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-white shadow-sm">
            <tr>
              {['Component', 'Version', 'Vendor / Product', 'CPE'].map((label) => (
                <th key={label} className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  {label}
                </th>
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
    <tr className="border-t border-gray-100 align-top">
      <td className="px-3 py-2 text-sm">
        <div className="font-medium text-gray-900">{component.name}</div>
        {component.bom_ref && <div className="max-w-xs truncate text-xs text-gray-500">{component.bom_ref}</div>}
        {component.purl && <div className="max-w-xs truncate text-xs text-gray-500">{component.purl}</div>}
      </td>
      <td className="px-3 py-2 text-sm text-gray-700">{component.version ?? '-'}</td>
      <td className="px-3 py-2 text-sm text-gray-700">
        <div>{component.vendor ?? component.cpe_vendor ?? '-'}</div>
        <div className="text-xs text-gray-500">{component.product ?? component.cpe_product ?? '-'}</div>
      </td>
      <td className="px-3 py-2 text-sm">
        {component.cpe ? (
          <div className="space-y-1">
            <code className="block max-w-xl break-all rounded bg-gray-100 px-2 py-1 text-xs text-gray-800">
              {component.cpe}
            </code>
            <div className="flex flex-wrap gap-1 text-xs text-gray-500">
              {component.cpe_vendor && <span className="rounded bg-gray-100 px-1.5 py-0.5">vendor: {component.cpe_vendor}</span>}
              {component.cpe_product && <span className="rounded bg-gray-100 px-1.5 py-0.5">product: {component.cpe_product}</span>}
              {component.cpe_version && <span className="rounded bg-gray-100 px-1.5 py-0.5">version: {component.cpe_version}</span>}
            </div>
          </div>
        ) : (
          <span className="text-gray-400">No CPE</span>
        )}
      </td>
    </tr>
  );
}

function PriorityBadge({ level }: { level: string | null }) {
  if (!level) return <span className="text-gray-400">-</span>;
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${PRIORITY_COLORS[level]?.badge ?? 'bg-gray-100 text-gray-600'}`}>
      {level}
    </span>
  );
}

function formatScore(value: number | null): string {
  return value == null ? '-' : value.toFixed(1);
}

function formatNumber(value: number | undefined): string {
  return value == null ? '...' : value.toLocaleString();
}
