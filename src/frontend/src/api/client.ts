// --- Response types ---

export interface Vulnerability {
  id: string;
  cve_id: string;
  summary: string | null;
  published_date: string | null;
  last_modified_date: string | null;
  cvss_v2_score: number | null;
  cvss_v2_severity: string | null;
  cvss_v30_score: number | null;
  cvss_v30_severity: string | null;
  cvss_v31_score: number | null;
  cvss_v31_severity: string | null;
  cvss_v40_score: number | null;
  cvss_v40_severity: string | null;
  epss_score: number | null;
  epss_percentile: number | null;
  epss_date: string | null;
  kev_known_exploited: boolean | null;
  kev_date_added: string | null;
  kev_ransomware_use: boolean | null;
  euvd_id: string | null;
  euvd_exploitation: string | null;
  priority_level: string | null;
  priority_score: number | null;
  priority_confidence: number | null;
  updated_at: string | null;
  created_at: string | null;
}

export interface VulnerabilityDetail extends Vulnerability {
  description: string | null;
  nvd_source_url: string | null;
  cvss_v2_vector: string | null;
  cvss_v30_vector: string | null;
  cvss_v31_vector: string | null;
  cvss_v40_vector: string | null;
  cwe_ids: string[] | null;
  affected_products: Array<{ cpe: string; version_start?: string; version_end?: string }> | null;
  references: Array<{ url: string; source?: string; tags?: string[] }> | null;
  kev_due_date: string | null;
  kev_notes: string | null;
  euvd_source_url: string | null;
  sources_raw: Record<string, unknown> | null;
}

export interface PaginatedVulnerabilities {
  total: number;
  page: number;
  per_page: number;
  items: Vulnerability[];
}

export interface VulnerabilityStats {
  total: number;
  kev_count: number;
  epss_covered: number;
  avg_epss_score: number | null;
  severity_distribution: Record<string, number>;
}

export interface IngestionLog {
  id: string;
  source: string;
  trigger_type: string | null;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  records_processed: number | null;
  records_created: number | null;
  records_updated: number | null;
  error_message: string | null;
  progress: number | null;
}

export interface PaginatedIngestionLogs {
  total: number;
  page: number;
  per_page: number;
  items: IngestionLog[];
}

export interface TriggerResponse {
  status: string;
  source: string;
}

// --- Scoring types ---

export interface ColumnConfig {
  enabled: boolean;
  weight: number;
  type: 'numeric' | 'boolean' | 'categorical';
  label?: string;
  range?: [number, number];
  values?: Record<string, number>;
  default_value: number;
  fallbacks?: string[];
}

export interface EligibleColumn {
  type: 'numeric' | 'boolean' | 'categorical';
  range?: [number, number];
  label: string;
  group?: string;
}

export interface ScoringProfile {
  columns: Record<string, ColumnConfig>;
  thresholds: Record<string, number>;
}

export interface ScoringRunResponse {
  rows_updated: number;
  distribution: Record<string, number>;
}

export interface ScoreDistribution {
  priority_counts: Record<string, number>;
  score_histogram: Array<{ bucket: string; count: number }>;
  confidence_histogram: Array<{ bucket: string; count: number }>;
  scored_count: number;
  unscored_count: number;
}

// --- Internal helpers ---

type QueryParams = Record<string, string | number | boolean | null | undefined>;

const API_BASE = '/api/v1';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err: { detail?: string } = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || res.statusText);
  }
  return res.json() as Promise<T>;
}

function toQuery(params: QueryParams): string {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== '' && v !== false) qs.set(k, String(v));
  });
  const str = qs.toString();
  return str ? `?${str}` : '';
}

// --- Public API functions ---

export function fetchVulnerabilities(params: QueryParams = {}, signal?: AbortSignal): Promise<PaginatedVulnerabilities> {
  return request<PaginatedVulnerabilities>(`/vulnerabilities${toQuery(params)}`, { signal });
}

export function fetchVulnerability(cveId: string, signal?: AbortSignal): Promise<VulnerabilityDetail> {
  return request<VulnerabilityDetail>(`/vulnerabilities/${encodeURIComponent(cveId)}`, { signal });
}

export function fetchStats(): Promise<VulnerabilityStats> {
  return request<VulnerabilityStats>('/vulnerabilities/stats');
}

export function triggerIngestion(source: string): Promise<TriggerResponse> {
  return request<TriggerResponse>('/ingestion/trigger', {
    method: 'POST',
    body: JSON.stringify({ source }),
  });
}

export function fetchIngestionStatus(): Promise<IngestionLog[]> {
  return request<IngestionLog[]>('/ingestion/status');
}

export function cancelIngestion(source: string): Promise<TriggerResponse> {
  return request<TriggerResponse>('/ingestion/cancel', {
    method: 'POST',
    body: JSON.stringify({ source }),
  });
}

export function fetchIngestionLogs(params: QueryParams = {}): Promise<PaginatedIngestionLogs> {
  return request<PaginatedIngestionLogs>(`/ingestion/logs${toQuery(params)}`);
}

export function fetchSettings(): Promise<Record<string, string>> {
  return request<Record<string, string>>('/settings');
}

export function updateSetting(key: string, value: string): Promise<Record<string, string>> {
  return request<Record<string, string>>(`/settings/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: JSON.stringify({ value }),
  });
}

// --- Scoring API functions ---

export function fetchScoringProfile(): Promise<ScoringProfile> {
  return request<ScoringProfile>('/scoring/profile');
}

export function resetScoringProfile(): Promise<ScoringProfile> {
  return request<ScoringProfile>('/scoring/profile', { method: 'DELETE' });
}

export function saveScoringProfile(profile: ScoringProfile): Promise<ScoringProfile> {
  return request<ScoringProfile>('/scoring/profile', {
    method: 'PUT',
    body: JSON.stringify(profile),
  });
}

export function runScoring(): Promise<ScoringRunResponse> {
  return request<ScoringRunResponse>('/scoring/run', { method: 'POST' });
}

export function fetchColumnValues(column: string): Promise<{ column: string; values: string[] }> {
  return request<{ column: string; values: string[] }>(`/scoring/column-values/${encodeURIComponent(column)}`);
}

export function fetchScoreDistribution(): Promise<ScoreDistribution> {
  return request<ScoreDistribution>('/scoring/distribution');
}

export function fetchEligibleColumns(): Promise<Record<string, EligibleColumn>> {
  return request<Record<string, EligibleColumn>>('/scoring/eligible-columns');
}
